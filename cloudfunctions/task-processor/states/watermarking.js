// watermarking 状态处理器
// watermarking → uploading

const BaseStateHandler = require('./base')

class WatermarkingHandler extends BaseStateHandler {
  constructor() {
    super('watermarking')
  }

  async process(task, db, cloud) {
    console.log(`🎨 添加水印: ${task._id}`)

    const aiResult = task.state_data.ai_result

    if (!aiResult || !aiResult.images || aiResult.images.length === 0) {
      throw new Error('没有AI生成的图片')
    }

    // 调用 aimodels 添加水印
    try {
      const result = await cloud.callFunction({
        name: 'aimodels',
        data: {
          action: 'addWatermarks',
          taskId: task._id,
          images: aiResult.images
        }
      })

      if (result.result && result.result.success) {
        const watermarkedImages = result.result.data.images

        // 更新状态为 uploading
        await this.updateState(task._id, 'uploading', {
          ...task.state_data,
          watermarked_images: watermarkedImages
        }, db)

        return {
          message: 'Watermarks added',
          images_count: watermarkedImages.length
        }
      } else {
        throw new Error('添加水印失败')
      }

    } catch (error) {
      console.error('添加水印失败:', error)
      await this.markFailed(task._id, error.message, db)
      throw error
    }
  }
}

module.exports = new WatermarkingHandler()
