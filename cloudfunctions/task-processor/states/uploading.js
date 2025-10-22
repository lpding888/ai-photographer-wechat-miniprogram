// uploading 状态处理器
// uploading → completed

const BaseStateHandler = require('./base')

class UploadingHandler extends BaseStateHandler {
  constructor() {
    super('uploading')
  }

  async process(task, db, cloud) {
    console.log(`📤 完成任务（图片已在AI完成时上传）: ${task._id}`)

    // 从AI结果获取已上传的图片信息（已包含 fileID 和 URL）
    const aiResult = task.state_data.ai_result
    const finalImages = aiResult?.images || []

    if (!finalImages || finalImages.length === 0) {
      throw new Error('没有已上传的图片')
    }

    console.log(`✅ 获取到 ${finalImages.length} 张已上传的图片`)

    try {
      // 更新 works 记录
      await db.collection('works').where({ task_id: task._id }).update({
        data: {
          status: 'completed',
          images: finalImages,
          completed_at: new Date(),
          updated_at: new Date()
        }
      })

      // 更新任务状态为 completed
      await db.collection('task_queue').doc(task._id).update({
        data: {
          state: 'completed',
          status: 'completed',
          state_data: {
            ...task.state_data,
            final_images: finalImages
          },
          completed_at: new Date(),
          updated_at: new Date()
        }
      })

      return {
        message: 'Task completed',
        images_count: finalImages.length
      }

    } catch (error) {
      console.error('完成任务失败:', error)
      await this.markFailed(task._id, error.message, db)
      throw error
    }
  }
}

module.exports = new UploadingHandler()
