/**
 * 缓存助手配置常量
 */

module.exports = {
  // 缓存配置
  CACHE: {
    // 缓存有效期：1.5小时（90分钟）
    // 临时URL有效期是2小时，留30分钟余量
    DURATION: 90 * 60 * 1000,

    // 数据库集合名
    COLLECTION: 'file_url_cache',

    // 批量处理最大数量（微信限制50个）
    MAX_BATCH_SIZE: 50
  },

  // 图片优化默认参数
  IMAGE_OPTIMIZATION: {
    // 默认格式：WebP（更小的文件大小）
    DEFAULT_FORMAT: 'webp',

    // 默认质量：85（平衡质量和大小）
    DEFAULT_QUALITY: 85,

    // 缩略图尺寸预设
    THUMBNAIL_SIZES: {
      small: { width: 200, height: 200 },    // 小图标
      medium: { width: 400, height: 400 },   // 列表缩略图
      large: { width: 800, height: 800 }     // 预览图
    }
  }
}
