import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { smsService } from '../../services/sms.service.js'
import { authService } from '../../services/auth.service.js'
import { Platform, UserRole } from '../../plugins/auth/types.js'

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
 * 注册认证相关路由
 * @param fastify Fastify实例
 * @param options 路由选项
 */
export async function registerAuthRoutes(fastify: FastifyInstance, options: { prefix: string }) {
  const { prefix } = options

  // 发送手机验证码
  fastify.post(`${prefix}/phone/send-code`, {
    schema: {
      body: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: {
            type: 'string',
            pattern: '^1[3-9]\\d{9}$',
            description: '手机号，11位数字，以1开头',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const { phone } = request.body as { phone: string }

    try {
      // 发送验证码
      const result = await smsService.sendVerificationCode(phone, request)

      if (result.success) {
        reply.header('X-Trace-ID', traceId)
        return createResponse(true, {
          messageId: result.messageId,
          expiresIn: 300, // 5分钟
          resendInterval: 60, // 60秒
        }, undefined, { trace_id: traceId })
      } else {
        reply.code(400)
        return createResponse(false, undefined, {
          code: 'SMS_SEND_FAILED',
          message: result.error || '发送验证码失败',
        }, { trace_id: traceId })
      }
    } catch (error) {
      fastify.log.error(`[${traceId}] 发送验证码失败:`, error)
      reply.code(500)
      return createResponse(false, undefined, {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误',
      }, { trace_id: traceId })
    }
  })

  // 手机号登录
  fastify.post(`${prefix}/phone/login`, {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'code'],
        properties: {
          phone: {
            type: 'string',
            pattern: '^1[3-9]\\d{9}$',
            description: '手机号',
          },
          code: {
            type: 'string',
            pattern: '^\\d{6}$',
            description: '6位数字验证码',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const { phone, code } = request.body as { phone: string; code: string }

    try {
      // 执行手机号登录
      const loginResult = await authService.loginByPhone(phone, code, request)

      reply.header('X-Trace-ID', traceId)
      return createResponse(loginResult, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 手机号登录失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '登录失败'
      let statusCode = 400
      let errorCode = 'LOGIN_FAILED'

      // 根据错误信息确定HTTP状态码和错误码
      if (errorMessage.includes('验证码') || errorMessage.includes('格式')) {
        statusCode = 400
        errorCode = 'INVALID_CODE'
      } else if (errorMessage.includes('用户')) {
        statusCode = 401
        errorCode = 'USER_ERROR'
      }

      reply.code(statusCode)
      return createResponse(false, undefined, {
        code: errorCode,
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 微信扫码登录
  fastify.post(`${prefix}/wechat/login`, {
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: {
            type: 'string',
            description: '微信授权码',
          },
          state: {
            type: 'string',
            description: '状态参数，用于防止CSRF攻击',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const { code, state } = request.body as { code: string; state?: string }

    try {
      // 执行微信登录
      const loginResult = await authService.loginByWechat(code, request)

      reply.header('X-Trace-ID', traceId)
      return createResponse(loginResult, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 微信登录失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '微信登录失败'
      reply.code(400)
      return createResponse(false, undefined, {
        code: 'WECHAT_LOGIN_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 刷新Token
  fastify.post(`${prefix}/refresh`, {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: {
            type: 'string',
            description: '刷新令牌',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const { refreshToken } = request.body as { refreshToken: string }

    try {
      // 刷新Token
      const loginResult = await authService.refreshToken(refreshToken, request)

      reply.header('X-Trace-ID', traceId)
      return createResponse(loginResult, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 刷新Token失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '刷新Token失败'
      reply.code(401)
      return createResponse(false, undefined, {
        code: 'REFRESH_TOKEN_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 用户登出
  fastify.post(`${prefix}/logout`, {
    preHandler: [fastify.authenticate()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const { refreshToken } = request.body as { refreshToken?: string }
    const user = request.user!

    try {
      // 执行登出
      await authService.logout(user.userId, refreshToken)

      reply.header('X-Trace-ID', traceId)
      return createResponse(true, {
        message: '登出成功',
      }, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 登出失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '登出失败'
      reply.code(500)
      return createResponse(false, undefined, {
        code: 'LOGOUT_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 获取当前用户信息
  fastify.get(`${prefix}/me`, {
    preHandler: [fastify.authenticate()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!

    try {
      // 返回用户信息
      reply.header('X-Trace-ID', traceId)
      return createResponse({
        userId: user.userId,
        platform: user.platform,
        roles: user.roles,
        permissions: user.permissions,
        vipLevel: user.vipLevel,
        isVipExpired: user.isVipExpired,
        metadata: user.metadata,
      }, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 获取用户信息失败:`, error)

      reply.code(500)
      return createResponse(false, undefined, {
        code: 'GET_USER_INFO_FAILED',
        message: '获取用户信息失败',
      }, { trace_id: traceId })
    }
  })

  // 检查会话状态
  fastify.get(`${prefix}/session`, {
    preHandler: [fastify.authenticate()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!

    try {
      // 检查会话状态
      const sessionStatus = await authService.checkSessionStatus(user.userId)

      reply.header('X-Trace-ID', traceId)
      return createResponse(sessionStatus, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 检查会话状态失败:`, error)

      reply.code(500)
      return createResponse(false, undefined, {
        code: 'CHECK_SESSION_FAILED',
        message: '检查会话状态失败',
      }, { trace_id: traceId })
    }
  })

  // 强制用户下线（管理员功能）
  fastify.post(`${prefix}/force-logout`, {
    preHandler: [
      fastify.authenticate(),
      fastify.requireRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN])
    ],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const { userId, excludeToken } = request.body as {
      userId: string
      excludeToken?: string
    }

    try {
      // 强制用户下线
      await authService.forceLogout(userId, excludeToken)

      reply.header('X-Trace-ID', traceId)
      return createResponse(true, {
        message: '用户已强制下线',
        userId,
      }, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 强制用户下线失败:`, error)

      reply.code(500)
      return createResponse(false, undefined, {
        code: 'FORCE_LOGOUT_FAILED',
        message: error instanceof Error ? error.message : '强制用户下线失败',
      }, { trace_id: traceId })
    }
  })

  fastify.log.info(`认证路由注册完成: ${prefix}`)
}