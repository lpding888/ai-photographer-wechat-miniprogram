// ai_completed 状态处理器
// ai_completed → watermarking

const BaseStateHandler = require('./base')

class AICompletedHandler extends BaseStateHandler {
  constructor() {
    super('ai_completed')
  }

  async process(task, db, cloud) {
    console.log(`✅ AI完成，跳过水印处理（前端imageMogr2已处理）: ${task._id}`)

    // ai_completed → uploading (跳过watermarking，前端已用imageMogr2加水印)
    await this.updateState(task._id, 'uploading', task.state_data, db)

    return {
      message: 'Ready for uploading (watermark skipped - frontend handles it)'
    }
  }
}

module.exports = new AICompletedHandler()
