import { PrismaClient, AIGenerationStatus, GenerationMode } from '@ai-photographer/db'
import { v4 as uuidv4 } from 'uuid'
import { QueueService } from './queue-service.js'

const prisma = new PrismaClient()

export interface CreateAIGenerationTaskParams {
  userId: string
  sourceImages: string[]
  sceneId: string
  modelConfig?: Record<string, any>
  generationMode?: GenerationMode
  generateCount?: number
  imageSize?: string
  options?: Record<string, any>
  referenceWorkId?: string
}

export interface AIGenerationTaskResponse {
  id: string
  status: AIGenerationStatus
  progress: number
  estimatedCredits: number
  currentStep?: string
  estimatedTime?: number
}

export class AIGenerationService {
  private queueService: QueueService

  constructor() {
    this.queueService = new QueueService()
  }

  /**
   * 创建AI生图任务
   */
  async createTask(params: CreateAIGenerationTaskParams): Promise<AIGenerationTaskResponse> {
    const {
      userId,
      sourceImages,
      sceneId,
      modelConfig = {},
      generationMode = GenerationMode.NORMAL,
      generateCount = 4,
      imageSize = '1024x1024',
      options = {},
      referenceWorkId
    } = params

    // 1. 验证用户积分
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      throw new Error('用户不存在')
    }

    // 2. 获取场景配置
    const scene = await prisma.scene.findUnique({
      where: { id: sceneId }
    })

    if (!scene || !scene.isActive) {
      throw new Error('场景不存在或已禁用')
    }

    // 3. 计算积分消耗
    const estimatedCredits = this.calculateCredits(scene, generateCount, generationMode)

    if (user.credits < estimatedCredits) {
      throw new Error(`积分不足，需要 ${estimatedCredits} 积分，当前余额 ${user.credits}`)
    }

    // 4. 检查并发任务限制
    const activeTaskCount = await prisma.aIGenerationTask.count({
      where: {
        userId,
        status: {
          in: [
            AIGenerationStatus.PENDING,
            AIGenerationStatus.PREPROCESSING,
            AIGenerationStatus.GENERATING_PROMPT,
            AIGenerationStatus.GENERATING_IMAGE,
            AIGenerationStatus.POSTPROCESSING
          ]
        }
      }
    })

    if (activeTaskCount >= 3) {
      throw new Error('同时进行的任务数量已达上限（3个），请等待现有任务完成')
    }

    // 5. 验证图片数量
    if (sourceImages.length < 1 || sourceImages.length > 5) {
      throw new Error('上传图片数量应在1-5张之间')
    }

    // 6. 创建任务记录
    const task = await prisma.aIGenerationTask.create({
      data: {
        id: uuidv4(),
        userId,
        sourceImages,
        sceneId,
        modelConfig,
        generationMode,
        generateCount,
        imageSize,
        options,
        referenceWorkId,
        creditsCost: estimatedCredits,
        status: AIGenerationStatus.PENDING,
        progress: 0,
        currentStep: '任务已创建，等待处理',
        estimatedTime: this.calculateEstimatedTime(generateCount, generationMode),
        processingLogs: JSON.stringify([{
          timestamp: new Date().toISOString(),
          step: 'CREATED',
          message: '任务创建成功',
          data: { estimatedCredits, generateCount, sceneName: scene.name }
        }])
      },
      include: {
        scene: true
      }
    })

    // 7. 预扣除积分
    await prisma.user.update({
      where: { id: userId },
      data: {
        credits: user.credits - estimatedCredits,
        totalConsumedCredits: user.totalConsumedCredits + estimatedCredits
      }
    })

    // 记录积分消费
    await prisma.creditRecord.create({
      data: {
        id: uuidv4(),
        userId,
        type: 'ai_generation',
        amount: -estimatedCredits,
        description: `AI生图任务创建 - ${scene.name}`,
        taskId: task.id,
        balanceAfter: user.credits - estimatedCredits,
        createdAt: new Date()
      }
    })

    // 8. 更新任务状态为已扣除积分
    await prisma.aIGenerationTask.update({
      where: { id: task.id },
      data: {
        creditsDeducted: true,
        processingLogs: JSON.stringify([
          ...JSON.parse(task.processingLogs || '[]'),
          {
            timestamp: new Date().toISOString(),
            step: 'CREDITS_DEDUCTED',
            message: `已扣除 ${estimatedCredits} 积分`,
            data: { remainingCredits: user.credits - estimatedCredits }
          }
        ])
      }
    })

    // 9. 发布任务到队列
    try {
      const queueJobId = await this.queueService.addAIGenerationTask({
        taskId: task.id,
        userId,
        sourceImages,
        sceneId,
        modelConfig,
        generationMode,
        generateCount,
        imageSize,
        options,
        referenceWorkId,
        sceneConfig: scene
      })

      // 10. 更新队列任务ID
      await prisma.aIGenerationTask.update({
        where: { id: task.id },
        data: { queueJobId }
      })

      // 11. 更新场景使用统计
      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          usageCount: scene.usageCount + 1
        }
      })

      console.log(`✅ AI生图任务创建成功: ${task.id}, 队列任务ID: ${queueJobId}`)

      return {
        id: task.id,
        status: task.status,
        progress: task.progress,
        estimatedCredits,
        currentStep: task.currentStep || undefined,
        estimatedTime: task.estimatedTime || undefined
      }

    } catch (queueError) {
      console.error('❌ 发布任务到队列失败:', queueError)

      // 任务发布失败，退还积分
      await prisma.user.update({
        where: { id: userId },
        data: {
          credits: user.credits, // 恢复原积分
          totalConsumedCredits: user.totalConsumedCredits - estimatedCredits
        }
      })

      // 标记任务为失败
      await prisma.aIGenerationTask.update({
        where: { id: task.id },
        data: {
          status: AIGenerationStatus.FAILED,
          errorMessage: '任务队列发布失败',
          creditsRefunded: true,
          processingLogs: JSON.stringify([
            ...JSON.parse(task.processingLogs || '[]'),
            {
              timestamp: new Date().toISOString(),
              step: 'QUEUE_FAILED',
              message: '任务队列发布失败，积分已退还',
              data: { error: queueError instanceof Error ? queueError.message : '未知错误' }
            }
          ])
        }
      })

      throw new Error('任务创建失败，请稍后重试')
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string, userId?: string): Promise<any> {
    const whereClause: any = { id: taskId }
    if (userId) {
      whereClause.userId = userId
    }

    const task = await prisma.aIGenerationTask.findFirst({
      where: whereClause,
      include: {
        scene: {
          select: {
            id: true,
            name: true,
            category: true,
            previewImage: true
          }
        }
      }
    })

    if (!task) {
      throw new Error('任务不存在')
    }

    // 解析处理日志
    let processingLogs = []
    try {
      processingLogs = JSON.parse(task.processingLogs || '[]')
    } catch (error) {
      console.error('解析处理日志失败:', error)
    }

    return {
      id: task.id,
      status: task.status,
      progress: task.progress,
      currentStep: task.currentStep,
      estimatedTime: task.estimatedTime,
      scene: task.scene,
      generateCount: task.generateCount,
      imageSize: task.imageSize,
      generationMode: task.generationMode,
      resultImages: task.resultImages ? JSON.parse(task.resultImages as string) : [],
      processingLogs,
      error: task.errorMessage ? {
        code: task.errorCode,
        message: task.errorMessage
      } : null,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      cancelledAt: task.cancelledAt
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string, userId: string): Promise<void> {
    const task = await prisma.aIGenerationTask.findFirst({
      where: {
        id: taskId,
        userId
      }
    })

    if (!task) {
      throw new Error('任务不存在')
    }

    // 检查任务状态，只有未开始或处理中的任务可以取消
    const cancelableStatuses = [
      AIGenerationStatus.PENDING,
      AIGenerationStatus.PREPROCESSING,
      AIGenerationStatus.GENERATING_PROMPT,
      AIGenerationStatus.GENERATING_IMAGE,
      AIGenerationStatus.POSTPROCESSING
    ]

    if (!cancelableStatuses.includes(task.status)) {
      throw new Error('任务状态不允许取消')
    }

    // 更新任务状态为已取消
    await prisma.aIGenerationTask.update({
      where: { id: taskId },
      data: {
        status: AIGenerationStatus.CANCELLED,
        cancelledAt: new Date(),
        currentStep: '任务已取消',
        processingLogs: JSON.stringify([
          ...JSON.parse(task.processingLogs || '[]'),
          {
            timestamp: new Date().toISOString(),
            step: 'CANCELLED',
            message: '用户主动取消任务',
            data: {}
          }
        ])
      }
    })

    // 尝试从队列中移除任务
    if (task.queueJobId) {
      try {
        await this.queueService.removeJob(task.queueJobId)
        console.log(`✅ 已从队列中移除任务: ${task.queueJobId}`)
      } catch (error) {
        console.error('从队列中移除任务失败:', error)
        // 不抛出错误，因为任务可能已经开始处理
      }
    }

    // 退还积分
    if (task.creditsDeducted && !task.creditsRefunded) {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (user) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            credits: user.credits + task.creditsCost,
            totalConsumedCredits: user.totalConsumedCredits - task.creditsCost
          }
        })

        // 记录积分退还
        await prisma.creditRecord.create({
          data: {
            id: uuidv4(),
            userId,
            type: 'refund',
            amount: task.creditsCost,
            description: `AI生图任务取消退款 - ${task.id}`,
            taskId: task.id,
            balanceAfter: user.credits + task.creditsCost,
            createdAt: new Date()
          }
        })

        // 标记任务为已退还积分
        await prisma.aIGenerationTask.update({
          where: { id: taskId },
          data: {
            creditsRefunded: true,
            processingLogs: JSON.stringify([
              ...JSON.parse(task.processingLogs || '[]'),
              {
                timestamp: new Date().toISOString(),
                step: 'CREDITS_REFUNDED',
                message: `已退还 ${task.creditsCost} 积分`,
                data: { refundedCredits: task.creditsCost }
              }
            ])
          }
        })
      }
    }

    console.log(`✅ AI生图任务已取消: ${taskId}`)
  }

  /**
   * 获取用户的任务列表
   */
  async getUserTasks(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: AIGenerationStatus
  ): Promise<any> {
    const offset = (page - 1) * limit

    const whereClause: any = { userId }
    if (status) {
      whereClause.status = status
    }

    const [tasks, total] = await Promise.all([
      prisma.aIGenerationTask.findMany({
        where: whereClause,
        include: {
          scene: {
            select: {
              id: true,
              name: true,
              category: true,
              previewImage: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.aIGenerationTask.count({ where: whereClause })
    ])

    return {
      tasks: tasks.map(task => ({
        id: task.id,
        status: task.status,
        progress: task.progress,
        currentStep: task.currentStep,
        scene: task.scene,
        generateCount: task.generateCount,
        generationMode: task.generationMode,
        resultImages: task.resultImages ? JSON.parse(task.resultImages as string) : [],
        creditsCost: task.creditsCost,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        cancelledAt: task.cancelledAt
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  /**
   * 计算积分消耗
   */
  private calculateCredits(
    scene: any,
    generateCount: number,
    generationMode: GenerationMode
  ): number {
    let baseCost = scene.baseCredits + (scene.creditsPerImage * generateCount)

    // 根据生成模式调整积分消耗
    switch (generationMode) {
      case GenerationMode.POSE_VARIATION:
        baseCost = Math.floor(baseCost * 0.8) // 姿势裂变优惠20%
        break
      case GenerationMode.STYLE_TRANSFER:
        baseCost = Math.floor(baseCost * 1.2) // 风格迁移增加20%
        break
      case GenerationMode.ENHANCEMENT:
        baseCost = Math.floor(baseCost * 0.6) // 图像增强优惠40%
        break
      default:
        break
    }

    // 高级场景额外费用
    if (scene.isPremium) {
      baseCost = Math.floor(baseCost * 1.5)
    }

    return baseCost
  }

  /**
   * 计算预估处理时间（秒）
   */
  private calculateEstimatedTime(generateCount: number, generationMode: GenerationMode): number {
    let baseTime = 120 // 基础时间2分钟

    // 根据生成数量调整
    baseTime += (generateCount - 1) * 30

    // 根据生成模式调整
    switch (generationMode) {
      case GenerationMode.POSE_VARIATION:
        baseTime = Math.floor(baseTime * 0.7) // 姿势裂变快30%
        break
      case GenerationMode.STYLE_TRANSFER:
        baseTime = Math.floor(baseTime * 1.3) // 风格迁移慢30%
        break
      case GenerationMode.ENHANCEMENT:
        baseTime = Math.floor(baseTime * 0.5) // 图像增强快50%
        break
      default:
        break
    }

    return baseTime
  }
}