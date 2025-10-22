// 云函数预热脚本
// 用于保持云函数热启动，减少冷启动延迟

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

/**
 * 预热函数 - 轻量级ping操作
 * 每5分钟调用一次，保持函数实例存活
 */
exports.main = async (event, context) => {
  const action = event.action || 'ping'

  if (action === 'ping') {
    // 简单的ping操作，不进行数据库查询
    return {
      success: true,
      message: 'pong',
      timestamp: Date.now(),
      warm: true
    }
  }

  // 也可以预热数据库连接
  if (action === 'warmDb') {
    const db = cloud.database()
    // 执行一个轻量查询
    const result = await db.collection('users')
      .limit(1)
      .count()

    return {
      success: true,
      message: 'db warmed',
      count: result.total,
      timestamp: Date.now()
    }
  }

  return {
    success: false,
    message: 'unknown action'
  }
}