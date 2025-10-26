import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../middleware/auth.js'
import { AIFittingService } from '../../services/ai-fitting.service.js'

const aiFittingService = new AIFittingService()

export async function registerAIFittingRoutes(fastify: FastifyInstance) {

  // 创建试衣任务
  fastify.post<{
    Body: {
      personImageUrl: string
      clothingImageUrl: string
      clothingType: 'TOP' | 'BOTTOM' | 'DRESS' | 'FULL_BODY'
      fittingScene?: 'STREET' | 'OFFICE' | 'DATE' | 'FITNESS' | 'HOME'
      options?: {
        generateCount?: number
        imageSize?: string
      }
    }
  }>('/create', {
    preHandler: [authMiddleware],
    schema: {
      body: {
        type: 'object',
        required: ['personImageUrl', 'clothingImageUrl', 'clothingType'],
        properties: {
          personImageUrl: { type: 'string' },
          clothingImageUrl: { type: 'string' },
          clothingType: {
            type: 'string',
            enum: ['TOP', 'BOTTOM', 'DRESS', 'FULL_BODY']
          },
          fittingScene: {
            type: 'string',
            enum: ['STREET', 'OFFICE', 'DATE', 'FITNESS', 'HOME'],
            default: 'STREET'
          },
          options: {
            type: 'object',
            properties: {
              generateCount: { type: 'number', minimum: 1, maximum: 4, default: 1 },
              imageSize: { type: 'string', default: '1024x1024' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user!.id
      const body = request.body

      const result = await aiFittingService.createTask({
        userId,
        personImageUrl: body.personImageUrl,
        clothingImageUrl: body.clothingImageUrl,
        clothingType: body.clothingType,
        fittingScene: body.fittingScene || 'STREET',
        options: body.options || {}
      })

      return {
        success: true,
        data: result,
        message: '试衣任务创建成功'
      }
    } catch (error: any) {
      fastify.log.error('创建试衣任务失败:', error)
      return reply.status(400).send({
        success: false,
        message: error.message || '创建试衣任务失败'
      })
    }
  })

  // 查询任务状态
  fastify.get<{
    Params: { id: string }
  }>('/tasks/:id', {
    preHandler: [authMiddleware],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user!.id
      const { id } = request.params

      const result = await aiFittingService.getTaskStatus(id, userId)

      if (!result) {
        return reply.status(404).send({
          success: false,
          message: '任务不存在'
        })
      }

      return {
        success: true,
        data: result,
        message: '查询成功'
      }
    } catch (error: any) {
      fastify.log.error('查询任务状态失败:', error)
      return reply.status(400).send({
        success: false,
        message: error.message || '查询任务状态失败'
      })
    }
  })

  // 云函数回调接口
  fastify.post<{
    Body: {
      taskId: string
      status: string
      progress?: number
      currentStep?: string
      estimatedTime?: number
      aiPrompt?: string
      resultImages?: string[]
      personAnalysis?: any
      clothingAnalysis?: any
      errorMessage?: string
      errorCode?: string
    }
  }>('/callback', {
    schema: {
      body: {
        type: 'object',
        required: ['taskId', 'status'],
        properties: {
          taskId: { type: 'string' },
          status: { type: 'string' },
          progress: { type: 'number' },
          currentStep: { type: 'string' },
          estimatedTime: { type: 'number' },
          aiPrompt: { type: 'string' },
          resultImages: { type: 'array', items: { type: 'string' } },
          personAnalysis: { type: 'object' },
          clothingAnalysis: { type: 'object' },
          errorMessage: { type: 'string' },
          errorCode: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const body = request.body

      const result = await aiFittingService.handleCallback(body)

      return {
        success: true,
        data: result,
        message: '回调处理成功'
      }
    } catch (error: any) {
      fastify.log.error('处理回调失败:', error)
      return reply.status(400).send({
        success: false,
        message: error.message || '处理回调失败'
      })
    }
  })

  // 取消任务
  fastify.delete<{
    Params: { id: string }
  }>('/tasks/:id', {
    preHandler: [authMiddleware],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user!.id
      const { id } = request.params

      const result = await aiFittingService.cancelTask(id, userId)

      if (!result) {
        return reply.status(404).send({
          success: false,
          message: '任务不存在或无法取消'
        })
      }

      return {
        success: true,
        data: result,
        message: '任务取消成功'
      }
    } catch (error: any) {
      fastify.log.error('取消任务失败:', error)
      return reply.status(400).send({
        success: false,
        message: error.message || '取消任务失败'
      })
    }
  })

  // 试衣历史记录
  fastify.get<{
    Querystring: {
      limit?: number
      offset?: number
      status?: string
    }
  }>('/history', {
    preHandler: [authMiddleware],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 50, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 },
          status: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user!.id
      const query = request.query

      const result = await aiFittingService.getUserHistory(userId, {
        limit: query.limit || 20,
        offset: query.offset || 0,
        status: query.status
      })

      return {
        success: true,
        data: result,
        message: '查询历史记录成功'
      }
    } catch (error: any) {
      fastify.log.error('查询历史记录失败:', error)
      return reply.status(400).send({
        success: false,
        message: error.message || '查询历史记录失败'
      })
    }
  })

  // 获取COS上传签名
  fastify.post<{
    Body: {
      fileName: string
      fileType: string
      folder?: string
    }
  }>('/cos/signature', {
    preHandler: [authMiddleware],
    schema: {
      body: {
        type: 'object',
        required: ['fileName', 'fileType'],
        properties: {
          fileName: { type: 'string' },
          fileType: { type: 'string' },
          folder: { type: 'string', default: 'fitting' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user!.id
      const body = request.body

      const result = await aiFittingService.getCOSSignature({
        userId,
        fileName: body.fileName,
        fileType: body.fileType,
        folder: body.folder || 'fitting'
      })

      return {
        success: true,
        data: result,
        message: '获取签名成功'
      }
    } catch (error: any) {
      fastify.log.error('获取COS签名失败:', error)
      return reply.status(400).send({
        success: false,
        message: error.message || '获取COS签名失败'
      })
    }
  })
}