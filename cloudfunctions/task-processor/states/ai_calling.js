// ai_calling 状态处理器（关键！）
// ai_calling → ai_processing
// 特点：不等待AI完成，只启动AI任务

const BaseStateHandler = require('./base')

class AICallingHandler extends BaseStateHandler {
  constructor() {
    super('ai_calling')
  }

  async process(task, db, cloud) {
    console.log(`🚀 启动独立Worker处理: ${task._id}`)

    try {
      // 根据类型选择worker（独立容器处理）
      const workerName = task.type === 'photography' ? 'photography-worker' : 'fitting-worker'
      console.log(`📦 调用${workerName}（独立容器，支持高并发）`)

      // 调用worker（worker会在独立容器中完成全部AI处理）
      await cloud.callFunction({
        name: workerName,
        data: {
          taskId: task._id,
          originalEvent: task.params,
          wxContext: { OPENID: task.user_openid }
        }
      })

      // worker已启动，标记为completed（worker会在自己容器中完成）
      // 不需要ai_processing状态，因为worker自己会更新task_queue
      await this.updateState(task._id, 'completed', {
        ...task.state_data,
        worker_started: true,
        worker_name: workerName,
        worker_start_time: new Date()
      }, db)

      return {
        message: `${workerName} started in independent container`,
        worker: workerName,
        mode: 'high_concurrency'
      }

    } catch (error) {
      console.error('启动Worker失败:', error)
      await this.markFailed(task._id, `启动Worker失败: ${error.message}`, db)
      throw error
    }
  }
}

module.exports = new AICallingHandler()
