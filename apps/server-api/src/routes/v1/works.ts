import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { workService, WorkQueryParams, CreateWorkData, UpdateWorkData } from '../../services/work.service.js'

/**
 * 统一响应格式
 */
interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  meta?: {
    trace_id: string
    timestamp: number
    request_id?: string
  }
}

/**
 * 生成标准响应
 */
function createResponse<T = any>(
  success: boolean,
  data?: T,
  error?: { code: string; message: string; details?: any },
  meta?: any
): ApiResponse<T> {
  return {
    success,
    data,
    error,
    meta: {
      trace_id: meta?.trace_id || generateTraceId(),
      timestamp: Date.now(),
      request_id: meta?.request_id,
      ...meta,
    },
  }
}

/**
 * 生成追踪ID
 */
function generateTraceId(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15)
}

/**
 * 注册作品相关路由
 * @param fastify Fastify实例
 * @param options 路由选项
 */
export async function registerWorkRoutes(fastify: FastifyInstance, options: { prefix: string }) {
  const { prefix } = options

  // 获取作品列表
  fastify.get(`${prefix}`, {
    preHandler: [fastify.authenticate()],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: {
            type: 'integer',
            minimum: 1,
            default: 1,
            description: '页码',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: '每页数量',
          },
          type: {
            type: 'string',
            description: '作品类型筛选',
          },
          status: {
            type: 'string',
            description: '状态筛选',
          },
          favorite: {
            type: 'boolean',
            description: '是否只看收藏',
          },
          sortBy: {
            type: 'string',
            enum: ['createdAt', 'updatedAt', 'title'],
            default: 'createdAt',
            description: '排序字段',
          },
          sortOrder: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
            description: '排序顺序',
          },
          search: {
            type: 'string',
            description: '搜索关键词',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const queryParams = request.query as WorkQueryParams

    try {
      // 获取作品列表
      const workList = await workService.getWorkList(user.userId, queryParams)

      reply.header('X-Trace-ID', traceId)
      return createResponse(workList, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 获取作品列表失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '获取作品列表失败'
      reply.code(500)
      return createResponse(false, undefined, {
        code: 'GET_WORKS_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 获取作品详情
  fastify.get(`${prefix}/:id`, {
    preHandler: [fastify.authenticate()],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: '作品ID',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const { id } = request.params as { id: string }

    try {
      // 获取作品详情
      const workDetail = await workService.getWorkDetail(user.userId, id)

      reply.header('X-Trace-ID', traceId)
      return createResponse(workDetail, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 获取作品详情失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '获取作品详情失败'
      let statusCode = 500
      let errorCode = 'GET_WORK_FAILED'

      if (errorMessage.includes('不存在')) {
        statusCode = 404
        errorCode = 'WORK_NOT_FOUND'
      }

      reply.code(statusCode)
      return createResponse(false, undefined, {
        code: errorCode,
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 创建作品
  fastify.post(`${prefix}`, {
    preHandler: [fastify.authenticate()],
    schema: {
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: '作品标题',
          },
          type: {
            type: 'string',
            description: '作品类型',
          },
          metadata: {
            type: 'object',
            description: '作品元数据',
          },
          images: {
            type: 'array',
            items: {
              type: 'object',
              required: ['url'],
              properties: {
                url: {
                  type: 'string',
                  format: 'uri',
                  description: '图片URL',
                },
                sortOrder: {
                  type: 'integer',
                  default: 0,
                  description: '排序权重',
                },
              },
            },
            description: '作品图片列表',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const workData = request.body as CreateWorkData

    try {
      // 创建作品
      const newWork = await workService.createWork(user.userId, workData)

      reply.code(201)
      reply.header('X-Trace-ID', traceId)
      return createResponse(newWork, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 创建作品失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '创建作品失败'
      reply.code(400)
      return createResponse(false, undefined, {
        code: 'CREATE_WORK_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 更新作品
  fastify.put(`${prefix}/:id`, {
    preHandler: [fastify.authenticate()],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: '作品ID',
          },
        },
      },
      body: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: '作品标题',
          },
          metadata: {
            type: 'object',
            description: '作品元数据',
          },
          status: {
            type: 'string',
            description: '作品状态',
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const { id } = request.params as { id: string }
    const updateData = request.body as UpdateWorkData

    try {
      // 更新作品
      const updatedWork = await workService.updateWork(user.userId, id, updateData)

      reply.header('X-Trace-ID', traceId)
      return createResponse(updatedWork, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 更新作品失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '更新作品失败'
      let statusCode = 500
      let errorCode = 'UPDATE_WORK_FAILED'

      if (errorMessage.includes('不存在')) {
        statusCode = 404
        errorCode = 'WORK_NOT_FOUND'
      }

      reply.code(statusCode)
      return createResponse(false, undefined, {
        code: errorCode,
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 删除作品
  fastify.delete(`${prefix}/:id`, {
    preHandler: [fastify.authenticate()],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: '作品ID',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const { id } = request.params as { id: string }

    try {
      // 删除作品
      const success = await workService.deleteWork(user.userId, id)

      if (success) {
        reply.header('X-Trace-ID', traceId)
        return createResponse({
          message: '作品删除成功',
          workId: id,
        }, undefined, undefined, { trace_id: traceId })
      } else {
        reply.code(404)
        return createResponse(false, undefined, {
          code: 'WORK_NOT_FOUND',
          message: '作品不存在',
        }, { trace_id: traceId })
      }
    } catch (error) {
      fastify.log.error(`[${traceId}] 删除作品失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '删除作品失败'
      reply.code(500)
      return createResponse(false, undefined, {
        code: 'DELETE_WORK_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 切换收藏状态
  fastify.put(`${prefix}/:id/favorite`, {
    preHandler: [fastify.authenticate()],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: '作品ID',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const { id } = request.params as { id: string }

    try {
      // 切换收藏状态
      const result = await workService.toggleFavorite(user.userId, id)

      reply.header('X-Trace-ID', traceId)
      return createResponse({
        workId: id,
        isFavorite: result.isFavorite,
        message: result.isFavorite ? '已添加到收藏' : '已取消收藏',
      }, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 切换收藏状态失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '切换收藏状态失败'
      reply.code(500)
      return createResponse(false, undefined, {
        code: 'TOGGLE_FAVORITE_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 批量删除作品
  fastify.delete(`${prefix}/batch`, {
    preHandler: [fastify.authenticate()],
    schema: {
      body: {
        type: 'object',
        required: ['workIds'],
        properties: {
          workIds: {
            type: 'array',
            items: {
              type: 'string',
            },
            minItems: 1,
            maxItems: 50,
            description: '作品ID列表，最多50个',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const { workIds } = request.body as { workIds: string[] }

    try {
      // 批量删除作品
      const result = await workService.deleteWorks(user.userId, workIds)

      reply.header('X-Trace-ID', traceId)
      return createResponse({
        success: result.success,
        failed: result.failed,
        errors: result.errors,
        message: `成功删除${result.success}个作品`,
      }, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 批量删除作品失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '批量删除作品失败'
      reply.code(500)
      return createResponse(false, undefined, {
        code: 'BATCH_DELETE_WORKS_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 获取作品统计信息
  fastify.get(`${prefix}/stats`, {
    preHandler: [fastify.authenticate()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!

    try {
      // 获取作品统计信息
      const stats = await workService.getWorkStats(user.userId)

      reply.header('X-Trace-ID', traceId)
      return createResponse(stats, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 获取作品统计失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '获取作品统计失败'
      reply.code(500)
      return createResponse(false, undefined, {
        code: 'GET_WORK_STATS_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  fastify.log.info(`作品路由注册完成: ${prefix}`)
}