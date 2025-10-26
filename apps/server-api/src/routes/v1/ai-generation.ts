import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { AIGenerationService } from '../../services/ai-generation.service.js'
import { CosStsService } from '../../services/cos-sts.service.js'
import { PrismaClient, SceneCategory, SceneType, AIGenerationStatus } from '@ai-photographer/db'

const prisma = new PrismaClient()
const aiGenerationService = new AIGenerationService()
const cosStsService = new CosStsService()

export default async function aiGenerationRoutes(fastify: FastifyInstance) {
  // 创建AI生图任务
  fastify.post('/ai-generation/create', {
    schema: {
      body: {
        type: 'object',
        required: ['sourceImages', 'sceneId'],
        properties: {
          sourceImages: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 5
          },
          sceneId: { type: 'string' },
          modelConfig: { type: 'object' },
          generationMode: {
            type: 'string',
            enum: ['NORMAL', 'POSE_VARIATION', 'STYLE_TRANSFER', 'ENHANCEMENT']
          },
          generateCount: { type: 'number', minimum: 1, maximum: 6 },
          imageSize: { type: 'string', pattern: '^\\d+x\\d+$' },
          options: { type: 'object' },
          referenceWorkId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id
      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: '用户未认证'
        })
      }

      const body = request.body as any
      const result = await aiGenerationService.createTask({
        userId,
        ...body
      })

      return reply.send({
        success: true,
        data: result,
        message: 'AI生图任务创建成功'
      })

    } catch (error) {
      fastify.log.error('创建AI生图任务失败:', error)
      return reply.status(400).send({
        success: false,
        message: error instanceof Error ? error.message : '创建任务失败'
      })
    }
  })

  // 获取任务状态
  fastify.get('/ai-generation/tasks/:taskId', {
    schema: {
      params: {
        taskId: { type: 'string' }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id
      const { taskId } = request.params as any

      const taskStatus = await aiGenerationService.getTaskStatus(taskId, userId)

      return reply.send({
        success: true,
        data: taskStatus
      })

    } catch (error) {
      fastify.log.error('获取任务状态失败:', error)
      return reply.status(404).send({
        success: false,
        message: error instanceof Error ? error.message : '任务不存在'
      })
    }
  })

  // 取消任务
  fastify.delete('/ai-generation/tasks/:taskId', {
    schema: {
      params: {
        taskId: { type: 'string' }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id
      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: '用户未认证'
        })
      }

      const { taskId } = request.params as any
      await aiGenerationService.cancelTask(taskId, userId)

      return reply.send({
        success: true,
        message: '任务已取消'
      })

    } catch (error) {
      fastify.log.error('取消任务失败:', error)
      return reply.status(400).send({
        success: false,
        message: error instanceof Error ? error.message : '取消任务失败'
      })
    }
  })

  // 获取用户任务列表
  fastify.get('/ai-generation/tasks', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 20 },
          status: {
            type: 'string',
            enum: ['PENDING', 'PREPROCESSING', 'GENERATING_PROMPT', 'GENERATING_IMAGE', 'POSTPROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id
      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: '用户未认证'
        })
      }

      const { page = 1, limit = 20, status } = request.query as any
      const result = await aiGenerationService.getUserTasks(userId, page, limit, status as AIGenerationStatus)

      return reply.send({
        success: true,
        data: result
      })

    } catch (error) {
      fastify.log.error('获取用户任务列表失败:', error)
      return reply.status(500).send({
        success: false,
        message: '获取任务列表失败'
      })
    }
  })

  // 获取场景列表
  fastify.get('/ai-generation/scenes', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['URBAN', 'NATURE', 'INDOOR', 'LIFESTYLE', 'COMMERCIAL', 'ARTISTIC', 'SEASONAL']
          },
          type: {
            type: 'string',
            enum: ['PHOTOGRAPHY', 'FITTING', 'LIFESTYLE']
          },
          includeInactive: { type: 'boolean', default: false },
          isPremium: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        category,
        type,
        includeInactive = false,
        isPremium
      } = request.query as any

      const whereClause: any = {}

      if (category) {
        whereClause.category = category
      }

      if (type) {
        whereClause.type = type
      }

      if (!includeInactive) {
        whereClause.isActive = true
      }

      if (typeof isPremium === 'boolean') {
        whereClause.isPremium = isPremium
      }

      const scenes = await prisma.scene.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          type: true,
          previewImage: true,
          thumbnailImage: true,
          styleTags: true,
          maxGenerateCount: true,
          creditsPerImage: true,
          baseCredits: true,
          isPremium: true,
          sortOrder: true,
          usageCount: true,
          likeCount: true,
          createdAt: true
        },
        orderBy: [
          { sortOrder: 'desc' },
          { usageCount: 'desc' },
          { name: 'asc' }
        ]
      })

      // 按分类统计
      const categoryStats = await prisma.scene.groupBy({
        by: ['category'],
        where: { isActive: true },
        _count: { category: true }
      })

      const stats = categoryStats.reduce((acc, stat) => {
        acc[stat.category] = stat._count.category
        return acc
      }, {} as Record<string, number>)

      return reply.send({
        success: true,
        data: {
          scenes,
          stats,
          categories: Object.values(SceneCategory),
          types: Object.values(SceneType)
        }
      })

    } catch (error) {
      fastify.log.error('获取场景列表失败:', error)
      return reply.status(500).send({
        success: false,
        message: '获取场景列表失败'
      })
    }
  })

  // 获取单个场景详情
  fastify.get('/ai-generation/scenes/:sceneId', {
    schema: {
      params: {
        sceneId: { type: 'string' }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sceneId } = request.params as any

      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          type: true,
          promptTemplate: true,
          negativePrompt: true,
          sceneConfig: true,
          previewImage: true,
          thumbnailImage: true,
          styleTags: true,
          defaultParams: true,
          supportedSizes: true,
          maxGenerateCount: true,
          creditsPerImage: true,
          baseCredits: true,
          isPremium: true,
          usageCount: true,
          likeCount: true,
          createdAt: true,
          updatedAt: true
        }
      })

      if (!scene) {
        return reply.status(404).send({
          success: false,
          message: '场景不存在'
        })
      }

      return reply.send({
        success: true,
        data: scene
      })

    } catch (error) {
      fastify.log.error('获取场景详情失败:', error)
      return reply.status(500).send({
        success: false,
        message: '获取场景详情失败'
      })
    }
  })

  // COS STS签名接口
  fastify.post('/cos/signature', {
    schema: {
      body: {
        type: 'object',
        required: ['fileType', 'fileName'],
        properties: {
          fileType: {
            type: 'string',
            enum: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
          },
          fileName: { type: 'string', minLength: 1, maxLength: 255 },
          fileSize: { type: 'number', minimum: 0, maximum: 10485760 }, // 10MB
          directory: { type: 'string', maxLength: 50 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id
      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: '用户未认证'
        })
      }

      const body = request.body as any
      const credentials = await cosStsService.generateStsCredentials({
        ...body,
        directory: body.directory || `ai-generation/${userId}`
      })

      return reply.send({
        success: true,
        data: credentials,
        message: 'COS上传凭证生成成功'
      })

    } catch (error) {
      fastify.log.error('生成COS签名失败:', error)
      return reply.status(400).send({
        success: false,
        message: error instanceof Error ? error.message : '生成上传凭证失败'
      })
    }
  })

  // 批量获取任务状态（用于前端轮询优化）
  fastify.post('/ai-generation/tasks/batch-status', {
    schema: {
      body: {
        type: 'object',
        required: ['taskIds'],
        properties: {
          taskIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 10
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id
      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: '用户未认证'
        })
      }

      const { taskIds } = request.body as any

      const tasks = await Promise.all(
        taskIds.map(async (taskId: string) => {
          try {
            const task = await aiGenerationService.getTaskStatus(taskId, userId)
            return { taskId, ...task }
          } catch (error) {
            return {
              taskId,
              error: error instanceof Error ? error.message : '获取任务状态失败'
            }
          }
        })
      )

      return reply.send({
        success: true,
        data: tasks
      })

    } catch (error) {
      fastify.log.error('批量获取任务状态失败:', error)
      return reply.status(500).send({
        success: false,
        message: '批量获取任务状态失败'
      })
    }
  })

  // 获取用户统计信息
  fastify.get('/ai-generation/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id
      if (!userId) {
        return reply.status(401).send({
          success: false,
          message: '用户未认证'
        })
      }

      // 获取任务统计
      const [
        totalTasks,
        completedTasks,
        failedTasks,
        processingTasks,
        totalCreditsSpent
      ] = await Promise.all([
        prisma.aIGenerationTask.count({ where: { userId } }),
        prisma.aIGenerationTask.count({
          where: { userId, status: AIGenerationStatus.COMPLETED }
        }),
        prisma.aIGenerationTask.count({
          where: { userId, status: AIGenerationStatus.FAILED }
        }),
        prisma.aIGenerationTask.count({
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
        }),
        prisma.aIGenerationTask.aggregate({
          where: {
            userId,
            status: AIGenerationStatus.COMPLETED,
            creditsDeducted: true,
            creditsRefunded: false
          },
          _sum: { creditsCost: true }
        })
      ])

      // 获取最常用的场景
      const popularScenes = await prisma.aIGenerationTask.groupBy({
        by: ['sceneId'],
        where: { userId },
        _count: { sceneId: true },
        orderBy: { _count: { sceneId: 'desc' } },
        take: 5
      })

      const sceneDetails = await Promise.all(
        popularScenes.map(async (item) => {
          const scene = await prisma.scene.findUnique({
            where: { id: item.sceneId },
            select: { id: true, name: true, category: true, previewImage: true }
          })
          return {
            scene,
            usageCount: item._count.sceneId
          }
        })
      )

      const stats = {
        tasks: {
          total: totalTasks,
          completed: completedTasks,
          failed: failedTasks,
          processing: processingTasks,
          successRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
        },
        credits: {
          totalSpent: totalCreditsSpent._sum.creditsCost || 0
        },
        popularScenes: sceneDetails.filter(item => item.scene !== null)
      }

      return reply.send({
        success: true,
        data: stats
      })

    } catch (error) {
      fastify.log.error('获取用户统计信息失败:', error)
      return reply.status(500).send({
        success: false,
        message: '获取统计信息失败'
      })
    }
  })
}