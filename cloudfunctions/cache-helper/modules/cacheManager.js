/**
 * 缓存管理模块
 * 职责：清理过期缓存、统计缓存使用情况
 */

const cloud = require('wx-server-sdk')
const { CACHE } = require('../config/constants')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 清除过期缓存
 * @returns {Object} 清理结果
 */
async function clearExpiredCache() {
  try {
    const now = new Date()
    let totalRemoved = 0

    console.log(`🧹 [管理] 开始清理过期缓存...`)

    // 循环删除，直到没有过期记录（微信云数据库单次最多删除20条）
    while (true) {
      const result = await db.collection(CACHE.COLLECTION)
        .where({
          expire_time: _.lt(now)
        })
        .limit(20)
        .remove()

      totalRemoved += result.stats.removed

      // 如果删除数量小于20，说明已经清理完毕
      if (result.stats.removed < 20) {
        break
      }
    }

    console.log(`✅ [管理] 清理完成: ${totalRemoved}条`)

    return {
      success: true,
      data: {
        removed: totalRemoved,
        cleanedAt: now
      },
      message: `已清理${totalRemoved}条过期缓存`
    }
  } catch (error) {
    console.error('❌ [管理] 清理失败:', error)
    return {
      success: false,
      message: '清理失败: ' + error.message
    }
  }
}

/**
 * 获取缓存统计信息
 * @returns {Object} 统计结果
 */
async function getCacheStats() {
  try {
    const now = new Date()

    // 总记录数
    const totalResult = await db.collection(CACHE.COLLECTION).count()
    const total = totalResult.total

    // 有效记录数
    const validResult = await db.collection(CACHE.COLLECTION)
      .where({
        expire_time: _.gt(now)
      })
      .count()
    const valid = validResult.total

    // 过期记录数
    const expired = total - valid

    // 计算占用空间（粗略估算：每条记录约200字节）
    const estimatedSize = (total * 200 / 1024 / 1024).toFixed(2) // MB

    console.log(`📊 [管理] 缓存统计 - 总计:${total}, 有效:${valid}, 过期:${expired}`)

    return {
      success: true,
      data: {
        total: total,
        valid: valid,
        expired: expired,
        estimatedSizeMB: estimatedSize,
        validRate: total > 0 ? ((valid / total) * 100).toFixed(2) + '%' : '0%'
      }
    }
  } catch (error) {
    console.error('❌ [管理] 统计失败:', error)
    return {
      success: false,
      message: '统计失败: ' + error.message
    }
  }
}

/**
 * 清空所有缓存（谨慎使用）
 * @returns {Object} 清空结果
 */
async function clearAllCache() {
  try {
    console.log(`⚠️ [管理] 清空所有缓存...`)

    let totalRemoved = 0

    // 循环删除，每次最多20条
    while (true) {
      const result = await db.collection(CACHE.COLLECTION)
        .limit(20)
        .remove()

      totalRemoved += result.stats.removed

      // 如果删除数量小于20，说明已经清空
      if (result.stats.removed < 20) {
        break
      }
    }

    console.log(`✅ [管理] 已清空: ${totalRemoved}条`)

    return {
      success: true,
      data: {
        removed: totalRemoved
      },
      message: `已清空所有缓存，共${totalRemoved}条记录`
    }
  } catch (error) {
    console.error('❌ [管理] 清空失败:', error)
    return {
      success: false,
      message: '清空失败: ' + error.message
    }
  }
}

/**
 * 缓存健康检查
 * @returns {Object} 健康状态
 */
async function healthCheck() {
  try {
    const stats = await getCacheStats()

    if (!stats.success) {
      return {
        success: false,
        health: 'unhealthy',
        message: '缓存统计失败'
      }
    }

    const { total, valid, expired } = stats.data

    // 健康评估
    let health = 'healthy'
    const issues = []

    // 过期率超过30%
    if (total > 0 && (expired / total) > 0.3) {
      health = 'warning'
      issues.push('过期缓存占比过高，建议清理')
    }

    // 总记录数超过10万
    if (total > 100000) {
      health = 'warning'
      issues.push('缓存记录过多，建议定期清理')
    }

    // 没有有效缓存
    if (total > 0 && valid === 0) {
      health = 'critical'
      issues.push('所有缓存已过期')
    }

    console.log(`💊 [管理] 健康检查 - 状态:${health}`)

    return {
      success: true,
      health: health,
      data: stats.data,
      issues: issues,
      recommendations: issues.length > 0
        ? ['建议执行clearExpiredCache清理过期缓存']
        : []
    }
  } catch (error) {
    console.error('❌ [管理] 健康检查失败:', error)
    return {
      success: false,
      health: 'unknown',
      message: '健康检查失败: ' + error.message
    }
  }
}

module.exports = {
  clearExpiredCache,
  getCacheStats,
  clearAllCache,
  healthCheck
}
