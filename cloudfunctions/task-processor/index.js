// 状态机任务处理器云函数
// 每30秒运行一次，推进各状态的任务

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 导入状态处理器
const stateHandlers = {
  pending: require('./states/pending'),
  downloading: require('./states/downloading'),
  downloaded: require('./states/downloaded'),
  ai_calling: require('./states/ai_calling'),
  ai_processing: require('./states/ai_processing'),
  ai_completed: require('./states/ai_completed'),
  watermarking: require('./states/watermarking'),
  uploading: require('./states/uploading')
}

exports.main = async (event, context) => {
  console.log('🚀 task-processor (状态机模式) 运行')

  try {
    const results = []

    // 处理每种状态的任务
    for (const [state, handler] of Object.entries(stateHandlers)) {
      const stateResults = await processState(state, handler)
      results.push(...stateResults)
    }

    console.log(`✅ 处理完成，共处理 ${results.length} 个任务`)
    return { success: true, processed: results.length, results }

  } catch (error) {
    console.error('❌ task-processor 执行失败:', error)
    return { success: false, message: error.message }
  }
}

async function processState(stateName, handler) {
  console.log(`📥 处理状态: ${stateName}`)

  try {
    const _ = db.command

    // 查找该状态的任务（限制处理数量）
    const tasks = await db.collection('task_queue')
      .where({
        state: stateName,
        retry_count: _.lt(3)
      })
      .limit(10)
      .get()

    if (tasks.data.length === 0) {
      return []
    }

    console.log(`🎯 发现 ${tasks.data.length} 个 ${stateName} 任务`)

    const results = []

    // 并发处理（但每个任务独立）
    await Promise.allSettled(
      tasks.data.map(async (task) => {
        try {
          console.log(`🔄 处理任务 ${task._id}`)

          // 调用状态处理器
          const result = await handler.process(task, db, cloud)

          results.push({
            taskId: task._id,
            success: true,
            ...result
          })

          console.log(`✅ 任务 ${task._id} 处理完成`)

        } catch (error) {
          console.error(`❌ 任务 ${task._id} 处理失败:`, error)

          // 计算新的重试计数
          const newRetryCount = (task.retry_count || 0) + 1
          const MAX_RETRIES = 3

          // 增加重试计数
          await db.collection('task_queue').doc(task._id).update({
            data: {
              retry_count: newRetryCount,
              last_error: error.message,
              updated_at: new Date()
            }
          })

          // 使用新值判断是否超限
          if (newRetryCount >= MAX_RETRIES) {
            console.log(`❌ 任务 ${task._id} 重试${MAX_RETRIES}次失败，标记为失败`)

            await db.collection('task_queue').doc(task._id).update({
              data: {
                state: 'failed',
                status: 'failed',
                error: `重试${MAX_RETRIES}次失败: ${error.message}`,
                updated_at: new Date()
              }
            })

            await db.collection('works').where({ task_id: task._id }).update({
              data: {
                status: 'failed',
                error: `重试${MAX_RETRIES}次失败: ${error.message}`,
                updated_at: new Date()
              }
            })

            // 退还积分
            await refundCredits(task)
          }

          results.push({
            taskId: task._id,
            success: false,
            error: error.message,
            retry_count: newRetryCount
          })
        }
      })
    )

    return results

  } catch (error) {
    console.error(`❌ 处理状态 ${stateName} 失败:`, error)
    return []
  }
}

async function refundCredits(task) {
  // 退还积分逻辑
  if (!task.user_openid || !task.params) return

  const credits = task.params.count || 1

  try {
    await db.collection('users')
      .where({ openid: task.user_openid })
      .update({
        data: {
          credits: db.command.inc(credits),
          total_consumed_credits: db.command.inc(-credits),
          updated_at: new Date()
        }
      })

    console.log(`💰 已退还 ${credits} 积分给用户 ${task.user_openid}`)
  } catch (error) {
    console.error('❌ 退还积分失败:', error)
  }
}
