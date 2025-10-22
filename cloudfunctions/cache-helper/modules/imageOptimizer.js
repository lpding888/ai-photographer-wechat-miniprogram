/**
 * 图片优化模块
 * 职责：为图片URL添加处理参数（格式转换、压缩、缩略图）
 */

const { IMAGE_OPTIMIZATION } = require('../config/constants')

/**
 * 优化单个图片URL
 * @param {string} url - 原始URL
 * @param {Object} options - 优化选项
 * @param {string} options.format - 图片格式 (webp/jpg/png)
 * @param {number} options.quality - 图片质量 (1-100)
 * @param {number} options.width - 宽度
 * @param {number} options.height - 高度
 * @param {string} options.mode - 调整模式 (thumbnail/crop)
 * @param {string} options.preset - 预设尺寸 (small/medium/large)
 * @returns {string} 优化后的URL
 */
function optimizeImageUrl(url, options = {}) {
  if (!url) {
    return url
  }

  // 如果URL不是云存储URL，直接返回
  if (!url.includes('cloud://') && !url.includes('tcb.qcloud.la')) {
    return url
  }

  const {
    format = IMAGE_OPTIMIZATION.DEFAULT_FORMAT,
    quality = IMAGE_OPTIMIZATION.DEFAULT_QUALITY,
    width = null,
    height = null,
    mode = 'thumbnail',
    preset = null
  } = options

  const params = []

  // 使用预设尺寸
  if (preset && IMAGE_OPTIMIZATION.THUMBNAIL_SIZES[preset]) {
    const size = IMAGE_OPTIMIZATION.THUMBNAIL_SIZES[preset]
    params.push(`${mode}/${size.width}x${size.height}`)
  } else if (width || height) {
    // 自定义尺寸 - 排除0值
    if (width === 0 || height === 0) {
      console.warn(`⚠️ [优化] 尺寸参数包含0 (width:${width}, height:${height}),跳过尺寸设置`)
    } else {
      const size = `${width || ''}x${height || ''}`
      params.push(`${mode}/${size}`)
    }
  }

  // 格式转换
  if (format) {
    params.push(`format/${format}`)
  }

  // 质量设置
  if (quality) {
    params.push(`quality/${quality}`)
  }

  // 如果没有任何参数，返回原URL
  if (params.length === 0) {
    return url
  }

  // 构建处理URL
  const processor = `imageMogr2/${params.join('/')}`
  const separator = url.includes('?') ? '&' : '?'

  return url + separator + processor
}

/**
 * 批量优化图片URL
 * @param {Array} urls - URL数组
 * @param {Object} options - 优化选项
 * @returns {Array} 优化后的URL数组
 */
function batchOptimizeUrls(urls, options = {}) {
  if (!Array.isArray(urls)) {
    return []
  }

  return urls.map(url => optimizeImageUrl(url, options))
}

/**
 * 为getTempFileURL结果应用优化
 * @param {Array} fileList - getTempFileURL返回的fileList
 * @param {Object} options - 优化选项
 * @returns {Array} 优化后的fileList
 */
function optimizeTempFileURLResult(fileList, options = {}) {
  if (!Array.isArray(fileList)) {
    return fileList
  }

  return fileList.map(file => {
    if (file.status === 0 && file.tempFileURL) {
      return {
        ...file,
        tempFileURL: optimizeImageUrl(file.tempFileURL, options),
        optimized: true
      }
    }
    return file
  })
}

module.exports = {
  optimizeImageUrl,
  batchOptimizeUrls,
  optimizeTempFileURLResult
}
