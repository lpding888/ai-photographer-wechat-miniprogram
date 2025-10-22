/**
 * 图片处理模块
 * 负责：图片下载、格式转换、尺寸校验
 */

const cloud = require('wx-server-sdk')
const axios = require('axios')

class ImageProcessor {
  constructor() {
    this.supportedFormats = ['jpg', 'jpeg', 'png', 'webp']
    this.maxFileSize = 10 * 1024 * 1024 // 10MB
    this.maxImageSize = 4096 // 4K分辨率
  }

  /**
   * 从云存储下载图片并转为base64
   * @param {string|Array} fileIds - 文件ID或ID数组
   * @returns {Array} 处理后的图片数组
   */
  async downloadAndConvert(fileIds) {
    const ids = Array.isArray(fileIds) ? fileIds : [fileIds]
    const results = []

    console.log(`🖼️ 开始处理 ${ids.length} 张图片`)

    for (let i = 0; i < ids.length; i++) {
      const fileId = ids[i]
      console.log(`📥 处理第${i+1}张图片: ${fileId}`)

      try {
        const imageData = await this.downloadSingleImage(fileId)
        const validatedData = await this.validateImage(imageData)

        results.push({
          fileId: fileId,
          base64Data: validatedData.base64,
          base64Url: validatedData.dataUrl,
          mimeType: validatedData.mimeType,
          size: validatedData.size,
          width: validatedData.width,
          height: validatedData.height,
          status: 'success',
          index: i
        })

        console.log(`✅ 第${i+1}张图片处理成功，大小: ${Math.round(validatedData.size/1024)}KB, 尺寸: ${validatedData.width}x${validatedData.height}`)

      } catch (error) {
        console.error(`❌ 第${i+1}张图片处理失败:`, error.message)

        results.push({
          fileId: fileId,
          status: 'failed',
          error: error.message,
          index: i
        })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    console.log(`📊 图片处理完成: 总数 ${ids.length}, 成功 ${successCount}, 失败 ${ids.length - successCount}`)

    return results
  }

  /**
   * 下载单张图片
   * @param {string} fileId - 云存储文件ID
   * @returns {Object} 图片数据
   */
  async downloadSingleImage(fileId) {
    try {
      // 检查是否是base64预处理模式的文件
      if (await this.isBase64PreprocessedFile(fileId)) {
        console.log(`🔄 检测到base64预处理文件，直接读取`)
        return await this.readBase64PreprocessedFile(fileId)
      }

      // 传统模式：获取临时URL并下载
      console.log(`🔗 获取临时下载URL: ${fileId}`)
      const tempUrlResult = await cloud.getTempFileURL({
        fileList: [fileId]
      })

      if (!tempUrlResult.fileList || !tempUrlResult.fileList[0] || tempUrlResult.fileList[0].status !== 0) {
        throw new Error('无法获取文件临时URL')
      }

      const tempUrl = tempUrlResult.fileList[0].tempFileURL
      console.log(`📡 开始下载图片: ${tempUrl.substring(0, 100)}...`)

      const response = await axios({
        method: 'GET',
        url: tempUrl,
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      const buffer = Buffer.from(response.data)
      const base64Data = buffer.toString('base64')
      const mimeType = response.headers['content-type'] || 'image/jpeg'

      return {
        buffer: buffer,
        base64: base64Data,
        mimeType: mimeType,
        size: buffer.length
      }

    } catch (error) {
      console.error(`下载图片失败 ${fileId}:`, error.message)
      throw new Error(`图片下载失败: ${error.message}`)
    }
  }

  /**
   * 检查是否是base64预处理文件
   */
  async isBase64PreprocessedFile(fileId) {
    try {
      // 尝试下载文件的前100字节检查是否是base64格式
      const downloadResult = await cloud.downloadFile({
        fileID: fileId
      })

      const content = downloadResult.fileContent.toString('utf8', 0, 100)
      return content.startsWith('data:image/')
    } catch (error) {
      return false
    }
  }

  /**
   * 读取base64预处理文件
   */
  async readBase64PreprocessedFile(fileId) {
    const downloadResult = await cloud.downloadFile({
      fileID: fileId
    })

    const fileContent = downloadResult.fileContent.toString('utf8')
    const matches = fileContent.match(/^data:image\/([^;]+);base64,(.+)$/)

    if (!matches) {
      throw new Error('base64预处理文件格式错误')
    }

    const [, format, base64Data] = matches
    const mimeType = `image/${format}`
    const buffer = Buffer.from(base64Data, 'base64')

    return {
      buffer: buffer,
      base64: base64Data,
      mimeType: mimeType,
      size: buffer.length
    }
  }

  /**
   * 验证图片格式和大小
   * @param {Object} imageData - 图片数据
   * @returns {Object} 验证后的图片数据
   */
  async validateImage(imageData) {
    const { buffer, base64, mimeType, size } = imageData

    // 验证文件大小
    if (size > this.maxFileSize) {
      throw new Error(`图片文件过大: ${Math.round(size/1024/1024)}MB, 最大允许: ${this.maxFileSize/1024/1024}MB`)
    }

    // 验证MIME类型
    const format = this.extractFormatFromMimeType(mimeType)
    if (!this.supportedFormats.includes(format)) {
      throw new Error(`不支持的图片格式: ${format}, 支持的格式: ${this.supportedFormats.join(', ')}`)
    }

    // 获取图片尺寸（简单实现，基于文件头）
    const dimensions = await this.getImageDimensions(buffer)

    // 验证图片尺寸
    if (dimensions.width > this.maxImageSize || dimensions.height > this.maxImageSize) {
      throw new Error(`图片尺寸过大: ${dimensions.width}x${dimensions.height}, 最大允许: ${this.maxImageSize}x${this.maxImageSize}`)
    }

    const dataUrl = `data:${mimeType};base64,${base64}`

    return {
      base64: base64,
      dataUrl: dataUrl,
      mimeType: mimeType,
      format: format,
      size: size,
      width: dimensions.width,
      height: dimensions.height
    }
  }

  /**
   * 从MIME类型提取格式
   */
  extractFormatFromMimeType(mimeType) {
    if (!mimeType) return 'unknown'

    const match = mimeType.match(/image\/(.+)/)
    return match ? match[1].toLowerCase() : 'unknown'
  }

  /**
   * 获取图片尺寸（简化实现）
   * @param {Buffer} buffer - 图片buffer
   * @returns {Object} 图片尺寸
   */
  async getImageDimensions(buffer) {
    try {
      // 这里可以使用更专业的图片解析库，暂时返回默认值
      // 实际项目中建议使用 sharp 或 image-size 库
      return {
        width: 1024,
        height: 1024
      }
    } catch (error) {
      console.warn('无法获取图片尺寸，使用默认值:', error.message)
      return {
        width: 1024,
        height: 1024
      }
    }
  }

  /**
   * 批量处理图片的统计信息
   * @param {Array} results - 处理结果数组
   * @returns {Object} 统计信息
   */
  getProcessingStats(results) {
    const total = results.length
    const successful = results.filter(r => r.status === 'success').length
    const failed = total - successful
    const totalSize = results
      .filter(r => r.status === 'success')
      .reduce((sum, r) => sum + r.size, 0)

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(1) + '%' : '0%',
      totalSizeKB: Math.round(totalSize / 1024),
      averageSizeKB: successful > 0 ? Math.round(totalSize / successful / 1024) : 0
    }
  }
}

module.exports = ImageProcessor