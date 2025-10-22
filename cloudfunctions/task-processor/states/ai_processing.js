// ai_processing 状态处理器（关键！）
// ai_processing → ai_completed
// 特点：轮询检查AI是否完成

const BaseStateHandler = require('./base')

class AIProcessingHandler extends BaseStateHandler {
  constructor() {
    super('ai_processing')
  }

  async process(task, db, cloud) {
    console.log(`⏳ 检查AI状态: ${task._id}`)

    try {
      // 检查AI状态
      const result = await cloud.callFunction({
        name: 'aimodels',
        data: {
          action: 'checkAIStatus',  // 新接口：检查AI状态
          taskId: task._id,
          aiTaskId: task.state_data.ai_task_id
        }
      })

      if (!result.result || !result.result.success) {
        throw new Error('检查AI状态失败: ' + (result.result?.message || '未知错误'))
      }

      // 获取AI状态
      const aiData = result.result.data

      if (aiData.status === 'processing') {
        // AI还在处理中，保持当前状态
        console.log(`AI还在处理中: ${task._id}`)

        // 检查是否超时（超过10分钟）
        const aiStartTime = new Date(task.state_data.ai_start_time)
        const elapsed = Date.now() - aiStartTime.getTime()

        if (elapsed > 10 * 60 * 1000) {
          throw new Error('AI处理超时（10分钟）')
        }

        return {
          message: 'AI still processing',
          elapsed_ms: elapsed
        }
      } else if (aiData.status === 'failed') {
        // AI失败
        throw new Error(aiData.error || 'AI生成失败')
      }

      // AI已完成，获取结果
      console.log(`✅ AI生成完成，图片数量: ${aiData.images?.length || 0}`)

      // 更新状态为 ai_completed
      await this.updateState(task._id, 'ai_completed', {
        ...task.state_data,
        ai_result: aiData  // 包含完整图片数据，但不打印
      }, db)

      return {
        message: 'AI generation completed',
        images_count: aiData.images?.length || 0
      }

    } catch (error) {
      console.error('检查AI状态失败:', error)
      await this.markFailed(task._id, error.message, db)
      throw error
    }
  }
}

module.exports = new AIProcessingHandler()
