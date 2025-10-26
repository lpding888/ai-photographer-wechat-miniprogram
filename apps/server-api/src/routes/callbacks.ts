import type { FastifyInstance, FastifySchema } from 'fastify'

import { handleScfCallback, type ScfCallbackPayload } from '../services/callbacks/scf-callback.js'
import { legacyError } from '../utils/legacy-response.js'

const SIGNATURE_HEADER = 'x-scf-signature'

export const registerCallbackRoutes = async (app: FastifyInstance) => {
  /**
   * SCF回调接收端点
   *
   * 接收来自腾讯云SCF的异步回调通知
   *
   * 请求头：
   * - x-scf-signature: HMAC-SHA256签名，用于验证请求合法性
   *
   * 请求体：
   * - eventId: 事件唯一ID
   * - taskId: 任务ID
   * - status: 任务状态 (SUCCESS/FAILED/RETRYING)
   * - cosObject: COS对象信息
   */
  const scfCallbackSchema: FastifySchema & { tags?: string[] } = {
    tags: ['Callbacks'],
    headers: {
      type: 'object',
      properties: {
        'x-scf-signature': {
          type: 'string',
          description: 'HMAC-SHA256签名'
        }
      }
    },
    body: {
      type: 'object',
      required: ['eventId', 'taskId', 'status', 'cosObject'],
      properties: {
        eventId: { type: 'string', description: '事件唯一ID' },
        taskId: { type: 'string', description: '任务ID' },
        status: {
          type: 'string',
          enum: ['SUCCESS', 'FAILED', 'RETRYING'],
          description: '任务状态'
        },
        outputKeys: {
          type: 'array',
          items: { type: 'string' },
          description: '输出文件键列表'
        },
        cosObject: {
          type: 'object',
          required: ['key', 'bucket', 'region'],
          properties: {
            key: { type: 'string', description: 'COS对象键' },
            bucket: { type: 'string', description: '存储桶名称' },
            region: { type: 'string', description: '存储地域' },
            etag: { type: 'string', description: '对象ETag' },
            size: { type: 'integer', description: '对象大小（字节）' }
          }
        },
        metadata: {
          type: 'object',
          description: '额外元数据'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          message: { type: 'string' },
          code: { type: 'integer' }
        }
      },
      400: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          code: { type: 'integer' }
        }
      },
      401: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          code: { type: 'integer' }
        }
      },
      422: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          code: { type: 'integer' }
        }
      },
      500: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          code: { type: 'integer' }
        }
      }
    }
  }

  app.post<{
    Body: ScfCallbackPayload
  }>('/callbacks/scf', {
    schema: scfCallbackSchema
  }, async (request, reply) => {
    const signature = request.headers[SIGNATURE_HEADER] as string | undefined

    // 签名校验已经在handleScfCallback内部处理
    const response = await handleScfCallback(request.body, signature)

    const statusCode = response.code ?? (response.success ? 200 : 500)
    void reply.code(statusCode)

    return response
  })

  /**
   * 回调记录查询端点（调试用）
   */
  const scfQuerySchema: FastifySchema & { tags?: string[] } = {
    tags: ['Callbacks'],
    querystring: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: '事件ID' },
        taskId: { type: 'string', description: '任务ID' },
        page: { type: 'string', description: '页码，默认1' },
        limit: { type: 'string', description: '每页条数，默认20' },
        status: { type: 'string', description: '状态筛选' }
      }
    }
  }

  app.get<{
    Querystring: {
      eventId?: string
      taskId?: string
      page?: string
      limit?: string
      status?: string
    }
  }>('/callbacks/scf', {
    schema: scfQuerySchema
  }, async (request, reply) => {
    const { eventId, taskId, page, limit, status } = request.query

    if (eventId) {
      // 根据eventId查询单条记录
      const { callbacksRepository } = await import('../services/callbacks/callback-repository.js')
      const record = await callbacksRepository.findByEventId(eventId)

      if (!record) {
        void reply.code(404)
        return {
          success: false,
          message: '回调记录不存在',
          code: 404
        }
      }

      return {
        success: true,
        data: record,
        message: '查询成功',
        code: 200
      }
    }

    // 分页查询
    const { callbacksRepository } = await import('../services/callbacks/callback-repository.js')
    const result = await callbacksRepository.list({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      taskId,
      status
    })

    return {
      success: true,
      data: result,
      message: '查询成功',
      code: 200
    }
  })
}
