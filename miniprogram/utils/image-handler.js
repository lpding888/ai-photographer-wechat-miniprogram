// 图片处理工具类
class ImageHandler {
  constructor() {
    // 默认图片路径
    this.defaultImages = {
      avatar: '/images/default-avatar.png',
      scene: '/images/default-scene.png',
      logo: '/images/logo.png',
      work: '/images/default-scene.png' // 作品默认图片
    }

    // 已处理的错误图片缓存，避免重复处理
    this._errorImages = new Set()
  }

  /**
   * 获取默认图片路径
   */
  getDefaultImage(type = 'work') {
    return this.defaultImages[type] || this.defaultImages.work
  }

  /**
   * 处理图片加载错误
   */
  handleImageError(imageUrl, fallbackType = 'work') {
    // 避免重复处理同一个错误图片
    if (this._errorImages.has(imageUrl)) {
      return this.getDefaultImage(fallbackType)
    }

    this._errorImages.add(imageUrl)

    // 记录错误日志
    console.warn(`图片加载失败: ${imageUrl}`)

    // 如果是外部placeholder服务，提供提示
    if (imageUrl && (imageUrl.includes('placeholder.com') || imageUrl.includes('via.placeholder'))) {
      console.warn('检测到placeholder服务图片加载失败，使用本地默认图片替代')
    }

    return this.getDefaultImage(fallbackType)
  }

  /**
   * 生成优化的图片URL（缩略图、压缩等）
   * 微信云存储支持的图片处理参数
   */
  getOptimizedImageUrl(url, options = {}) {
    if (!url) return url

    const {
      width = 400,        // 宽度
      height = 400,       // 高度
      quality = 80,       // 质量 (1-100)
      format = 'webp',    // 格式 (webp/jpg/png)
      mode = 'aspectFill' // 缩放模式
    } = options

    // 如果是云存储URL (cloud://)
    if (url.startsWith('cloud://')) {
      // 云存储URL需要先转换为https
      console.log('⚠️ 云存储URL需要先转换为https:', url.substring(0, 50))
      return url
    }

    // 🔍 调试：检查URL域名
    console.log('🔍 检查URL域名:', url.substring(0, 80))

    // 如果是HTTPS URL且是微信云存储域名
    if (url.includes('cloud.webstorage.qq.com') || url.includes('tcb.qcloud.la')) {
      console.log('✅ 匹配到云存储域名，准备添加CDN参数')
      // 🎯 性能优化：构建图片处理参数
      const params = []

      // 缩放参数
      if (width || height) {
        params.push(`imageMogr2/thumbnail/${width}x${height}`)
      }

      // 质量参数
      if (quality < 100) {
        params.push(`quality/${quality}`)
      }

      // 格式转换（WebP格式更小）
      if (format === 'webp') {
        params.push('format/webp')
      }

      if (params.length > 0) {
        // 🚀 修复：imageMogr2必须作为第一个参数
        // 正确格式：https://...png?imageMogr2/.../sign=xxx&t=xxx

        const imageProcessParams = params.join('/')

        // 检查URL是否已有参数（sign、t等）
        if (url.includes('?')) {
          // 有参数：提取基础URL和query参数
          const [baseUrl, queryString] = url.split('?')
          // imageMogr2作为第一个参数，原有参数拼在后面
          const optimizedUrl = `${baseUrl}?${imageProcessParams}&${queryString}`
          console.log('✅ CDN优化完成:', optimizedUrl.substring(0, 120))
          return optimizedUrl
        } else {
          // 无参数：直接添加
          const optimizedUrl = `${url}?${imageProcessParams}`
          console.log('✅ CDN优化完成:', optimizedUrl.substring(0, 120))
          return optimizedUrl
        }
      }
    }

    console.log('⚠️ 未匹配到云存储域名，返回原始URL')
    return url
  }

  /**
   * 获取缩略图URL
   */
  getThumbnailUrl(url, size = 'small') {
    const sizeConfig = {
      small: { width: 200, height: 200, quality: 70 },
      medium: { width: 400, height: 400, quality: 80 },
      large: { width: 800, height: 800, quality: 85 }
    }

    const config = sizeConfig[size] || sizeConfig.medium
    return this.getOptimizedImageUrl(url, config)
  }

  /**
   * 验证图片URL是否有效
   */
  validateImageUrl(url) {
    if (!url) return false

    // 本地图片路径
    if (url.startsWith('/') || url.startsWith('./')) {
      return true
    }

    // 云存储图片
    if (url.startsWith('cloud://')) {
      return true
    }

    // HTTPS图片
    if (url.startsWith('https://')) {
      return true
    }

    // 其他格式认为无效
    return false
  }

  /**
   * 获取安全的图片URL
   */
  getSafeImageUrl(url, fallbackType = 'work') {
    if (this.validateImageUrl(url)) {
      return url
    }

    console.warn(`无效的图片URL: ${url}，使用默认图片`)
    return this.getDefaultImage(fallbackType)
  }

  /**
   * 为图片组件添加错误处理
   */
  bindImageErrorHandler(imageComponent, fallbackType = 'work') {
    const originalOnError = imageComponent.onError

    imageComponent.onError = (e) => {
      const errorUrl = e.currentTarget.dataset.src || e.currentTarget.src
      const fallbackUrl = this.handleImageError(errorUrl, fallbackType)

      // 更新图片源为默认图片
      e.currentTarget.src = fallbackUrl

      // 调用原有的错误处理函数
      if (originalOnError && typeof originalOnError === 'function') {
        originalOnError.call(imageComponent, e)
      }
    }

    return imageComponent
  }

  /**
   * 批量处理图片列表，替换无效URL
   */
  processBatchImages(images, fallbackType = 'work') {
    if (!Array.isArray(images)) {
      return []
    }

    return images.map(img => {
      if (typeof img === 'string') {
        return this.getSafeImageUrl(img, fallbackType)
      } else if (img && typeof img === 'object') {
        return {
          ...img,
          url: this.getSafeImageUrl(img.url, fallbackType),
          temp_url: img.temp_url ? this.getSafeImageUrl(img.temp_url, fallbackType) : undefined
        }
      }
      return img
    })
  }

  /**
   * 清理错误图片缓存
   */
  clearErrorCache() {
    this._errorImages.clear()
  }

  /**
   * 获取错误统计信息
   */
  getErrorStats() {
    return {
      errorCount: this._errorImages.size,
      errorUrls: Array.from(this._errorImages)
    }
  }
}

// 创建全局实例
const imageHandler = new ImageHandler()

module.exports = imageHandler