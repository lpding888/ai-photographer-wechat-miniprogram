// downloaded 状态处理器
// downloaded → ai_calling

const BaseStateHandler = require('./base')

class DownloadedHandler extends BaseStateHandler {
  constructor() {
    super('downloaded')
  }

  async process(task, db, cloud) {
    console.log(`📥 准备AI调用: ${task._id}`)

    // 生成提示词
    const prompt = await this.generatePrompt(task, db, cloud)

    // 更新状态
    await this.updateState(task._id, 'ai_calling', {
      ...task.state_data,
      prompt: prompt
    }, db)

    return {
      message: 'Ready for AI calling'
    }
  }

  async generatePrompt(task, db, cloud) {
    // 获取场景信息
    let sceneInfo = {}
    if (task.params.sceneId) {
      try {
        const result = await db.collection('scenes').doc(task.params.sceneId).get()
        sceneInfo = result.data || {}
      } catch (error) {
        console.warn('获取场景失败:', error)
      }
    }

    // 调用 prompt 云函数
    try {
      const result = await cloud.callFunction({
        name: 'prompt',
        data: {
          action: 'generatePrompt',
          type: task.type,
          parameters: task.params.parameters || {},
          sceneInfo: sceneInfo
        }
      })

      if (result.result && result.result.success) {
        return result.result.data.prompt
      }
    } catch (error) {
      console.warn('生成提示词失败:', error)
    }

    // 返回默认提示词
    if (task.type === 'photography') {
      return '专业时尚摄影，展示服装。高质量摄影，专业打光，时尚风格，1024x1024分辨率。'
    } else if (task.type === 'fitting') {
      return '专业时尚试衣效果图，展示服装穿着效果。高质量摄影，专业打光，时尚风格，1024x1024分辨率。'
    }
    return '生成高质量图片'
  }
}

module.exports = new DownloadedHandler()
