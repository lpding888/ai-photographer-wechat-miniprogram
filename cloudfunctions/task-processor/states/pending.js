// pending 状态处理器
// pending → downloading

const BaseStateHandler = require('./base')

class PendingHandler extends BaseStateHandler {
  constructor() {
    super('pending')
  }

  async process(task, db, cloud) {
    console.log(`📥 处理 pending 任务: ${task._id}`)

    // 初始化状态数据
    const stateData = {
      downloaded_images: [],
      ai_task_id: null,
      ai_result: null,
      watermarked_images: [],
      final_images: []
    }

    await this.updateState(task._id, 'downloading', stateData, db)

    return {
      message: 'Task moved to downloading state'
    }
  }
}

module.exports = new PendingHandler()
