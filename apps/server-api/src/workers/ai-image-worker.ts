/**
 * AI图像生成 BullMQ Worker
 * 处理异步的AI图像生成任务
 *
 * @author 老王
 * @version 3.0.0
 */

import { Worker, Job } from 'bullmq'
import { redisConnection } from '../config/redis.js'
import { scfService } from '../services/scf-service.js'
import { aiImageService } from '../services/ai-image-service.js'

// 任务类型定义
export interface AIImageJobData {
  type: 'FULL_GENERATION' | 'PREPROCESS_ONLY' | 'PROMPT_ONLY' | 'GENERATE_ONLY'
  userId: string
  taskId: string
  params: any
  priority?: number
  retryCount?: number
}

export interface AIImageJobResult {
  taskId: string
  type: string
  status: 'completed' | 'failed' | 'retrying'
  data?: any
  error?: string
  processingTime: number
  timestamp: string
}

/**
 * AI图像Worker类
 */
export class AIImageWorker {
  private worker: Worker<AIImageJobData, AIImageJobResult>
  private isProcessing = new Set<string>()

  constructor() {
    this.worker = new Worker<AIImageJobData, AIImageJobResult>(
      'ai-image-queue',
      this.processJob.bind(this),
      {
        connection: redisConnection,
        concurrency: 3, // 并发处理3个任务
        limiter: {
          max: 10, // 每10秒最多处理10个任务
          duration: 10000,
        },
        defaultJobOptions: {
          removeOnComplete: 100, // 保留最近100个完成的任务
          removeOnFail: 50,      // 保留最近50个失败的任务
          attempts: 3,           // 最多重试3次
          backoff: {
            type: 'exponential',
            delay: 5000,        // 初始延迟5秒
          },
        },
      }
    )

    this.setupEventHandlers()
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers() {
    this.worker.on('completed', (job: Job<AIImageJobData, AIImageJobResult>, result) => {
      console.log(`✅ AI图像任务完成: ${job.id}, 类型: ${result.type}, 耗时: ${result.processingTime}ms`)
      this.isProcessing.delete(result.taskId)
    })

    this.worker.on('failed', (job: Job<AIImageJobData, AIImageJobResult> | undefined, err) => {
      const taskId = job?.data.taskId || 'unknown'
      const type = job?.data.type || 'unknown'
      console.error(`❌ AI图像任务失败: ${job?.id}, 类型: ${type}, 错误:`, err)
      this.isProcessing.delete(taskId)
    })

    this.worker.on('error', (err) => {
      console.error('🔥 AI图像Worker错误:', err)
    })

    this.worker.on('stalled', (job) => {
      console.warn(`⚠️ AI图像任务停滞: ${job.id}`)
    })
  }

  /**
   * 处理任务
   */
  private async processJob(job: Job<AIImageJobData, AIImageJobResult>): Promise<AIImageJobResult> {
    const { data } = job
    const startTime = Date.now()

    console.log(`🚀 开始处理AI图像任务: ${job.id}, 类型: ${data.type}, 用户: ${data.userId}`)

    // 检查是否已在处理中（防止重复处理）
    if (this.isProcessing.has(data.taskId)) {
      throw new Error(`任务 ${data.taskId} 已在处理中`)
    }

    this.isProcessing.add(data.taskId)

    try {
      let result: any
      let status: 'completed' | 'failed' = 'completed'

      switch (data.type) {
        case 'FULL_GENERATION':
          result = await this.handleFullGeneration(data)
          break

        case 'PREPROCESS_ONLY':
          result = await this.handlePreprocessOnly(data)
          break

        case 'PROMPT_ONLY':
          result = await this.handlePromptOnly(data)
          break

        case 'GENERATE_ONLY':
          result = await this.handleGenerateOnly(data)
          break

        default:
          throw new Error(`未知的任务类型: ${data.type}`)
      }

      const processingTime = Date.now() - startTime

      return {
        taskId: data.taskId,
        type: data.type,
        status,
        data: result,
        processingTime,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      const processingTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      console.error(`❌ AI图像任务处理失败: ${data.taskId}`, error)

      return {
        taskId: data.taskId,
        type: data.type,
        status: 'failed',
        error: errorMessage,
        processingTime,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 处理完整生成流程
   */
  private async handleFullGeneration(data: AIImageJobData) {
    console.log(`🎨 执行完整生成流程: ${data.taskId}`)

    const result = await aiImageService.generateImages(data.params)

    if (result.status === 'failed') {
      throw new Error(result.error || '完整生成流程失败')
    }

    return result
  }

  /**
   * 处理仅预处理
   */
  private async handlePreprocessOnly(data: AIImageJobData) {
    console.log(`🔧 执行图像预处理: ${data.taskId}`)

    const { images, options } = data.params

    // 批量处理图像
    const batchResults = await scfService.callBatch(
      images.map((imageUrl: string) => ({
        functionName: 'ai-image-processor' as const,
        params: {
          action: 'compressImage',
          imageUrl,
          quality: options?.quality || 85
        }
      }))
    )

    // 对成功的图像进行后续处理
    const processedImages: any[] = []
    for (let i = 0; i < batchResults.length; i++) {
      const batchResult = batchResults[i]
      if (batchResult.success && batchResult.data.success) {
        // 尺寸调整
        if (options?.resize) {
          try {
            const resizeResult = await scfService.callImageProcessor('resizeImage', {
              imageUrl: batchResult.data.data.processedUrl,
              ...options.resize
            })

            processedImages.push({
              originalUrl: images[i],
              processedUrl: resizeResult.data.processedUrl,
              operations: ['compress', 'resize']
            })
          } catch (error) {
            processedImages.push({
              originalUrl: images[i],
              processedUrl: batchResult.data.data.processedUrl,
              operations: ['compress']
            })
          }
        } else {
          processedImages.push({
            originalUrl: images[i],
            processedUrl: batchResult.data.data.processedUrl,
            operations: ['compress']
          })
        }
      } else {
        processedImages.push({
          originalUrl: images[i],
          error: batchResult.error?.message || '处理失败'
        })
      }
    }

    return {
      processedImages,
      totalCount: images.length,
      successCount: processedImages.filter(img => img.processedUrl).length
    }
  }

  /**
   * 处理仅生成提示词
   */
  private async handlePromptOnly(data: AIImageJobData) {
    console.log(`🧠 执行提示词生成: ${data.taskId}`)

    const result = await aiImageService.onlyGeneratePrompt(data.params)
    return result
  }

  /**
   * 处理仅生成图像
   */
  private async handleGenerateOnly(data: AIImageJobData) {
    console.log(`🎨 执行图像生成: ${data.taskId}`)

    const result = await aiImageService.onlyGenerateImages(data.params)

    // 如果需要后处理
    if (data.params.postProcess) {
      const postProcessedImages = await this.postProcessImages(result)
      return {
        images: postProcessedImages,
        originalImages: result,
        postProcessed: true
      }
    }

    return {
      images: result,
      postProcessed: false
    }
  }

  /**
   * 图像后处理
   */
  private async postProcessImages(images: any[]) {
    console.log(`✨ 执行图像后处理: ${images.length}张图片`)

    const batchResults = await scfService.callBatch(
      images.map((image) => ({
        functionName: 'ai-image-processor' as const,
        params: {
          action: 'watermark',
          imageUrl: image.url,
          watermark: {
            text: 'AI摄影师',
            font: 'ZHHeiTi',
            size: 16,
            color: '3D3D3D',
            gravity: 'SouthEast',
            dx: 10,
            dy: 10
          }
        }
      }))
    )

    return images.map((image, index) => {
      const batchResult = batchResults[index]
      if (batchResult.success && batchResult.data.success) {
        return {
          ...image,
          url: batchResult.data.data.processedUrl,
          watermarked: true
        }
      } else {
        return {
          ...image,
          watermarked: false,
          error: batchResult.error?.message
        }
      }
    })
  }

  /**
   * 获取Worker状态
   */
  async getStatus() {
    const active = await this.worker.getActive()
    const waiting = await this.worker.getWaiting()
    const completed = await this.worker.getCompleted()
    const failed = await this.worker.getFailed()

    return {
      workerId: this.worker.id,
      isRunning: this.worker.isRunning(),
      active: active.length,
      waiting: waiting.length,
      completed: completed.length,
      failed: failed.length,
      processing: Array.from(this.isProcessing),
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 优雅关闭
   */
  async close() {
    console.log('🛑 关闭AI图像Worker...')
    await this.worker.close()
    console.log('✅ AI图像Worker已关闭')
  }
}

// 创建并导出Worker实例
export const aiImageWorker = new AIImageWorker()
export default aiImageWorker

// 优雅关闭处理
process.on('SIGINT', async () => {
  console.log('📡 收到SIGINT信号，正在关闭AI图像Worker...')
  await aiImageWorker.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('📡 收到SIGTERM信号，正在关闭AI图像Worker...')
  await aiImageWorker.close()
  process.exit(0)
})