/**
 * AI图像处理器 SCF函数
 * 使用腾讯云CI进行图像处理和优化操作
 *
 * @author 老王
 * @version 3.0.0 - 腾讯云SCF标准架构
 */

'use strict'

const tencentcloud = require('tencentcloud-sdk-nodejs')

// 腾讯云CI服务客户端
const ciClient = new tencentcloud.Ci({
  credential: {
    secretId: process.env.TENCENTCLOUD_SECRET_ID,
    secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
  },
  region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
  profile: {
    httpProfile: {
      endpoint: 'ci.tencentcloudapi.com',
    },
  },
})

/**
 * SCF主函数
 * @param {Object} event - 事件参数
 * @param {Object} context - 运行上下文
 * @returns {Promise<Object>} 处理结果
 */
exports.main_handler = async (event, context) => {
  console.log('🖼️ AI图像处理器启动')
  console.log('📥 收到事件:', JSON.stringify(event, null, 2))
  console.log('🔧 运行环境:', JSON.stringify(context, null, 2))

  try {
    const { action } = event

    if (!action) {
      return {
        success: false,
        error: {
          code: 'MISSING_ACTION',
          message: '缺少action参数'
        }
      }
    }

    // 根据action路由到不同处理函数
    switch (action) {
      case 'compressImage':
        return await compressImage(event)
      case 'resizeImage':
        return await resizeImage(event)
      case 'formatConvert':
        return await formatConvert(event)
      case 'watermark':
        return await watermark(event)
      case 'smartCrop':
        return await smartCrop(event)
      case 'faceBeautify':
        return await faceBeautify(event)
      case 'imageEnhance':
        return await imageEnhance(event)
      case 'batchProcess':
        return await batchProcess(event)
      case 'getProcessStatus':
        return await getProcessStatus(event)
      default:
        return {
          success: false,
          error: {
            code: 'UNSUPPORTED_ACTION',
            message: `不支持的操作: ${action}`
          }
        }
    }

  } catch (error) {
    console.error('❌ SCF函数执行失败:', error)
    return {
      success: false,
      error: {
        code: 'SCF_EXECUTION_ERROR',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }
  }
}

/**
 * 压缩图片
 * @param {Object} event - 事件参数
 * @param {string} event.imageUrl - 图片URL
 * @param {number} event.quality - 压缩质量 (1-100)
 * @param {boolean} event.lossless - 是否无损压缩
 * @returns {Promise<Object>} 压缩结果
 */
async function compressImage(event) {
  console.log('🗜️ 执行图片压缩...')

  const { imageUrl, quality = 80, lossless = false } = event

  if (!imageUrl) {
    return {
      success: false,
      error: {
        code: 'MISSING_IMAGE_URL',
        message: '缺少图片URL参数'
      }
    }
  }

  try {
    // 腾讯云CI图片处理参数
    const params = {
      Bucket: process.env.COS_BUCKET,
      Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
      Key: extractCosKey(imageUrl),
      Rule: {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
        ObjectId: extractCosKey(imageUrl),
        ProcessRule: `imageMogr2/quality/${quality}${lossless ? '/lossless' : ''}`
      }
    }

    console.log('📋 压缩参数:', JSON.stringify(params, null, 2))

    // 调用腾讯云CI图片处理接口
    const response = await ciClient.ciProcessImage(params)

    if (response && response.ProcessResults && response.ProcessResults.length > 0) {
      const result = response.ProcessResults[0]
      console.log('✅ 图片压缩完成')

      return {
        success: true,
        data: {
          processedUrl: result.ObjectUrl,
          originalSize: result.OriginalSize,
          processedSize: result.ProcessedSize,
          compressionRatio: result.CompressionRatio,
          quality: result.Quality,
          format: result.Format
        }
      }
    } else {
      throw new Error('CI处理结果为空')
    }

  } catch (error) {
    console.error('❌ 图片压缩失败:', error)
    return {
      success: false,
      error: {
        code: 'COMPRESS_ERROR',
        message: error.message
      }
    }
  }
}

/**
 * 调整图片尺寸
 * @param {Object} event - 事件参数
 * @param {string} event.imageUrl - 图片URL
 * @param {number} event.width - 目标宽度
 * @param {number} event.height - 目标高度
 * @param {string} event.mode - 调整模式 (fit/fill/crop)
 * @returns {Promise<Object>} 调整结果
 */
async function resizeImage(event) {
  console.log('📏 执行图片尺寸调整...')

  const { imageUrl, width, height, mode = 'fit' } = event

  if (!imageUrl || !width || !height) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: '缺少图片URL或尺寸参数'
      }
    }
  }

  try {
    // 构建CI处理规则
    let processRule = `imageMogr2/thumbnail/${width}x${height}`

    switch (mode) {
      case 'fit':
        processRule += '/!/'
        break
      case 'fill':
        processRule += '/'
        break
      case 'crop':
        processRule += '/gravity/Center/crop/${width}x${height}'
        break
    }

    const params = {
      Bucket: process.env.COS_BUCKET,
      Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
      Key: extractCosKey(imageUrl),
      Rule: {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
        ObjectId: extractCosKey(imageUrl),
        ProcessRule: processRule
      }
    }

    console.log('📋 调整参数:', JSON.stringify(params, null, 2))

    const response = await ciClient.ciProcessImage(params)

    if (response && response.ProcessResults && response.ProcessResults.length > 0) {
      const result = response.ProcessResults[0]
      console.log('✅ 图片尺寸调整完成')

      return {
        success: true,
        data: {
          processedUrl: result.ObjectUrl,
          originalSize: result.OriginalSize,
          processedSize: result.ProcessedSize,
          width: width,
          height: height,
          mode: mode
        }
      }
    } else {
      throw new Error('CI处理结果为空')
    }

  } catch (error) {
    console.error('❌ 图片尺寸调整失败:', error)
    return {
      success: false,
      error: {
        code: 'RESIZE_ERROR',
        message: error.message
      }
    }
  }
}

/**
 * 格式转换
 * @param {Object} event - 事件参数
 * @param {string} event.imageUrl - 图片URL
 * @param {string} event.targetFormat - 目标格式 (webp/jpeg/png)
 * @returns {Promise<Object>} 转换结果
 */
async function formatConvert(event) {
  console.log('🔄 执行图片格式转换...')

  const { imageUrl, targetFormat } = event

  if (!imageUrl || !targetFormat) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: '缺少图片URL或目标格式参数'
      }
    }
  }

  try {
    const processRule = `imageMogr2/format/${targetFormat}`

    const params = {
      Bucket: process.env.COS_BUCKET,
      Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
      Key: extractCosKey(imageUrl),
      Rule: {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
        ObjectId: extractCosKey(imageUrl),
        ProcessRule: processRule
      }
    }

    console.log('📋 转换参数:', JSON.stringify(params, null, 2))

    const response = await ciClient.ciProcessImage(params)

    if (response && response.ProcessResults && response.ProcessResults.length > 0) {
      const result = response.ProcessResults[0]
      console.log('✅ 图片格式转换完成')

      return {
        success: true,
        data: {
          processedUrl: result.ObjectUrl,
          originalFormat: result.Format,
          targetFormat: targetFormat,
          processedSize: result.ProcessedSize
        }
      }
    } else {
      throw new Error('CI处理结果为空')
    }

  } catch (error) {
    console.error('❌ 图片格式转换失败:', error)
    return {
      success: false,
      error: {
        code: 'FORMAT_CONVERT_ERROR',
        message: error.message
      }
    }
  }
}

/**
 * 添加水印
 * @param {Object} event - 事件参数
 * @param {string} event.imageUrl - 图片URL
 * @param {Object} event.watermark - 水印配置
 * @returns {Promise<Object>} 处理结果
 */
async function watermark(event) {
  console.log('💧 执行图片水印处理...')

  const { imageUrl, watermark } = event

  if (!imageUrl || !watermark) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: '缺少图片URL或水印配置参数'
      }
    }
  }

  try {
    // 构建水印处理规则
    let processRule = 'watermark/2'

    if (watermark.text) {
      processRule += `/text/${Buffer.from(watermark.text).toString('base64')}`
      processRule += `/type/${watermark.font || 'ZHHeiTi'}`
      processRule += `/size/${watermark.size || 20}`
      processRule += `/color/${watermark.color || '3D3D3D'}`
    }

    if (watermark.position) {
      processRule += `/gravity/${watermark.gravity || 'SouthEast'}`
      processRule += `/dx/${watermark.dx || 10}`
      processRule += `/dy/${watermark.dy || 10}`
    }

    const params = {
      Bucket: process.env.COS_BUCKET,
      Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
      Key: extractCosKey(imageUrl),
      Rule: {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
        ObjectId: extractCosKey(imageUrl),
        ProcessRule: processRule
      }
    }

    console.log('📋 水印参数:', JSON.stringify(params, null, 2))

    const response = await ciClient.ciProcessImage(params)

    if (response && response.ProcessResults && response.ProcessResults.length > 0) {
      const result = response.ProcessResults[0]
      console.log('✅ 图片水印处理完成')

      return {
        success: true,
        data: {
          processedUrl: result.ObjectUrl,
          watermarkConfig: watermark,
          processedSize: result.ProcessedSize
        }
      }
    } else {
      throw new Error('CI处理结果为空')
    }

  } catch (error) {
    console.error('❌ 图片水印处理失败:', error)
    return {
      success: false,
      error: {
        code: 'WATERMARK_ERROR',
        message: error.message
      }
    }
  }
}

/**
 * 智能裁剪
 * @param {Object} event - 事件参数
 * @param {string} event.imageUrl - 图片URL
 * @param {number} event.width - 目标宽度
 * @param {number} event.height - 目标高度
 * @param {string} event.scenes - 场景类型 (1:人脸, 2:风景)
 * @returns {Promise<Object>} 裁剪结果
 */
async function smartCrop(event) {
  console.log('✂️ 执行智能裁剪...')

  const { imageUrl, width, height, scenes = '1' } = event

  if (!imageUrl || !width || !height) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: '缺少图片URL或裁剪尺寸参数'
      }
    }
  }

  try {
    // 智能裁剪处理规则
    const processRule = `smartcrop/${width}x${height}/scm/${scenes}`

    const params = {
      Bucket: process.env.COS_BUCKET,
      Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
      Key: extractCosKey(imageUrl),
      Rule: {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
        ObjectId: extractCosKey(imageUrl),
        ProcessRule: processRule
      }
    }

    console.log('📋 裁剪参数:', JSON.stringify(params, null, 2))

    const response = await ciClient.ciProcessImage(params)

    if (response && response.ProcessResults && response.ProcessResults.length > 0) {
      const result = response.ProcessResults[0]
      console.log('✅ 智能裁剪完成')

      return {
        success: true,
        data: {
          processedUrl: result.ObjectUrl,
          cropArea: result.CropArea,
          width: width,
          height: height,
          scenes: scenes
        }
      }
    } else {
      throw new Error('CI处理结果为空')
    }

  } catch (error) {
    console.error('❌ 智能裁剪失败:', error)
    return {
      success: false,
      error: {
        code: 'SMART_CROP_ERROR',
        message: error.message
      }
    }
  }
}

/**
 * 人脸美颜
 * @param {Object} event - 事件参数
 * @param {string} event.imageUrl - 图片URL
 * @param {Object} event.beautifyConfig - 美颜配置
 * @returns {Promise<Object>} 美颜结果
 */
async function faceBeautify(event) {
  console.log('✨ 执行人脸美颜...')

  const { imageUrl, beautifyConfig } = event

  if (!imageUrl || !beautifyConfig) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: '缺少图片URL或美颜配置参数'
      }
    }
  }

  try {
    // 构建美颜处理规则
    let processRule = 'face-beautify'

    if (beautifyConfig.smoothing !== undefined) {
      processRule += `/smoothing/${beautifyConfig.smoothing}`
    }
    if (beautifyConfig.whitening !== undefined) {
      processRule += `/whitening/${beautifyConfig.whitening}`
    }
    if (beautifyConfig.eyeLifting !== undefined) {
      processRule += `/eyeLifting/${beautifyConfig.eyeLifting}`
    }
    if (beautifyConfig.eyeEnlarging !== undefined) {
      processRule += `/eyeEnlarging/${beautifyConfig.eyeEnlarging}`
    }

    const params = {
      Bucket: process.env.COS_BUCKET,
      Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
      Key: extractCosKey(imageUrl),
      Rule: {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
        ObjectId: extractCosKey(imageUrl),
        ProcessRule: processRule
      }
    }

    console.log('📋 美颜参数:', JSON.stringify(params, null, 2))

    const response = await ciClient.ciProcessImage(params)

    if (response && response.ProcessResults && response.ProcessResults.length > 0) {
      const result = response.ProcessResults[0]
      console.log('✅ 人脸美颜完成')

      return {
        success: true,
        data: {
          processedUrl: result.ObjectUrl,
          beautifyConfig: beautifyConfig,
          processedSize: result.ProcessedSize
        }
      }
    } else {
      throw new Error('CI处理结果为空')
    }

  } catch (error) {
    console.error('❌ 人脸美颜失败:', error)
    return {
      success: false,
      error: {
        code: 'FACE_BEAUTIFY_ERROR',
        message: error.message
      }
    }
  }
}

/**
 * 图片增强
 * @param {Object} event - 事件参数
 * @param {string} event.imageUrl - 图片URL
 * @param {string} event.enhanceType - 增强类型 (denoise/sharpen/contrast)
 * @param {number} event.intensity - 增强强度 (1-100)
 * @returns {Promise<Object>} 增强结果
 */
async function imageEnhance(event) {
  console.log('🔆 执行图片增强...')

  const { imageUrl, enhanceType, intensity = 50 } = event

  if (!imageUrl || !enhanceType) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: '缺少图片URL或增强类型参数'
      }
    }
  }

  try {
    // 构建增强处理规则
    let processRule = 'image-enhance'

    switch (enhanceType) {
      case 'denoise':
        processRule += `/denoise/${intensity}`
        break
      case 'sharpen':
        processRule += `/sharpen/${intensity}`
        break
      case 'contrast':
        processRule += `/contrast/${intensity}`
        break
      default:
        throw new Error(`不支持的增强类型: ${enhanceType}`)
    }

    const params = {
      Bucket: process.env.COS_BUCKET,
      Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
      Key: extractCosKey(imageUrl),
      Rule: {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
        ObjectId: extractCosKey(imageUrl),
        ProcessRule: processRule
      }
    }

    console.log('📋 增强参数:', JSON.stringify(params, null, 2))

    const response = await ciClient.ciProcessImage(params)

    if (response && response.ProcessResults && response.ProcessResults.length > 0) {
      const result = response.ProcessResults[0]
      console.log('✅ 图片增强完成')

      return {
        success: true,
        data: {
          processedUrl: result.ObjectUrl,
          enhanceType: enhanceType,
          intensity: intensity,
          processedSize: result.ProcessedSize
        }
      }
    } else {
      throw new Error('CI处理结果为空')
    }

  } catch (error) {
    console.error('❌ 图片增强失败:', error)
    return {
      success: false,
      error: {
        code: 'IMAGE_ENHANCE_ERROR',
        message: error.message
      }
    }
  }
}

/**
 * 批量处理
 * @param {Object} event - 事件参数
 * @param {Array} event.imageUrls - 图片URL数组
 * @param {Array} event.operations - 操作数组
 * @returns {Promise<Object>} 批量处理结果
 */
async function batchProcess(event) {
  console.log('📦 执行批量图片处理...')

  const { imageUrls, operations } = event

  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return {
      success: false,
      error: {
        code: 'MISSING_IMAGE_URLS',
        message: '缺少图片URL数组参数'
      }
    }
  }

  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    return {
      success: false,
      error: {
        code: 'MISSING_OPERATIONS',
        message: '缺少操作数组参数'
      }
    }
  }

  try {
    const results = []

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i]
      console.log(`🔄 处理第 ${i + 1}/${imageUrls.length} 张图片`)

      const imageResults = []

      for (const operation of operations) {
        const operationEvent = {
          ...operation,
          imageUrl: imageUrl
        }

        let result
        switch (operation.action) {
          case 'compressImage':
            result = await compressImage(operationEvent)
            break
          case 'resizeImage':
            result = await resizeImage(operationEvent)
            break
          case 'formatConvert':
            result = await formatConvert(operationEvent)
            break
          case 'watermark':
            result = await watermark(operationEvent)
            break
          case 'smartCrop':
            result = await smartCrop(operationEvent)
            break
          case 'faceBeautify':
            result = await faceBeautify(operationEvent)
            break
          case 'imageEnhance':
            result = await imageEnhance(operationEvent)
            break
          default:
            result = {
              success: false,
              error: {
                code: 'UNSUPPORTED_OPERATION',
                message: `不支持的操作: ${operation.action}`
              }
            }
        }

        imageResults.push({
          operation: operation.action,
          result: result
        })
      }

      results.push({
        imageUrl: imageUrl,
        operations: imageResults
      })
    }

    console.log('✅ 批量图片处理完成')

    return {
      success: true,
      data: {
        totalImages: imageUrls.length,
        totalOperations: operations.length,
        results: results
      }
    }

  } catch (error) {
    console.error('❌ 批量图片处理失败:', error)
    return {
      success: false,
      error: {
        code: 'BATCH_PROCESS_ERROR',
        message: error.message
      }
    }
  }
}

/**
 * 获取处理状态
 * @param {Object} event - 事件参数
 * @param {string} event.taskId - 任务ID
 * @returns {Promise<Object>} 处理状态
 */
async function getProcessStatus(event) {
  console.log('📊 获取图片处理状态...')

  const { taskId } = event

  if (!taskId) {
    return {
      success: false,
      error: {
        code: 'MISSING_TASK_ID',
        message: '缺少任务ID参数'
      }
    }
  }

  try {
    // 这里可以从数据库或其他存储中查询任务状态
    // 暂时返回模拟数据
    console.log(`📋 查询任务ID: ${taskId}`)

    // 实际实现中应该从数据库查询
    const mockStatus = {
      taskId: taskId,
      status: 'completed', // pending/processing/completed/failed
      progress: 100,
      startTime: '2024-01-01T10:00:00Z',
      endTime: '2024-01-01T10:05:00Z',
      result: {
        processedUrl: 'https://example.com/processed-image.jpg',
        processedSize: 1024000
      }
    }

    console.log('✅ 获取处理状态完成')

    return {
      success: true,
      data: mockStatus
    }

  } catch (error) {
    console.error('❌ 获取处理状态失败:', error)
    return {
      success: false,
      error: {
        code: 'GET_STATUS_ERROR',
        message: error.message
      }
    }
  }
}

/**
 * 从图片URL提取COS Key
 * @param {string} imageUrl - 图片URL
 * @returns {string} COS Key
 */
function extractCosKey(imageUrl) {
  try {
    const url = new URL(imageUrl)
    // 假设URL格式为 https://bucket-name.cos.region.myqcloud.com/path/to/image.jpg
    const key = url.pathname.substring(1) // 去掉开头的 '/'
    return decodeURIComponent(key)
  } catch (error) {
    console.error('❌ 提取COS Key失败:', error)
    // 如果不是标准URL格式，直接返回原字符串
    return imageUrl
  }
}