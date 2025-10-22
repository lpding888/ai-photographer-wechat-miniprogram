// 文件上传工具类
const apiService = require('./api.js')

class UploadService {
  constructor() {
    this.maxFileSize = 10 * 1024 * 1024 // 10MB
    this.allowedTypes = ['jpg', 'jpeg', 'png', 'webp']
  }

  /**
   * 选择并上传图片
   * @param {Object} options 选项
   * @param {number} options.count 选择数量
   * @param {string} options.fileType 文件类型标识
   * @param {boolean} options.compress 是否压缩
   * @param {boolean} options.convertToJpeg 是否转换为JPEG格式(默认true，优化AI处理)
   */
  async chooseAndUploadImage(options = {}) {
    const {
      count = 1,
      fileType = 'image',
      compress = true,
      convertToJpeg = true
    } = options

    try {
      // 选择图片
      const chooseRes = await this.chooseImage({
        count,
        sizeType: compress ? ['compressed', 'original'] : ['original'],
        sourceType: ['album', 'camera']
      })

      if (!chooseRes.tempFilePaths || chooseRes.tempFilePaths.length === 0) {
        throw new Error('未选择图片')
      }

      // 验证图片 + 计算MD5 + JPEG转换处理
      const validFiles = []
      const fileMetas = [] // 与 validFiles 对齐：{ path, size, md5, finalPath }

      for (const filePath of chooseRes.tempFilePaths) {
        const info = await this.getFileInfoWithMd5(filePath)
        const validation = await this.validateImage(filePath)
        if (validation.valid) {
          let finalPath = filePath
          let finalSize = info.size || 0

          // JPEG转换处理
          if (convertToJpeg) {
            try {
              const jpegResult = await this.convertToJpeg(filePath)
              if (jpegResult.success) {
                finalPath = jpegResult.path
                finalSize = jpegResult.size
                console.log(`🔄 图片转换为JPEG: ${Math.round(info.size/1024)}KB → ${Math.round(finalSize/1024)}KB`)
              } else {
                console.warn('JPEG转换失败，使用原文件:', jpegResult.message)
              }
            } catch (e) {
              console.warn('JPEG转换异常，使用原文件:', e.message)
            }
          }

          validFiles.push(finalPath)
          fileMetas.push({
            path: finalPath,
            size: finalSize,
            md5: info.md5 || info.digest || '',
            originalPath: filePath
          })
        } else {
          console.warn('图片验证失败: ' + validation.message)
        }
      }

      if (validFiles.length === 0) {
        throw new Error('没有有效的图片文件')
      }

      // 上传图片（带查重）：先调用 storage.resolveAsset(md5)，命中则直接复用
      const uploadPromises = validFiles.map(async (filePath, index) => {
        const meta = fileMetas[index]
        try {
          // 1) 云端查重
          const resolveRes = await apiService.callCloudFunction('storage', {
            action: 'resolveAsset',
            md5: meta.md5,
            __noLoading: true
          })
          if (resolveRes && resolveRes.result && resolveRes.result.success && resolveRes.result.data && resolveRes.result.data.hit) {
            return {
              success: true,
              data: {
                file_id: resolveRes.result.data.file_id,
                cloud_path: 'reused://' + meta.md5
              },
              reused: true
            }
          }
        } catch (e) {
          console.warn('resolveAsset 查询失败(忽略，转上传):', e && e.message)
        }
        // 2) 未命中则真实上传
        const cloudPath = this.generateCloudPath(fileType, filePath, meta.md5)
        // 直接上传文件
        const upRes = await this.uploadSingleFile(filePath, cloudPath)

        // 3) 上传成功后登记
        if (upRes && upRes.success && upRes.data && upRes.data.file_id && meta.md5) {
          try {
            await apiService.callCloudFunction('storage', {
              action: 'registerAsset',
              md5: meta.md5,
              file_id: upRes.data.file_id,
              size: meta.size,
              storage_type: 'file',
              __noLoading: true
            })
          } catch (e) {
            console.warn('registerAsset 登记失败(忽略):', e && e.message)
          }
        }
        return upRes
      })

      const uploadResults = await Promise.allSettled(uploadPromises)
      
      // 处理上传结果
      const uploaded = []
      const failed = []

      uploadResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          uploaded.push({
            fileId: result.value.data.file_id,
            cloudPath: result.value.data.cloud_path,
            localPath: validFiles[index]
          })
        } else {
          failed.push({
            localPath: validFiles[index],
            error: result.reason || (result.value && result.value.message) || '上传失败'
          })
        }
      })

      return {
        success: uploaded.length > 0,
        data: {
          uploaded,
          failed,
          total: validFiles.length
        },
        message: '成功上传 ' + uploaded.length + '/' + validFiles.length + ' 张图片'
      }

    } catch (error) {
      console.error('选择上传图片失败:', error)
      return {
        success: false,
        message: error.message || '选择上传图片失败'
      }
    }
  }

  /**
   * 选择图片 Promise 封装
   */
  chooseImage(options) {
    return new Promise((resolve, reject) => {
      wx.chooseImage({
        ...options,
        success: resolve,
        fail: reject
      })
    })
  }

  /**
   * 验证图片文件
   */
  async validateImage(filePath) {
    try {
      // 获取文件信息
      const fileInfo = await this.getFileInfo(filePath)
      
      // 检查文件大小
      if (fileInfo.size > this.maxFileSize) {
        return {
          valid: false,
          message: '文件大小超过限制 (' + Math.round(fileInfo.size / 1024 / 1024) + 'MB > 10MB)'
        }
      }

      // 检查文件类型
      const extension = this.getFileExtension(filePath).toLowerCase()
      if (!this.allowedTypes.includes(extension)) {
        return {
          valid: false,
          message: '不支持的文件类型: ' + extension
        }
      }

      return {
        valid: true,
        message: '验证通过'
      }

    } catch (error) {
      return {
        valid: false,
        message: '文件验证失败: ' + error.message
      }
    }
  }

  /**
   * 获取文件信息（优先使用 FileSystemManager.getFileInfo，向下兼容 wx.getFileInfo）
   */
  getFileInfo(filePath) {
    return new Promise((resolve, reject) => {
      try {
        const fsm = wx.getFileSystemManager && wx.getFileSystemManager()
        if (fsm && typeof fsm.getFileInfo === 'function') {
          fsm.getFileInfo({
            filePath,
            success: (res) => {
              resolve({ size: res.size, digest: res.digest })
            },
            fail: (err) => {
              if (wx.getFileInfo) {
                wx.getFileInfo({
                  filePath,
                  success: (r) => resolve({ size: r.size, digest: r.digest }),
                  fail: reject
                })
              } else {
                reject(err)
              }
            }
          })
        } else if (wx.getFileInfo) {
          wx.getFileInfo({
            filePath,
            success: (r) => resolve({ size: r.size, digest: r.digest }),
            fail: reject
          })
        } else {
          reject(new Error('当前基础库不支持获取文件信息'))
        }
      } catch (e) {
        if (wx.getFileInfo) {
          wx.getFileInfo({
            filePath,
            success: (r) => resolve({ size: r.size, digest: r.digest }),
            fail: reject
          })
        } else {
          reject(e)
        }
      }
    })
  }

  /**
   * 获取包含 MD5 的文件信息（优先使用 digestAlgorithm: 'md5'）
   */
  getFileInfoWithMd5(filePath) {
    return new Promise((resolve, reject) => {
      try {
        const fsm = wx.getFileSystemManager && wx.getFileSystemManager()
        if (fsm && typeof fsm.getFileInfo === 'function') {
          // 尝试请求 md5
          fsm.getFileInfo({
            filePath,
            digestAlgorithm: 'md5',
            success: (res) => {
              resolve({ size: res.size, md5: res.digest || '' })
            },
            fail: async () => {
              // 回退到不带算法，再返回 size
              try {
                const base = await this.getFileInfo(filePath)
                resolve({ size: base.size || 0, md5: base.digest || '' })
              } catch (e) {
                reject(e)
              }
            }
          })
        } else {
          // 回退
          this.getFileInfo(filePath).then((base) => {
            resolve({ size: base.size || 0, md5: base.digest || '' })
          }).catch(reject)
        }
      } catch (e) {
        this.getFileInfo(filePath).then((base) => {
          resolve({ size: base.size || 0, md5: base.digest || '' })
        }).catch(reject)
      }
    })
  }

  /**
   * 获取文件扩展名
   */
  getFileExtension(filePath) {
    const lastDotIndex = filePath.lastIndexOf('.')
    return lastDotIndex !== -1 ? filePath.substring(lastDotIndex + 1) : ''
  }

  /**
   * 生成云存储路径
   */
  generateCloudPath(fileType, filePath, md5) {
    const extension = this.getFileExtension(filePath)
    // 固定以 md5 作为目录，避免重复副本
    return 'assets/' + fileType + '/' + (md5 || 'na') + '/' + (md5 || Date.now().toString(36)) + '.' + extension
  }

  /**
   * 上传单个文件
   */
  async uploadSingleFile(filePath, cloudPath) {
    try {
      const result = await apiService.uploadFile(filePath, cloudPath)
      return result
    } catch (error) {
      console.error('上传文件失败:', error)
      return {
        success: false,
        message: error.message || '上传失败'
      }
    }
  }

  /**
   * 批量删除云存储文件
   */
  async deleteCloudFiles(fileIds) {
    try {
      const deletePromises = fileIds.map(fileId => 
        wx.cloud.deleteFile({
          fileList: [fileId]
        })
      )

      const results = await Promise.allSettled(deletePromises)
      
      const deleted = []
      const failed = []

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.fileList[0].status === 0) {
          deleted.push(fileIds[index])
        } else {
          failed.push({
            fileId: fileIds[index],
            error: result.reason || '删除失败'
          })
        }
      })

      return {
        success: deleted.length > 0,
        data: { deleted, failed },
        message: '成功删除 ' + deleted.length + '/' + fileIds.length + ' 个文件'
      }

    } catch (error) {
      console.error('删除云存储文件失败:', error)
      return {
        success: false,
        message: error.message || '删除文件失败'
      }
    }
  }

  /**
   * 获取临时文件URL（用于预览）
   * 自动为 AI 生成的图片添加水印
   */
  async getTempFileURL(fileIds) {
    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: fileIds.map(fileId => ({ fileID: fileId }))
      })

      const urls = {}
      res.fileList.forEach(file => {
        if (file.status === 0) {
          let tempUrl = file.tempFileURL

          // 自动为 AI 生成的图片添加水印（photography/fitting 路径）
          if (tempUrl.includes('/photography/') || tempUrl.includes('/fitting/')) {
            // 构建水印参数（使用预编码的base64）
            const watermarkText = 'QUkgR2VuZXJhdGVk';  // "AI Generated" 的 base64
            const watermarkParams = [
              'watermark/2',               // 文字水印
              `text/${watermarkText}`,     // 水印文字
              'fill/I0ZGRkZGRg==',        // 白色 (#FFFFFF)
              'fontsize/32',               // 字体大小
              'gravity/southeast',         // 右下角
              'dx/20',                     // 水平偏移
              'dy/20'                      // 垂直偏移
            ].join('/');

            // 添加imageMogr2参数
            tempUrl += `?imageMogr2/${watermarkParams}`;
          }

          urls[file.fileID] = tempUrl
        }
      })

      return {
        success: true,
        data: urls
      }

    } catch (error) {
      console.error('获取临时文件URL失败:', error)
      return {
        success: false,
        message: error.message || '获取文件URL失败'
      }
    }
  }

  /**
   * 将本地图片转换为base64格式
   */
  convertToBase64(filePath) {
    return new Promise((resolve, reject) => {
      try {
        const fsm = wx.getFileSystemManager()
        if (fsm && typeof fsm.readFile === 'function') {
          fsm.readFile({
            filePath,
            encoding: 'base64',
            success: (res) => {
              // 获取文件扩展名来确定MIME类型
              const ext = this.getFileExtension(filePath).toLowerCase()
              const mimeType = this.getMimeType(ext)
              const base64String = `data:${mimeType};base64,${res.data}`
              resolve(base64String)
            },
            fail: reject
          })
        } else {
          reject(new Error('当前基础库不支持文件系统API'))
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
   * 根据文件扩展名获取MIME类型
   */
  getMimeType(extension) {
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif'
    }
    return mimeTypes[extension] || 'image/jpeg'
  }

  /**
   * 上传base64字符串到云存储
   */
  async uploadBase64String(base64String, cloudPath) {
    try {
      // 从base64字符串中提取二进制数据
      const matches = base64String.match(/^data:([^;]+);base64,(.+)$/)
      if (!matches) {
        throw new Error('无效的base64格式')
      }

      const [, mimeType, base64Data] = matches

      // 将base64转换为ArrayBuffer
      const binaryString = wx.base64ToArrayBuffer ?
        wx.base64ToArrayBuffer(base64Data) :
        this.base64ToArrayBuffer(base64Data)

      const result = await apiService.uploadFile(binaryString, cloudPath)
      return result
    } catch (error) {
      console.error('上传base64失败:', error)
      return {
        success: false,
        message: error.message || 'base64上传失败'
      }
    }
  }

  /**
   * 手动实现base64转ArrayBuffer（兼容性处理）
   */
  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  /**
   * 将图片转换为JPEG格式（优化AI处理）
   * 注意：此方法需要页面调用，因为依赖wx.compressImage API
   */
  async convertToJpeg(filePath) {
    return new Promise((resolve) => {
      try {
        const ext = this.getFileExtension(filePath).toLowerCase()

        // 如果已经是JPEG格式，直接返回
        if (ext === 'jpg' || ext === 'jpeg') {
          this.getFileInfo(filePath).then(info => {
            resolve({
              success: true,
              path: filePath,
              size: info.size || 0,
              converted: false
            })
          }).catch(() => {
            resolve({
              success: true,
              path: filePath,
              size: 0,
              converted: false
            })
          })
          return
        }

        // 使用微信压缩API进行格式转换（更安全，不依赖canvas元素）
        wx.compressImage({
          src: filePath,
          quality: 92, // 92%质量
          compressedWidth: undefined, // 保持原始尺寸
          compressedHeight: undefined, // 保持原始尺寸
          success: (res) => {
            // 压缩API默认输出JPEG格式
            this.getFileInfo(res.tempFilePath).then(info => {
              console.log(`🔄 图片格式转换: ${ext} → JPEG, 大小: ${Math.round((info.size || 0)/1024)}KB`)
              resolve({
                success: true,
                path: res.tempFilePath,
                size: info.size || 0,
                converted: true
              })
            }).catch(() => {
              resolve({
                success: true,
                path: res.tempFilePath,
                size: 0,
                converted: true
              })
            })
          },
          fail: (error) => {
            console.warn('图片格式转换失败:', error)
            resolve({
              success: false,
              message: '格式转换失败: ' + (error.errMsg || '未知错误')
            })
          }
        })
      } catch (error) {
        console.warn('JPEG转换异常:', error)
        resolve({
          success: false,
          message: 'JPEG转换异常: ' + error.message
        })
      }
    })
  }
}

// 创建单例实例
const uploadService = new UploadService()

module.exports = uploadService