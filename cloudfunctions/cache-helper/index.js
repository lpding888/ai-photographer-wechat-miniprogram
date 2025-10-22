/**
 * 缓存助手云函数 - 主入口
 *
 * 功能：
 * - 提供带缓存的getTempFileURL服务
 * - 图片URL优化（WebP转换、缩略图）
 * - 缓存管理和清理
 *
 * 适用范围：
 * - 商业版：photography-worker, fitting-worker, api
 * - 个人版：personal-worker
 */

const cloud = require('wx-server-sdk')

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 导入模块
const urlCache = require('./modules/urlCache')
const imageOptimizer = require('./modules/imageOptimizer')
const cacheManager = require('./modules/cacheManager')

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action } = event

  console.log(`🚀 [cache-helper] 调用 - action: ${action}`)

  try {
    switch (action) {
      // ==================== URL缓存相关 ====================

      case 'getTempUrls':
        // 批量获取临时URL（带缓存）
        return await urlCache.getTempUrlsWithCache(
          event.fileIds,
          event.options || {}
        )

      case 'deleteCacheByFileIds':
        // 删除指定文件的缓存
        return await urlCache.deleteCacheByFileIds(event.fileIds)

      // ==================== 图片优化相关 ====================

      case 'optimizeUrl':
        // 优化单个图片URL
        const optimizedUrl = imageOptimizer.optimizeImageUrl(
          event.url,
          event.options || {}
        )
        return {
          success: true,
          data: {
            original: event.url,
            optimized: optimizedUrl
          }
        }

      case 'batchOptimizeUrls':
        // 批量优化图片URL
        const optimizedUrls = imageOptimizer.batchOptimizeUrls(
          event.urls,
          event.options || {}
        )
        return {
          success: true,
          data: optimizedUrls
        }

      // ==================== 缓存管理相关 ====================

      case 'clearExpiredCache':
        // 清除过期缓存（定时触发器调用）
        return await cacheManager.clearExpiredCache()

      case 'getCacheStats':
        // 获取缓存统计信息
        return await cacheManager.getCacheStats()

      case 'clearAllCache':
        // 清空所有缓存（谨慎使用）
        return await cacheManager.clearAllCache()

      case 'healthCheck':
        // 缓存健康检查
        return await cacheManager.healthCheck()

      // ==================== 未知操作 ====================

      default:
        return {
          success: false,
          message: '未知操作: ' + action,
          availableActions: [
            'getTempUrls',
            'deleteCacheByFileIds',
            'optimizeUrl',
            'batchOptimizeUrls',
            'clearExpiredCache',
            'getCacheStats',
            'clearAllCache',
            'healthCheck'
          ]
        }
    }
  } catch (error) {
    console.error('❌ [cache-helper] 执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器错误',
      error: {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }
  }
}
