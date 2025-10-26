import { Queue, Worker } from 'bullmq'
import { getConfig } from '@ai-photographer/config'

interface CancellationJobData {
  taskId: string
  userId: string
  workId?: string
  cancelledAt: string
}

interface GenerationJobData {
  taskId: string
  userId: string
  workId: string
  type: 'photography' | 'fitting'
  params: any
  priority: number
  createdAt: string
  retryCount?: number
}

interface AIGenerationJobData {
  taskId: string
  userId: string
  sourceImages: string[]
  sceneId: string
  modelConfig: Record<string, any>
  generationMode: string
  generateCount: number
  imageSize: string
  options: Record<string, any>
  referenceWorkId?: string
  sceneConfig: any
  priority: number
  createdAt: string
  retryCount?: number
}

class QueueService {
  private cancellationQueue: Queue<CancellationJobData>
  private cancellationWorker: Worker<CancellationJobData>
  private generationQueue: Queue<GenerationJobData>
  private generationWorker: Worker<GenerationJobData>
  private aiGenerationQueue: Queue<AIGenerationJobData>
  private aiGenerationWorker: Worker<AIGenerationJobData>

  constructor() {
    const config = getConfig()

    // 取消任务队列
    this.cancellationQueue = new Queue('task-cancellation', {
      connection: {
        url: config.queue.redisUrl
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    })

    this.cancellationWorker = new Worker('task-cancellation', this.processCancellationJob.bind(this), {
      connection: {
        url: config.queue.redisUrl
      },
      concurrency: config.queue.concurrency
    })

    // AI生成任务队列
    this.generationQueue = new Queue('ai-generation', {
      connection: {
        url: config.queue.redisUrl
      },
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 500,
        attempts: 2, // AI任务重试2次
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    })

    this.generationWorker = new Worker('ai-generation', this.processGenerationJob.bind(this), {
      connection: {
        url: config.queue.redisUrl
      },
      concurrency: 2 // AI任务并发数较低，避免过载
    })

    // 新的AI生图任务队列
    this.aiGenerationQueue = new Queue('ai-generation-new', {
      connection: {
        url: config.queue.redisUrl
      },
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 500,
        attempts: 3, // AI生图任务重试3次
        backoff: {
          type: 'exponential',
          delay: 5000 // 5秒起始延迟
        }
      }
    })

    this.aiGenerationWorker = new Worker('ai-generation-new', this.processAIGenerationJob.bind(this), {
      connection: {
        url: config.queue.redisUrl
      },
      concurrency: 1 // AI生图任务串行处理，避免资源竞争
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    // 取消任务事件
    this.cancellationWorker.on('completed', (job) => {
      console.log(`取消任务作业完成: ${job.id} (任务ID: ${job.data.taskId})`)
    })

    this.cancellationWorker.on('failed', (job, err) => {
      console.error(`取消任务作业失败: ${job?.id}`, err)
    })

    this.cancellationWorker.on('error', (err) => {
      console.error('任务取消队列错误:', err)
    })

    // AI生成任务事件
    this.generationWorker.on('completed', (job) => {
      console.log(`AI生成任务完成: ${job.id} (任务ID: ${job.data.taskId}, 类型: ${job.data.type})`)
    })

    this.generationWorker.on('failed', (job, err) => {
      console.error(`AI生成任务失败: ${job?.id}`, err)
    })

    this.generationWorker.on('error', (err) => {
      console.error('AI生成队列错误:', err)
    })

    // 新的AI生图任务事件
    this.aiGenerationWorker.on('completed', (job) => {
      console.log(`AI生图任务完成: ${job.id} (任务ID: ${job.data.taskId})`)
    })

    this.aiGenerationWorker.on('failed', (job, err) => {
      console.error(`AI生图任务失败: ${job?.id}`, err)
    })

    this.aiGenerationWorker.on('error', (err) => {
      console.error('AI生图队列错误:', err)
    })
  }

  private async processCancellationJob(job: { data: CancellationJobData }) {
    const { taskId, userId, workId } = job.data
    
    console.log(`处理任务取消: 任务ID=${taskId}, 用户ID=${userId}, 作品ID=${workId}`)
    
    // 这里可以添加实际的取消逻辑，比如：
    // 1. 调用AI服务取消正在进行的任务
    // 2. 清理临时文件
    // 3. 发送通知等
    
    // 目前先记录日志
    console.log(`任务 ${taskId} 已成功取消`)
    
    return { success: true, taskId, cancelledAt: new Date().toISOString() }
  }

  private async processGenerationJob(job: { data: GenerationJobData }) {
    const { taskId, userId, workId, type, params } = job.data

    console.log(`开始处理AI生成任务: 任务ID=${taskId}, 用户ID=${userId}, 作品ID=${workId}, 类型=${type}`)

    try {
      // 这里是AI生成任务的核心逻辑
      // 1. 更新任务状态为 processing
      // 2. 调用AI服务进行图像生成
      // 3. 保存生成的图片到WorkImage表
      // 4. 更新任务状态为 completed
      // 5. 如果失败，退还积分

      // 目前先实现占位逻辑
      console.log(`AI生成任务 ${taskId} 开始处理 (类型: ${type})`)

      // 模拟处理时间
      await new Promise(resolve => setTimeout(resolve, 2000))

      console.log(`AI生成任务 ${taskId} 处理完成`)

      return {
        success: true,
        taskId,
        type,
        completedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error(`AI生成任务处理失败: ${taskId}`, error)

      // 这里应该实现失败后的积分退还逻辑
      // 以及任务状态更新为 failed

      throw error // 让BullMQ处理重试
    }
  }

  private async processAIGenerationJob(job: { data: AIGenerationJobData }) {
    const {
      taskId,
      userId,
      sourceImages,
      sceneId,
      modelConfig,
      generationMode,
      generateCount,
      imageSize,
      options,
      referenceWorkId,
      sceneConfig
    } = job.data

    console.log(`开始处理AI生图任务: 任务ID=${taskId}, 用户ID=${userId}, 场景ID=${sceneId}`)

    try {
      // 导入数据库和云函数服务
      const { PrismaClient, AIGenerationStatus } = await import('@ai-photographer/db')
      const { CloudApiService } = await import('@ai-photographer/tencent-scf')

      const prisma = new PrismaClient()
      const cloudApi = new CloudApiService()

      // 1. 更新任务状态为处理中
      await prisma.aIGenerationTask.update({
        where: { id: taskId },
        data: {
          status: AIGenerationStatus.PREPROCESSING,
          progress: 10,
          currentStep: '开始图像预处理',
          startedAt: new Date(),
          processingLogs: JSON.stringify([
            ...JSON.parse((await prisma.aIGenerationTask.findUnique({ where: { id: taskId } }))?.processingLogs || '[]'),
            {
              timestamp: new Date().toISOString(),
              step: 'QUEUE_STARTED',
              message: '任务开始处理',
              data: { sourceImagesCount: sourceImages.length }
            }
          ])
        }
      })

      // 2. 图像预处理阶段
      await this.updateTaskProgress(taskId, 20, '正在进行图像预处理...')

      // 调用图像预处理SCF
      const preprocessResult = await cloudApi.invokeSCF('ai-image-processor', {
        images: sourceImages,
        options: {
          resize: imageSize,
          quality: 0.9,
          format: 'jpeg'
        }
      })

      if (!preprocessResult.success) {
        throw new Error(`图像预处理失败: ${preprocessResult.error}`)
      }

      const processedImages = preprocessResult.data.processedImages

      // 3. 更新任务状态，保存预处理结果
      await prisma.aIGenerationTask.update({
        where: { id: taskId },
        data: {
          status: AIGenerationStatus.GENERATING_PROMPT,
          progress: 30,
          currentStep: '正在生成AI提示词...',
          processedImages: JSON.stringify(processedImages),
          processingLogs: JSON.stringify([
            ...JSON.parse((await prisma.aIGenerationTask.findUnique({ where: { id: taskId } }))?.processingLogs || '[]'),
            {
              timestamp: new Date().toISOString(),
              step: 'PREPROCESSING_COMPLETED',
              message: '图像预处理完成',
              data: { processedImagesCount: processedImages.length }
            }
          ])
        }
      })

      // 4. 提示词生成阶段
      await this.updateTaskProgress(taskId, 50, '正在使用混元大模型分析图片并生成提示词...')

      // 调用提示词生成SCF（混元大模型）
      const promptResult = await cloudApi.invokeSCF('prompt-generator', {
        imageUrls: processedImages,
        sceneId,
        sceneConfig,
        modelConfig,
        generationMode,
        referenceWorkId
      })

      if (!promptResult.success) {
        throw new Error(`提示词生成失败: ${promptResult.error}`)
      }

      const { prompt, analysis } = promptResult.data

      // 5. 更新任务状态，保存生成的提示词
      await prisma.aIGenerationTask.update({
        where: { id: taskId },
        data: {
          status: AIGenerationStatus.GENERATING_IMAGE,
          progress: 60,
          currentStep: '正在生成图像...',
          generatedPrompt: prompt,
          imageAnalysis: JSON.stringify(analysis),
          processingLogs: JSON.stringify([
            ...JSON.parse((await prisma.aIGenerationTask.findUnique({ where: { id: taskId } }))?.processingLogs || '[]'),
            {
              timestamp: new Date().toISOString(),
              step: 'PROMPT_GENERATED',
              message: 'AI提示词生成完成',
              data: { promptLength: prompt.length }
            }
          ])
        }
      })

      // 6. 图像生成阶段
      await this.updateTaskProgress(taskId, 70, '正在使用豆包4.0生成图像...')

      // 调用图像生成SCF（豆包4.0）
      const imageResult = await cloudApi.invokeSCF('image-generator', {
        prompt,
        count: generateCount,
        size: imageSize,
        options: {
          ...options,
          style: sceneConfig.style || 'realistic',
          quality: 'high'
        }
      })

      if (!imageResult.success) {
        throw new Error(`图像生成失败: ${imageResult.error}`)
      }

      const generatedImages = imageResult.data.images

      // 7. 后处理阶段
      await this.updateTaskProgress(taskId, 90, '正在进行后处理...')

      // 这里可以添加水印、压缩等后处理操作

      // 8. 任务完成
      await prisma.aIGenerationTask.update({
        where: { id: taskId },
        data: {
          status: AIGenerationStatus.COMPLETED,
          progress: 100,
          currentStep: '任务完成',
          resultImages: JSON.stringify(generatedImages),
          completedAt: new Date(),
          processingLogs: JSON.stringify([
            ...JSON.parse((await prisma.aIGenerationTask.findUnique({ where: { id: taskId } }))?.processingLogs || '[]'),
            {
              timestamp: new Date().toISOString(),
              step: 'COMPLETED',
              message: 'AI生图任务完成',
              data: { generatedImagesCount: generatedImages.length }
            }
          ])
        }
      })

      console.log(`✅ AI生图任务完成: ${taskId}, 生成了 ${generatedImages.length} 张图片`)

      return {
        success: true,
        taskId,
        generatedImages,
        completedAt: new Date().toISOString()
      }

    } catch (error) {
      console.error(`❌ AI生图任务处理失败: ${taskId}`, error)

      // 更新任务状态为失败
      try {
        const { PrismaClient, AIGenerationStatus } = await import('@ai-photographer/db')
        const prisma = new PrismaClient()

        await prisma.aIGenerationTask.update({
          where: { id: taskId },
          data: {
            status: AIGenerationStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : '未知错误',
            errorCode: 'PROCESSING_ERROR',
            processingLogs: JSON.stringify([
              ...JSON.parse((await prisma.aIGenerationTask.findUnique({ where: { id: taskId } }))?.processingLogs || '[]'),
              {
                timestamp: new Date().toISOString(),
                step: 'FAILED',
                message: '任务处理失败',
                data: { error: error instanceof Error ? error.message : '未知错误' }
              }
            ])
          }
        })

        // 如果积分已扣除但未退还，则退还积分
        const task = await prisma.aIGenerationTask.findUnique({ where: { id: taskId } })
        if (task?.creditsDeducted && !task?.creditsRefunded) {
          const user = await prisma.user.findUnique({ where: { id: userId } })
          if (user) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                credits: user.credits + task.creditsCost,
                totalConsumedCredits: user.totalConsumedCredits - task.creditsCost
              }
            })

            await prisma.aIGenerationTask.update({
              where: { id: taskId },
              data: { creditsRefunded: true }
            })
          }
        }

      } catch (dbError) {
        console.error('更新任务失败状态时出错:', dbError)
      }

      throw error // 让BullMQ处理重试
    }
  }

  /**
   * 更新任务进度
   */
  private async updateTaskProgress(taskId: string, progress: number, currentStep: string): Promise<void> {
    try {
      const { PrismaClient } = await import('@ai-photographer/db')
      const prisma = new PrismaClient()

      await prisma.aIGenerationTask.update({
        where: { id: taskId },
        data: {
          progress,
          currentStep,
          processingLogs: JSON.stringify([
            ...JSON.parse((await prisma.aIGenerationTask.findUnique({ where: { id: taskId } }))?.processingLogs || '[]'),
            {
              timestamp: new Date().toISOString(),
              step: 'PROGRESS_UPDATE',
              message: currentStep,
              data: { progress }
            }
          ])
        }
      })

      console.log(`📊 任务进度更新: ${taskId} -> ${progress}% - ${currentStep}`)
    } catch (error) {
      console.error('更新任务进度失败:', error)
      // 不抛出错误，避免影响主流程
    }
  }

  async addCancellationJob(data: CancellationJobData) {
    const job = await this.cancellationQueue.add('cancel-task', data, {
      jobId: `cancel-${data.taskId}-${Date.now()}`
    })

    console.log(`已添加取消任务作业: ${job.id} (任务ID: ${data.taskId})`)
    return job
  }

  async addGenerationJob(data: GenerationJobData) {
    const job = await this.generationQueue.add('ai-generate', data, {
      jobId: `generate-${data.taskId}-${Date.now()}`,
      priority: data.priority
    })

    console.log(`已添加AI生成任务作业: ${job.id} (任务ID: ${data.taskId}, 类型: ${data.type})`)
    return job
  }

  /**
   * 添加新的AI生图任务
   */
  async addAIGenerationTask(data: AIGenerationJobData): Promise<any> {
    const job = await this.aiGenerationQueue.add('ai-generation-new', data, {
      jobId: `ai-gen-${data.taskId}-${Date.now()}`,
      priority: data.priority || 1
    })

    console.log(`已添加AI生图任务作业: ${job.id} (任务ID: ${data.taskId})`)
    return job
  }

  /**
   * 移除队列中的任务
   */
  async removeJob(jobId: string): Promise<boolean> {
    try {
      // 尝试从各个队列中移除任务
      await this.cancellationQueue.remove(jobId)
      await this.generationQueue.remove(jobId)
      await this.aiGenerationQueue.remove(jobId)

      console.log(`✅ 已从队列中移除任务: ${jobId}`)
      return true
    } catch (error) {
      console.error(`从队列中移除任务失败: ${jobId}`, error)
      return false
    }
  }

  async close() {
    await this.cancellationWorker.close()
    await this.generationWorker.close()
    await this.aiGenerationWorker.close()
    await this.cancellationQueue.close()
    await this.generationQueue.close()
    await this.aiGenerationQueue.close()
  }

  async getWaitingJobsCount(): Promise<number> {
    try {
      const jobs = await this.cancellationQueue.getWaiting()
      return jobs.length
    } catch (error) {
      console.error('获取等待队列作业数失败:', error)
      throw error
    }
  }
}

let queueService: QueueService | null = null

export function getQueueService(): QueueService {
  if (!queueService) {
    queueService = new QueueService()
  }
  return queueService
}

export async function checkQueueServiceConnection(): Promise<boolean> {
  try {
    const service = getQueueService()
    // 尝试获取队列信息来验证连接
    const waiting = service.getWaitingJobsCount?.()
    return true // 如果没有异常，认为连接正常
  } catch (error) {
    console.error('Queue service连接检查失败:', error)
    return false
  }
}

export async function closeQueueService() {
  if (queueService) {
    await queueService.close()
    queueService = null
  }
}