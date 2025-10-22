/**
 * 工作流编排模块
 * 负责：流程控制、状态管理、错误恢复
 */

const cloud = require('wx-server-sdk')
const ImageProcessor = require('./imageProcessor')
const AICaller = require('./aiCaller')
const WatermarkProcessor = require('./watermarkProcessor')
const StorageManager = require('./storageManager')

class WorkflowOrchestrator {
  constructor() {
    this.imageProcessor = new ImageProcessor()
    this.aiCaller = new AICaller()
    this.watermarkProcessor = new WatermarkProcessor()
    this.storageManager = new StorageManager()

    this.db = cloud.database()
  }

  /**
   * 执行完整的图片生成工作流
   * @param {Object} task - 任务配置
   * @returns {Object} 处理结果
   */
  async executeGenerationWorkflow(task) {
    const { taskId, imageIds, prompt, parameters, type } = task

    console.log(`🚀 开始执行${type}工作流, taskId: ${taskId}`)
    console.log(`📝 任务配置: 图片${imageIds?.length || 0}张, 提示词${prompt?.length || 0}字符`)

    try {
      // 更新任务状态为处理中
      console.log('🔄 更新任务状态为processing...')
      await this.updateTaskStatus(taskId, 'processing', '开始处理...')
      console.log('✅ 任务状态更新完成')

      // 步骤1: 下载并处理输入图片
      console.log('📥 步骤1: 处理输入图片...')
      console.log(`📸 准备处理 ${imageIds?.length || 0} 张图片:`, imageIds)
      const processedImages = await this.processInputImages(imageIds, taskId)
      console.log('✅ 步骤1完成，处理结果:', processedImages.length + '张图片')

      // 步骤2: 选择最佳AI模型
      console.log('🤖 步骤2: 选择AI模型...')
      const selectedModel = await this.selectAIModel(parameters)

      // 步骤3: 调用AI模型生成图片
      console.log('🎨 步骤3: AI图片生成...')
      await this.updateTaskStatus(taskId, 'ai_processing', 'AI正在生成图片...')
      const aiResult = await this.generateAIImages({
        model: selectedModel,
        prompt: prompt,
        images: processedImages.filter(img => img.status === 'success'),
        parameters: parameters
      })

      if (!aiResult.success) {
        throw new Error(`AI生成失败: ${aiResult.message}`)
      }

      // 步骤4: 为生成的图片添加水印
      console.log('🎨 步骤4: 添加水印...')
      await this.updateTaskStatus(taskId, 'watermarking', '正在添加水印...')
      const watermarkedImages = await this.processWatermarks(aiResult.data.images)

      // 步骤5: 上传到云存储
      console.log('📤 步骤5: 上传到云存储...')
      await this.updateTaskStatus(taskId, 'uploading', '正在上传图片...')
      const uploadResults = await this.uploadGeneratedImages(watermarkedImages, taskId, type)

      // 步骤6: 使用AICaller的完整图片上传和数据库更新逻辑
      console.log('💾 步骤6: 完整的结果处理...')

      // 构造AI结果格式，使用带水印的图片
      const finalAIResult = {
        success: true,
        data: {
          images: watermarkedImages.map((img, index) => ({
            url: `data:image/jpeg;base64,${img.buffer.toString('base64')}`,
            width: img.metadata?.width || 1024,
            height: img.metadata?.height || 1024,
            metadata: {
              ...img.metadata,
              watermark_applied: img.metadata?.watermark_applied !== false,
              generated_by: selectedModel.name,
              provider: selectedModel.provider
            }
          })),
          model_used: selectedModel.name,
          generation_time: aiResult.data.generation_time,
          provider: selectedModel.provider
        }
      }

      // 使用AICaller的handleLargeAIResult进行完整的图片上传和数据库更新
      await this.aiCaller.handleLargeAIResult(taskId, type, finalAIResult, prompt)

      console.log(`🎉 工作流执行成功! 使用${selectedModel.name}生成了${finalAIResult.data.images.length}张图片`)

      return {
        success: true,
        data: {
          images: finalAIResult.data.images,
          model_used: selectedModel.name,
          generation_time: aiResult.data.generation_time,
          total_images: finalAIResult.data.images.length,
          successful_images: finalAIResult.data.images.length,
          processed_in_aimodels: true
        },
        message: '图片生成完成'
      }

    } catch (error) {
      console.error('❌ 工作流执行失败:', error.message)
      console.error('❌ 错误堆栈:', error.stack)
      console.error('❌ 错误类型:', error.constructor.name)
      console.error('❌ 完整错误对象:', JSON.stringify(error, Object.getOwnPropertyNames(error)))

      // 使用AICaller的handleFailedAI进行完整的错误处理和积分退还
      console.log('🔄 开始处理工作流失败...')
      await this.aiCaller.handleFailedAI(taskId, type, {
        success: false,
        message: error.message,
        error_details: {
          type: error.constructor.name,
          stack: error.stack
        }
      })
      console.log('✅ 工作流失败处理完成')

      return {
        success: false,
        message: error.message,
        error_details: {
          task_id: taskId,
          type: type,
          timestamp: new Date(),
          error_type: error.constructor.name,
          processed_in_aimodels: true
        }
      }
    }
  }

  /**
   * 处理输入图片
   * @param {Array} imageIds - 图片ID数组
   * @param {string} taskId - 任务ID
   * @returns {Array} 处理结果
   */
  async processInputImages(imageIds, taskId) {
    if (!imageIds || imageIds.length === 0) {
      console.log('ℹ️ 无输入图片，跳过图片处理步骤')
      return []
    }

    try {
      console.log(`📸 开始处理 ${imageIds.length} 张输入图片`)

      const results = await this.imageProcessor.downloadAndConvert(imageIds)

      const stats = this.imageProcessor.getProcessingStats(results)
      console.log(`📊 图片处理统计:`, stats)

      // 记录处理日志
      await this.logWorkflowStep(taskId, 'image_processing', {
        input_count: imageIds.length,
        success_count: stats.successful,
        failed_count: stats.failed,
        total_size_kb: stats.totalSizeKB
      })

      return results

    } catch (error) {
      console.error('❌ 输入图片处理失败:', error.message)
      throw new Error(`输入图片处理失败: ${error.message}`)
    }
  }

  /**
   * 选择AI模型
   * @param {Object} parameters - 参数配置
   * @returns {Object} 选择的模型
   */
  async selectAIModel(parameters) {
    try {
      console.log('🤖 选择最佳AI模型...')

      const result = await this.aiCaller.selectBestModel({
        type: 'text-to-image',
        requirements: parameters
      })

      if (!result.success || !result.data.selected_model) {
        throw new Error('没有可用的AI模型')
      }

      const model = result.data.selected_model
      console.log(`✅ 选择模型: ${model.name} (${model.provider})`)

      return model

    } catch (error) {
      console.error('❌ AI模型选择失败:', error.message)
      throw new Error(`AI模型选择失败: ${error.message}`)
    }
  }

  /**
   * 生成AI图片
   * @param {Object} config - 生成配置
   * @returns {Object} 生成结果
   */
  async generateAIImages(config) {
    try {
      console.log('🎨 开始AI图片生成...')

      const result = await this.aiCaller.generateImages(config)

      if (!result.success) {
        throw new Error(result.message)
      }

      console.log(`✅ AI生成成功: ${result.data.images.length} 张图片`)

      return result

    } catch (error) {
      console.error('❌ AI图片生成失败:', error.message)
      throw new Error(`AI图片生成失败: ${error.message}`)
    }
  }

  /**
   * 处理水印
   * @param {Array} images - 图片数组
   * @returns {Array} 处理结果
   */
  async processWatermarks(images) {
    try {
      console.log(`🎨 开始为 ${images.length} 张图片添加水印`)

      const watermarkOptions = {
        text: 'AI Generated',
        position: 'bottom-right',
        fontSize: 36, // 稍微大一点点
        padding: 5, // 进一步减少边距，几乎贴边
        style: 'frosted-glass' // 毛玻璃效果
      }

      const results = await this.watermarkProcessor.addWatermarkBatch(images, watermarkOptions)

      const successCount = results.filter(r => r.success).length
      console.log(`📊 水印处理完成: 成功 ${successCount}/${images.length} 张`)

      // 对于失败的图片，使用原图作为降级处理
      return results.map(result => {
        if (result.success) {
          return {
            buffer: result.buffer,
            metadata: result.metadata,
            success: true
          }
        } else {
          console.warn(`⚠️ 图片${result.index + 1}水印失败，使用原图`)
          return {
            buffer: result.fallbackBuffer,
            metadata: {
              ...result.metadata,
              watermark_applied: false,
              fallback_used: true
            },
            success: true // 标记为成功，因为有降级处理
          }
        }
      })

    } catch (error) {
      console.error('❌ 水印处理失败:', error.message)
      throw new Error(`水印处理失败: ${error.message}`)
    }
  }

  /**
   * 上传生成的图片
   * @param {Array} images - 图片数组
   * @param {string} taskId - 任务ID
   * @param {string} type - 类型
   * @returns {Array} 上传结果
   */
  async uploadGeneratedImages(images, taskId, type) {
    try {
      console.log(`📤 开始上传 ${images.length} 张生成的图片`)

      const results = await this.storageManager.uploadImages(images, taskId, type)

      const successCount = results.filter(r => r.success).length
      console.log(`📊 图片上传完成: 成功 ${successCount}/${images.length} 张`)

      return results

    } catch (error) {
      console.error('❌ 图片上传失败:', error.message)
      throw new Error(`图片上传失败: ${error.message}`)
    }
  }

  /**
   * 更新任务结果
   * @param {string} taskId - 任务ID
   * @param {Array} uploadResults - 上传结果
   * @param {Object} aiResult - AI结果
   * @param {Object} model - 使用的模型
   */
  async updateTaskResults(taskId, uploadResults, aiResult, model) {
    try {
      const successfulUploads = uploadResults.filter(r => r.success)

      // 更新作品记录
      await this.db.collection('works')
        .where({ task_id: taskId })
        .update({
          data: {
            status: 'completed',
            images: successfulUploads,
            ai_model: model.name,
            ai_provider: model.provider,
            generation_time: aiResult.data.generation_time,
            generation_cost: aiResult.data.cost,
            completed_at: new Date(),
            updated_at: new Date(),
            processing_stats: {
              total_generated: uploadResults.length,
              successful_uploads: successfulUploads.length,
              failed_uploads: uploadResults.length - successfulUploads.length
            }
          }
        })

      // 更新任务队列
      await this.db.collection('task_queue')
        .doc(taskId)
        .update({
          data: {
            status: 'completed',
            result: {
              success: true,
              images_count: successfulUploads.length,
              ai_generated: true,
              processed_in_aimodels: true,
              model_used: model.name
            },
            completed_at: new Date(),
            updated_at: new Date()
          }
        })

      console.log('✅ 任务结果更新完成')

    } catch (error) {
      console.error('❌ 任务结果更新失败:', error.message)
      throw new Error(`任务结果更新失败: ${error.message}`)
    }
  }

  /**
   * 更新任务状态
   * @param {string} taskId - 任务ID
   * @param {string} status - 状态
   * @param {string} message - 消息
   */
  async updateTaskStatus(taskId, status, message) {
    try {
      // 更新作品状态
      await this.db.collection('works')
        .where({ task_id: taskId })
        .update({
          data: {
            status: status,
            updated_at: new Date()
          }
        })

      // 更新任务队列状态
      await this.db.collection('task_queue')
        .doc(taskId)
        .update({
          data: {
            status: status,
            message: message,
            updated_at: new Date()
          }
        })

      console.log(`📝 任务状态更新: ${status} - ${message}`)

    } catch (error) {
      console.warn('⚠️ 任务状态更新失败:', error.message)
    }
  }

  /**
   * 记录工作流步骤
   * @param {string} taskId - 任务ID
   * @param {string} step - 步骤名称
   * @param {Object} data - 步骤数据
   */
  async logWorkflowStep(taskId, step, data) {
    try {
      await this.db.collection('workflow_logs').add({
        data: {
          task_id: taskId,
          step: step,
          step_data: data,
          timestamp: new Date()
        }
      })
    } catch (error) {
      console.warn('⚠️ 工作流日志记录失败:', error.message)
    }
  }

  /**
   * 处理工作流错误
   * @param {string} taskId - 任务ID
   * @param {Error} error - 错误对象
   * @param {string} type - 类型
   * @returns {Object} 错误处理结果
   */
  async handleWorkflowError(taskId, error, type) {
    console.error(`💥 工作流错误处理: ${error.message}`)

    try {
      // 更新任务状态为失败
      await this.updateTaskStatus(taskId, 'failed', error.message)

      // 记录错误日志
      await this.logWorkflowStep(taskId, 'error', {
        error_message: error.message,
        error_type: error.constructor.name,
        stack: error.stack
      })

      // 尝试清理临时资源
      await this.cleanupFailedTask(taskId)

      return {
        success: false,
        message: error.message,
        error_details: {
          task_id: taskId,
          type: type,
          timestamp: new Date(),
          error_type: error.constructor.name
        }
      }

    } catch (cleanupError) {
      console.error('❌ 错误处理失败:', cleanupError.message)

      return {
        success: false,
        message: `原始错误: ${error.message}; 清理错误: ${cleanupError.message}`
      }
    }
  }

  /**
   * 清理失败的任务
   * @param {string} taskId - 任务ID
   */
  async cleanupFailedTask(taskId) {
    try {
      console.log(`🗑️ 清理失败任务: ${taskId}`)

      // 这里可以添加清理逻辑，比如删除临时文件等
      // 目前只记录日志
      await this.logWorkflowStep(taskId, 'cleanup', {
        message: '失败任务清理完成'
      })

    } catch (error) {
      console.warn('⚠️ 任务清理失败:', error.message)
    }
  }

  /**
   * 获取任务进度
   * @param {string} taskId - 任务ID
   * @returns {Object} 进度信息
   */
  async getTaskProgress(taskId) {
    try {
      const taskResult = await this.db.collection('task_queue').doc(taskId).get()

      if (!taskResult.data) {
        return { success: false, message: '任务不存在' }
      }

      const task = taskResult.data

      // 获取作品信息
      const workResult = await this.db.collection('works')
        .where({ task_id: taskId })
        .get()

      const work = workResult.data && workResult.data[0]

      return {
        success: true,
        data: {
          status: task.status,
          message: task.message || '处理中...',
          progress: this.calculateProgress(task.status),
          work_id: work ? work._id : null,
          images: work ? work.images : [],
          created_at: task.created_at,
          updated_at: task.updated_at
        }
      }

    } catch (error) {
      console.error('❌ 获取任务进度失败:', error.message)
      return { success: false, message: error.message }
    }
  }

  /**
   * 计算进度百分比
   * @param {string} status - 任务状态
   * @returns {number} 进度百分比
   */
  calculateProgress(status) {
    const progressMap = {
      'pending': 0,
      'processing': 20,
      'ai_processing': 50,
      'watermarking': 70,
      'uploading': 85,
      'completed': 100,
      'failed': 0
    }

    return progressMap[status] || 0
  }
}

module.exports = WorkflowOrchestrator