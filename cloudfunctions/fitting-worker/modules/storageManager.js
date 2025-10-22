/**
 * 云存储管理模块
 * 负责：文件上传下载、路径管理、清理
 */

const cloud = require('wx-server-sdk')

class StorageManager {
  constructor() {
    this.retryCount = 3
    this.retryDelay = 1000 // 1秒
    this.concurrencyLimit = 5 // 并发上传限制
  }

  /**
   * 批量上传图片到云存储
   * @param {Array} images - 图片数据数组
   * @param {string} taskId - 任务ID
   * @param {string} type - 类型 (photography/fitting)
   * @returns {Array} 上传结果
   */
  async uploadImages(images, taskId, type = 'photography') {
    console.log(`📤 开始批量上传 ${images.length} 张图片到云存储`)

    const results = []
    const semaphore = new Semaphore(this.concurrencyLimit)

    // 并发上传处理
    const uploadPromises = images.map(async (imageData, index) => {
      await semaphore.acquire()

      try {
        const uploadResult = await this.uploadSingleImage(imageData, taskId, type, index + 1)
        results[index] = uploadResult
        console.log(`✅ 第${index + 1}张图片上传成功: ${uploadResult.fileID}`)
      } catch (error) {
        console.error(`❌ 第${index + 1}张图片上传失败:`, error.message)
        results[index] = {
          success: false,
          error: error.message,
          index: index + 1
        }
      } finally {
        semaphore.release()
      }
    })

    await Promise.all(uploadPromises)

    const successCount = results.filter(r => r.success).length
    console.log(`📊 批量上传完成: 总数 ${images.length}, 成功 ${successCount}, 失败 ${images.length - successCount}`)

    return results
  }

  /**
   * 上传单张图片
   * @param {Buffer|Object} imageData - 图片数据
   * @param {string} taskId - 任务ID
   * @param {string} type - 类型
   * @param {number} index - 图片索引
   * @returns {Object} 上传结果
   */
  async uploadSingleImage(imageData, taskId, type, index) {
    const timestamp = Date.now()
    const fileName = `${type}_${taskId}_${index}_${timestamp}.png`
    const cloudPath = `${type}/${taskId}/${fileName}`

    let fileContent
    let originalFormat = 'png'

    // 处理不同类型的图片数据
    if (Buffer.isBuffer(imageData)) {
      fileContent = imageData
    } else if (imageData.buffer) {
      fileContent = imageData.buffer
      originalFormat = imageData.format || originalFormat
    } else if (imageData.base64) {
      fileContent = Buffer.from(imageData.base64, 'base64')
      originalFormat = imageData.format || originalFormat
    } else {
      throw new Error('无效的图片数据格式')
    }

    console.log(`📤 上传第${index}张图片: ${cloudPath}, 大小: ${Math.round(fileContent.length/1024)}KB`)

    // 执行上传，带重试机制
    const uploadResult = await this.uploadWithRetry(cloudPath, fileContent)

    if (!uploadResult.fileID) {
      throw new Error('云存储返回空fileID')
    }

    // 构建返回结果
    return {
      success: true,
      fileID: uploadResult.fileID,
      url: uploadResult.fileID,
      width: 1024, // 默认尺寸，实际项目中应该从图片数据获取
      height: 1024,
      metadata: {
        cloud_path: cloudPath,
        uploaded_at: new Date(),
        original_format: originalFormat,
        ai_generated: true,
        upload_success: true,
        processed_in_aimodels: true,
        file_size: fileContent.length,
        task_id: taskId,
        type: type,
        index: index
      }
    }
  }

  /**
   * 带重试机制的上传
   * @param {string} cloudPath - 云存储路径
   * @param {Buffer} fileContent - 文件内容
   * @returns {Object} 上传结果
   */
  async uploadWithRetry(cloudPath, fileContent) {
    let lastError

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        console.log(`🔄 上传尝试 ${attempt}/${this.retryCount}: ${cloudPath}`)

        const uploadResult = await cloud.uploadFile({
          cloudPath: cloudPath,
          fileContent: fileContent
        })

        console.log(`✅ 上传成功 (尝试${attempt}): ${uploadResult.fileID}`)
        return uploadResult

      } catch (error) {
        lastError = error
        console.warn(`⚠️ 上传失败 (尝试${attempt}/${this.retryCount}):`, error.message)

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.retryCount) {
          const delay = this.retryDelay * attempt // 递增延迟
          console.log(`⏳ 等待 ${delay}ms 后重试...`)
          await this.sleep(delay)
        }
      }
    }

    throw new Error(`上传失败，已重试${this.retryCount}次: ${lastError.message}`)
  }

  /**
   * 下载云存储文件
   * @param {string|Array} fileIds - 文件ID或ID数组
   * @returns {Array} 下载结果
   */
  async downloadFiles(fileIds) {
    const ids = Array.isArray(fileIds) ? fileIds : [fileIds]
    console.log(`📥 开始下载 ${ids.length} 个文件`)

    const results = []

    for (let i = 0; i < ids.length; i++) {
      const fileId = ids[i]

      try {
        console.log(`📥 下载第${i+1}个文件: ${fileId}`)

        const downloadResult = await cloud.downloadFile({
          fileID: fileId
        })

        results.push({
          success: true,
          fileID: fileId,
          content: downloadResult.fileContent,
          size: downloadResult.fileContent.length,
          index: i
        })

        console.log(`✅ 第${i+1}个文件下载成功，大小: ${Math.round(downloadResult.fileContent.length/1024)}KB`)

      } catch (error) {
        console.error(`❌ 第${i+1}个文件下载失败:`, error.message)

        results.push({
          success: false,
          fileID: fileId,
          error: error.message,
          index: i
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`📊 文件下载完成: 总数 ${ids.length}, 成功 ${successCount}, 失败 ${ids.length - successCount}`)

    return results
  }

  /**
   * 生成唯一的云存储路径
   * @param {string} type - 文件类型
   * @param {string} taskId - 任务ID
   * @param {string} suffix - 文件后缀
   * @param {number} index - 文件索引
   * @returns {string} 云存储路径
   */
  generateCloudPath(type, taskId, suffix = 'png', index = 1) {
    const timestamp = Date.now()
    const fileName = `${type}_${taskId}_${index}_${timestamp}.${suffix}`
    return `${type}/${taskId}/${fileName}`
  }

  /**
   * 清理临时文件
   * @param {Array} fileIds - 要清理的文件ID数组
   * @returns {Object} 清理结果
   */
  async cleanupFiles(fileIds) {
    if (!fileIds || fileIds.length === 0) {
      return { success: true, cleaned: 0 }
    }

    console.log(`🗑️ 开始清理 ${fileIds.length} 个临时文件`)

    let cleanedCount = 0

    for (const fileId of fileIds) {
      try {
        await cloud.deleteFile({
          fileList: [fileId]
        })
        cleanedCount++
        console.log(`🗑️ 已清理文件: ${fileId}`)
      } catch (error) {
        console.warn(`⚠️ 清理文件失败: ${fileId}`, error.message)
      }
    }

    console.log(`📊 文件清理完成: 成功清理 ${cleanedCount}/${fileIds.length} 个文件`)

    return {
      success: true,
      total: fileIds.length,
      cleaned: cleanedCount,
      failed: fileIds.length - cleanedCount
    }
  }

  /**
   * 获取文件信息
   * @param {string} fileId - 文件ID
   * @returns {Object} 文件信息
   */
  async getFileInfo(fileId) {
    try {
      // 这里可以调用云存储API获取文件详细信息
      // 目前提供基础实现
      return {
        fileID: fileId,
        exists: true,
        // 可以添加更多文件元信息
      }
    } catch (error) {
      return {
        fileID: fileId,
        exists: false,
        error: error.message
      }
    }
  }

  /**
   * 等待指定时间
   * @param {number} ms - 毫秒数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * 信号量类 - 控制并发数
 */
class Semaphore {
  constructor(permits) {
    this.permits = permits
    this.promiseResolverQueue = []
  }

  async acquire() {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve()
    }

    return new Promise(resolve => {
      this.promiseResolverQueue.push(resolve)
    })
  }

  release() {
    this.permits++
    if (this.promiseResolverQueue.length > 0) {
      const resolver = this.promiseResolverQueue.shift()
      this.permits--
      resolver()
    }
  }
}

module.exports = StorageManager