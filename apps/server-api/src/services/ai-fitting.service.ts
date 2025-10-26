import { db } from '@ai-photographer/db'
import {
  AIFittingTask,
  AIFittingStatus,
  ClothingType,
  User
} from '@ai-photographer/db'
import { cloudFunctionService } from './cloud-function.service'
import { ApiError } from '../utils/errors'
import { logger } from '../utils/logger'
import { publishMessage } from '../utils/queue'
import { generateTaskId } from '../utils/helpers'

/**
 * AI试衣任务创建参数
 */
export interface CreateFittingTaskParams {
  userId: string
  personImageUrl: string
  clothingImageUrl: string
  clothingType: ClothingType
  sceneId?: string
  generateCount?: number
  imageSize?: string
  style?: string
}

/**
 * AI试衣任务状态更新参数
 */
export interface UpdateTaskStatusParams {
  taskId: string
  status: AIFittingStatus
  progress?: number
  currentStep?: string
  estimatedTime?: number
  aiPrompt?: string
  resultImages?: string[]
  errorMessage?: string
  errorCode?: string
  processingLogs?: any[]
}

/**
 * AI试衣服务类
 */
export class AIFittingService {
  /**
   * 创建AI试衣任务
   */
  async createFittingTask(params: CreateFittingTaskParams) {
    const {
      userId,
      personImageUrl,
      clothingImageUrl,
      clothingType,
      sceneId,
      generateCount = 1,
      imageSize = '1024x1024',
      style = 'realistic'
    } = params

    // 验证用户存在且有足够积分
    const user = await db.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      throw new ApiError('用户不存在', 'USER_NOT_FOUND', 404)
    }

    // 计算积分消耗
    const creditsCost = this.calculateCreditsCost(generateCount, imageSize)

    if (user.credits < creditsCost) {
      throw new ApiError(
        `积分不足，需要${creditsCost}积分，当前余额${user.credits}积分`,
        'INSUFFICIENT_CREDITS',
        400
      )
    }

    // 生成任务ID
    const taskId = generateTaskId('fitting')

    // 创建任务记录
    const task = await db.aiFittingTask.create({
      data: {
        id: taskId,
        userId,
        personImageUrl,
        clothingImageUrl,
        clothingType,
        sceneId,
        generateCount,
        imageSize,
        style,
        creditsCost,
        status: AIFittingStatus.PENDING,
        metadata: {
          createdAt: new Date().toISOString(),
          userAgent: 'ai-fitting-api'
        }
      }
    })

    // 扣除积分
    await db.user.update({
      where: { id: userId },
      data: {
        credits: user.credits - creditsCost,
        totalConsumedCredits: user.totalConsumedCredits + creditsCost
      }
    })

    // 发布任务到队列
    await publishMessage('ai-fitting-queue', {
      taskId,
      type: 'AI_FITTING',
      data: {
        taskId,
        userId,
        personImageUrl,
        clothingImageUrl,
        clothingType,
        sceneId,
        generateCount,
        imageSize,
        style
      }
    })

    logger.info('AI试衣任务创建成功', {
      taskId,
      userId,
      clothingType,
      creditsCost
    })

    return {
      taskId,
      status: task.status,
      creditsCost,
      estimatedTime: this.calculateEstimatedTime(generateCount, imageSize)
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string, userId?: string) {
    const whereClause: any = { id: taskId }
    if (userId) {
      whereClause.userId = userId
    }

    const task = await db.aiFittingTask.findFirst({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true
          }
        }
      }
    })

    if (!task) {
      throw new ApiError('任务不存在', 'TASK_NOT_FOUND', 404)
    }

    return task
  }

  /**
   * 更新任务状态（回调接口）
   */
  async handleCallback(params: UpdateTaskStatusParams) {
    const {
      taskId,
      status,
      progress = 0,
      currentStep,
      estimatedTime,
      aiPrompt,
      resultImages,
      errorMessage,
      errorCode,
      processingLogs
    } = params

    const updateData: any = {
      status,
      progress,
      currentStep,
      estimatedTime
    }

    if (aiPrompt) {
      updateData.aiPrompt = aiPrompt
    }

    if (resultImages) {
      updateData.resultImages = resultImages
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage
      updateData.errorCode = errorCode || 'UNKNOWN_ERROR'
    }

    if (processingLogs) {
      updateData.processingLogs = processingLogs
    }

    // 设置时间戳
    if (status === AIFittingStatus.COMPLETED) {
      updateData.completedAt = new Date()
    } else if (status === AIFittingStatus.PREPROCESSING && !updateData.startedAt) {
      updateData.startedAt = new Date()
    } else if (status === AIFittingStatus.CANCELLED) {
      updateData.cancelledAt = new Date()
    }

    const task = await db.aiFittingTask.update({
      where: { id: taskId },
      data: updateData
    })

    // 如果任务完成，创建Work记录
    if (status === AIFittingStatus.COMPLETED && resultImages && resultImages.length > 0) {
      await this.createWorkRecord(taskId, resultImages)
    }

    logger.info('AI试衣任务状态更新', {
      taskId,
      status,
      progress,
      hasError: !!errorMessage
    })

    return task
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string, userId: string) {
    const task = await db.aiFittingTask.findFirst({
      where: { id: taskId, userId }
    })

    if (!task) {
      throw new ApiError('任务不存在', 'TASK_NOT_FOUND', 404)
    }

    if (task.status === AIFittingStatus.COMPLETED) {
      throw new ApiError('任务已完成，无法取消', 'TASK_COMPLETED', 400)
    }

    if (task.status === AIFittingStatus.CANCELLED) {
      throw new ApiError('任务已取消', 'TASK_ALREADY_CANCELLED', 400)
    }

    // 更新任务状态
    await db.aiFittingTask.update({
      where: { id: taskId },
      data: {
        status: AIFittingStatus.CANCELLED,
        cancelledAt: new Date(),
        errorMessage: '用户主动取消任务'
      }
    })

    // 退还积分
    if (!task.creditsDeducted) {
      await db.user.update({
        where: { id: userId },
        data: {
          credits: {
            increment: task.creditsCost
          },
          totalConsumedCredits: {
            decrement: task.creditsCost
          }
        }
      })
    }

    logger.info('AI试衣任务取消成功', {
      taskId,
      userId,
      creditsRefunded: task.creditsCost
    })
  }

  /**
   * 获取用户任务列表
   */
  async getUserTasks(
    userId: string,
    options: {
      page?: number
      limit?: number
      status?: string
    } = {}
  ) {
    const { page = 1, limit = 20, status } = options
    const skip = (page - 1) * limit

    const whereClause: any = { userId }
    if (status) {
      whereClause.status = status
    }

    const [tasks, total] = await Promise.all([
      db.aiFittingTask.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              avatarUrl: true
            }
          }
        }
      }),
      db.aiFittingTask.count({ where: whereClause })
    ])

    return {
      tasks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  }

  /**
   * 计算积分消耗
   */
  async calculateCredits(params: {
    generateCount: number
    imageSize: string
  }) {
    const { generateCount, imageSize } = params

    return this.calculateCreditsCost(generateCount, imageSize)
  }

  /**
   * 获取场景列表
   */
  async getSceneList(options: {
    category?: string
    page?: number
    limit?: number
  }) {
    const { category, page = 1, limit = 50 } = options
    const skip = (page - 1) * limit

    // 这里可以从数据库或配置中获取场景列表
    // 暂时返回模拟数据
    const scenes = [
      {
        id: 'fitting-scene-1',
        name: '专业摄影棚',
        category: 'indoor',
        description: '专业室内摄影环境，光线充足',
        imageUrl: '/api/placeholder/300/200',
        is_active: true,
        sort_order: 1
      },
      {
        id: 'fitting-scene-2',
        name: '商业展示厅',
        category: 'indoor',
        description: '现代商业展示环境',
        imageUrl: '/api/placeholder/300/200',
        is_active: true,
        sort_order: 2
      },
      {
        id: 'fitting-scene-3',
        name: '户外街景',
        category: 'outdoor',
        description: '自然户外街景拍摄',
        imageUrl: '/api/placeholder/300/200',
        is_active: true,
        sort_order: 3
      }
    ]

    // 过滤分类
    const filteredScenes = category
      ? scenes.filter(scene => scene.category === category)
      : scenes

    return {
      scenes: filteredScenes,
      total: filteredScenes.length,
      page,
      limit
    }
  }

  /**
   * 获取COS上传签名
   */
  async getCOSSignature(params: {
    fileName: string
    fileType: string
    userId: string
    useCase: string
  }) {
    return await cloudFunctionService.getCOSSignature({
      fileName: params.fileName,
      fileType: params.fileType,
      useCase: params.useCase,
      userId: params.userId
    })
  }

  /**
   * 创建Work记录（任务完成时）
   */
  private async createWorkRecord(taskId: string, resultImages: string[]) {
    const task = await db.aiFittingTask.findUnique({
      where: { id: taskId },
      include: { user: true }
    })

    if (!task) {
      logger.error('创建Work记录失败：任务不存在', { taskId })
      return
    }

    // 创建Work记录
    const work = await db.work.create({
      data: {
        userId: task.userId,
        type: 'fitting',
        status: 'completed',
        title: `AI试衣作品 - ${new Date().toLocaleDateString()}`,
        taskId: taskId,
        metadata: {
          clothingType: task.clothingType,
          sceneId: task.sceneId,
          generateCount: task.generateCount,
          imageSize: task.imageSize,
          style: task.style,
          aiPrompt: task.aiPrompt
        }
      }
    })

    // 创建WorkImage记录
    const imagePromises = resultImages.map((url, index) =>
      db.workImage.create({
        data: {
          workId: work.id,
          url,
          sortOrder: index
        }
      })
    )

    await Promise.all(imagePromises)

    logger.info('Work记录创建成功', {
      taskId,
      workId: work.id,
      imageCount: resultImages.length
    })
  }

  /**
   * 计算积分消耗成本
   */
  private calculateCreditsCost(generateCount: number, imageSize: string): number {
    let baseCost = generateCount * 15 // AI试衣基础成本更高

    // 高分辨率加倍
    if (imageSize === '2048x2048') {
      baseCost *= 2
    }

    return baseCost
  }

  /**
   * 计算预估时间（秒）
   */
  private calculateEstimatedTime(generateCount: number, imageSize: string): number {
    let baseTime = 180 // 基础3分钟

    // 根据生成数量调整
    if (generateCount > 1) {
      baseTime += (generateCount - 1) * 60
    }

    // 高分辨率需要更长时间
    if (imageSize === '2048x2048') {
      baseTime *= 1.5
    }

    return Math.ceil(baseTime)
  }
}

// 创建服务实例
export const aiFittingService = new AIFittingService()

export default aiFittingService