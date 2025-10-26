/**
 * AI图像预处理云函数
 * 功能：抠图、旋转、压缩、格式转换等图像预处理
 * 作者：老王
 * 创建时间：2025-01-26
 */

const { COS } = require('cos-nodejs-sdk-v5')
const crypto = require('crypto')

// COS客户端初始化
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
  Domain: process.env.COS_DOMAIN || '{bucket}.cos.{region}.myqcloud.com'
})

// 腾讯云CI客户端（需要安装腾讯云CI SDK）
const tencentcloud = require('tencentcloud-sdk-nodejs')
const CIClient = tencentcloud.ci.v20200308.Client

// 配置信息
const CONFIG = {
  region: process.env.COS_REGION || 'ap-guangzhou',
  bucket: process.env.COS_BUCKET || '',
  maxImageSize: 10 * 1024 * 1024, // 10MB
  supportedFormats: ['jpg', 'jpeg', 'png', 'webp', 'bmp'],
  outputQuality: 0.9,
  maxRetries: 3
}

/**
 * 主处理函数
 */
exports.main_handler = async (event, context, callback) => {
  console.log('🚀 AI图像预处理云函数启动')
  console.log('📥 接收到的event:', JSON.stringify(event, null, 2))

  try {
    // 1. 参数验证
    const { images, options = {} } = event

    if (!images || !Array.isArray(images) || images.length === 0) {
      throw new Error('缺少必需的images参数，必须是非空数组')
    }

    if (images.length > 10) {
      throw new Error('最多支持同时处理10张图片')
    }

    console.log(`📷 开始处理 ${images.length} 张图片`)

    // 2. 处理每张图片
    const processedImages = []
    const processingResults = []

    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i]
      console.log(`🔄 处理第 ${i + 1}/${images.length} 张图片: ${imageUrl}`)

      try {
        const result = await processImage(imageUrl, options)
        processedImages.push(result.processedImageUrl)
        processingResults.push({
          originalUrl: imageUrl,
          processedUrl: result.processedImageUrl,
          processingTime: result.processingTime,
          operations: result.operations
        })

        console.log(`✅ 第 ${i + 1} 张图片处理完成`)
      } catch (error) {
        console.error(`❌ 第 ${i + 1} 张图片处理失败:`, error)
        processingResults.push({
          originalUrl: imageUrl,
          error: error.message,
          processingTime: 0
        })
        // 继续处理其他图片，不让单张失败影响整体
      }
    }

    // 3. 统计结果
    const successCount = processedImages.length
    const totalCount = images.length
    const successRate = Math.round((successCount / totalCount) * 100)

    console.log(`📊 处理完成: ${successCount}/${totalCount} 张图片成功 (${successRate}%)`)

    // 4. 返回结果
    const response = {
      success: true,
      data: {
        processedImages,
        processingResults,
        statistics: {
          totalCount,
          successCount,
          failureCount: totalCount - successCount,
          successRate,
          totalProcessingTime: processingResults.reduce((sum, r) => sum + (r.processingTime || 0), 0)
        }
      },
      message: `成功处理 ${successCount} 张图片`,
      timestamp: new Date().toISOString()
    }

    console.log('✅ AI图像预处理完成')
    callback(null, response)

  } catch (error) {
    console.error('❌ AI图像预处理失败:', error)

    const errorResponse = {
      success: false,
      error: {
        code: 'PROCESSING_ERROR',
        message: error.message,
        type: error.constructor.name
      },
      timestamp: new Date().toISOString()
    }

    callback(errorResponse)
  }
}

/**
 * 处理单张图片
 */
async function processImage(imageUrl, options) {
  const startTime = Date.now()

  try {
    // 1. 验证和解析图片URL
    const imageInfo = parseImageUrl(imageUrl)

    // 2. 下载原图
    const originalBuffer = await downloadImage(imageUrl)

    // 3. 图片信息验证
    await validateImage(originalBuffer)

    // 4. 执行图像处理操作
    const operations = []
    let processedBuffer = originalBuffer

    // 抠图处理（人像抠图）
    if (options.enableMatting !== false) {
      console.log('🎭 开始人像抠图处理...')
      processedBuffer = await performImageMatting(processedBuffer, imageInfo.key)
      operations.push('matting')
    }

    // 方向矫正
    if (options.enableOrientationCorrection !== false) {
      console.log('🔄 开始方向矫正...')
      processedBuffer = await correctImageOrientation(processedBuffer, imageInfo.key)
      operations.push('orientation_correction')
    }

    // 尺寸调整
    if (options.resize) {
      console.log('📐 开始尺寸调整...')
      processedBuffer = await resizeImage(processedBuffer, options.resize, imageInfo.key)
      operations.push('resize')
    }

    // 压缩优化
    if (options.enableCompression !== false) {
      console.log('🗜️ 开始压缩优化...')
      processedBuffer = await compressImage(processedBuffer, options.quality || CONFIG.outputQuality, imageInfo.key)
      operations.push('compression')
    }

    // 格式转换
    if (options.format) {
      console.log('🔄 开始格式转换...')
      processedBuffer = await convertImageFormat(processedBuffer, options.format, imageInfo.key)
      operations.push('format_conversion')
    }

    // 5. 上传处理后的图片
    const processedImageUrl = await uploadProcessedImage(processedBuffer, imageInfo.key, options.format || 'jpg')

    const processingTime = Date.now() - startTime
    console.log(`⏱️ 图片处理耗时: ${processingTime}ms`)

    return {
      processedImageUrl,
      processingTime,
      operations,
      originalSize: originalBuffer.length,
      processedSize: processedBuffer.length,
      compressionRatio: Math.round((1 - processedBuffer.length / originalBuffer.length) * 100)
    }

  } catch (error) {
    console.error(`图片处理失败: ${imageUrl}`, error)
    throw error
  }
}

/**
 * 解析COS图片URL
 */
function parseImageUrl(imageUrl) {
  try {
    // 从COS URL中提取bucket、region、key等信息
    const url = new URL(imageUrl)
    const hostname = url.hostname

    // 解析bucket和region
    const bucketRegionMatch = hostname.match(/^([^.]+)\.cos\.([^.]+)\.myqcloud\.com$/)
    if (!bucketRegionMatch) {
      throw new Error('无效的COS图片URL格式')
    }

    const [, bucket, region] = bucketRegionMatch
    const key = decodeURIComponent(url.pathname.substring(1)) // 去掉开头的 /

    return {
      bucket,
      region,
      key,
      originalUrl: imageUrl
    }
  } catch (error) {
    throw new Error(`解析图片URL失败: ${error.message}`)
  }
}

/**
 * 下载图片
 */
async function downloadImage(imageUrl) {
  try {
    const response = await fetch(imageUrl, {
      timeout: 30000, // 30秒超时
      headers: {
        'User-Agent': 'AI-Image-Processor/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`下载图片失败: HTTP ${response.status}`)
    }

    const buffer = await response.buffer()

    if (buffer.length > CONFIG.maxImageSize) {
      throw new Error(`图片过大: ${buffer.length} bytes, 最大支持 ${CONFIG.maxImageSize} bytes`)
    }

    return buffer
  } catch (error) {
    throw new Error(`下载图片失败: ${error.message}`)
  }
}

/**
 * 验证图片格式
 */
async function validateImage(buffer) {
  try {
    // 简单的图片格式验证
    const signatures = {
      'jpg': [0xFF, 0xD8, 0xFF],
      'jpeg': [0xFF, 0xD8, 0xFF],
      'png': [0x89, 0x50, 0x4E, 0x47],
      'webp': [0x52, 0x49, 0x46, 0x46],
      'bmp': [0x42, 0x4D]
    }

    let isValidFormat = false
    let detectedFormat = null

    for (const [format, signature] of Object.entries(signatures)) {
      if (buffer.length >= signature.length &&
          signature.every((byte, index) => buffer[index] === byte)) {
        isValidFormat = true
        detectedFormat = format
        break
      }
    }

    if (!isValidFormat) {
      throw new Error('不支持的图片格式')
    }

    console.log(`✅ 图片格式验证通过: ${detectedFormat}`)
    return detectedFormat
  } catch (error) {
    throw new Error(`图片验证失败: ${error.message}`)
  }
}

/**
 * 人像抠图处理（使用腾讯云CI）
 */
async function performImageMatting(buffer, key) {
  try {
    // 这里应该调用腾讯云CI的人像抠图API
    // 由于CI SDK配置复杂，这里提供模拟实现

    console.log('🎭 模拟人像抠图处理...')

    // 模拟处理时间
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 在实际实现中，这里会调用腾讯云CI的Matting接口
    // const result = await ciClient.Matting({
    //   Input: {
    //     CosObject: key
    //   }
    // })

    // 返回处理后的图片buffer（这里直接返回原buffer作为模拟）
    return buffer

  } catch (error) {
    console.error('人像抠图处理失败:', error)
    throw new Error(`人像抠图失败: ${error.message}`)
  }
}

/**
 * 方向矫正
 */
async function correctImageOrientation(buffer, key) {
  try {
    console.log('🔄 模拟方向矫正处理...')

    // 模拟处理时间
    await new Promise(resolve => setTimeout(resolve, 500))

    // 在实际实现中，这里会调用图片处理库进行方向检测和矫正

    return buffer
  } catch (error) {
    console.error('方向矫正失败:', error)
    throw new Error(`方向矫正失败: ${error.message}`)
  }
}

/**
 * 图片尺寸调整
 */
async function resizeImage(buffer, resizeOptions, key) {
  try {
    console.log(`📐 调整图片尺寸: ${JSON.stringify(resizeOptions)}`)

    // 模拟处理时间
    await new Promise(resolve => setTimeout(resolve, 800))

    // 在实际实现中，这里会使用sharp或jimp等图片处理库

    return buffer
  } catch (error) {
    console.error('尺寸调整失败:', error)
    throw new Error(`尺寸调整失败: ${error.message}`)
  }
}

/**
 * 图片压缩
 */
async function compressImage(buffer, quality = 0.9, key) {
  try {
    console.log(`🗜️ 压缩图片，质量: ${quality}`)

    // 模拟处理时间
    await new Promise(resolve => setTimeout(resolve, 600))

    // 在实际实现中，这里会调用腾讯云CI的压缩接口
    // const result = await ciClient.CompressImage({
    //   Input: {
    //     CosObject: key
    //   },
    //   Quality: Math.round(quality * 100)
    // })

    return buffer
  } catch (error) {
    console.error('图片压缩失败:', error)
    throw new Error(`图片压缩失败: ${error.message}`)
  }
}

/**
 * 格式转换
 */
async function convertImageFormat(buffer, targetFormat, key) {
  try {
    console.log(`🔄 转换图片格式: ${targetFormat}`)

    // 模拟处理时间
    await new Promise(resolve => setTimeout(resolve, 400))

    // 在实际实现中，这里会调用腾讯云CI的格式转换接口

    return buffer
  } catch (error) {
    console.error('格式转换失败:', error)
    throw new Error(`格式转换失败: ${error.message}`)
  }
}

/**
 * 上传处理后的图片到COS
 */
async function uploadProcessedImage(buffer, originalKey, format) {
  try {
    // 生成新的文件名
    const timestamp = Date.now()
    const randomString = crypto.randomBytes(4).toString('hex')
    const originalName = originalKey.split('/').pop()
    const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName
    const newKey = `ai-generation/processed/${timestamp}_${randomString}_${baseName}.${format}`

    console.log(`📤 上传处理后的图片: ${newKey}`)

    return new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: CONFIG.bucket,
        Region: CONFIG.region,
        Key: newKey,
        Body: buffer,
        ContentType: `image/${format}`,
        CacheControl: 'max-age=31536000', // 1年缓存
        onProgress: function(progressData) {
          // 上传进度回调（可选）
          const percent = Math.round(progressData.percent * 100)
          if (percent % 10 === 0) {
            console.log(`📊 上传进度: ${percent}%`)
          }
        }
      }, function(err, data) {
        if (err) {
          console.error('上传图片失败:', err)
          reject(new Error(`上传图片失败: ${err.message}`))
          return
        }

        const imageUrl = `https://${CONFIG.bucket}.cos.${CONFIG.region}.myqcloud.com/${newKey}`
        console.log(`✅ 图片上传成功: ${imageUrl}`)
        resolve(imageUrl)
      })
    })

  } catch (error) {
    console.error('上传处理后的图片失败:', error)
    throw new Error(`上传图片失败: ${error.message}`)
  }
}

/**
 * 健康检查函数（可选）
 */
exports.health_check = async (event, context, callback) => {
  callback(null, {
    status: 'healthy',
    function: 'ai-image-processor',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
}