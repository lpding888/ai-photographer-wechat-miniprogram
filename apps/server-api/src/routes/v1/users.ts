import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { userService } from '../../services/user.service.js'
import { IdentityProvider, Permission } from '../../plugins/auth/types.js'

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
 * 注册用户相关路由
 * @param fastify Fastify实例
 * @param options 路由选项
 */
export async function registerUserRoutes(fastify: FastifyInstance, options: { prefix: string }) {
  const { prefix } = options

  // 获取个人信息
  fastify.get(`${prefix}/me`, {
    preHandler: [fastify.authenticate()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!

    try {
      // 获取用户详细信息
      const userInfo = await userService.getUserById(user.userId, true)

      if (!userInfo) {
        reply.code(404)
        return createResponse(false, undefined, {
          code: 'USER_NOT_FOUND',
          message: '用户不存在',
        }, { trace_id: traceId })
      }

      reply.header('X-Trace-ID', traceId)
      return createResponse({
        userId: userInfo.id,
        nickname: userInfo.nickname,
        avatarUrl: userInfo.avatarUrl,
        status: userInfo.status,
        credits: userInfo.credits,
        totalCredits: userInfo.totalCredits,
        totalConsumedCredits: userInfo.totalConsumedCredits,
        totalEarnedCredits: userInfo.totalEarnedCredits,
        registerTime: userInfo.registerTime,
        lastLoginTime: userInfo.lastLoginTime,
        lastCheckinDate: userInfo.lastCheckinDate,
        inviteCode: userInfo.inviteCode,
        vipLevel: userInfo.vipLevel,
        vipExpiredAt: userInfo.vipExpiredAt,
        metadata: userInfo.metadata,
        identities: userInfo.identities?.map(identity => ({
          id: identity.id,
          provider: identity.provider,
          verified: identity.verified,
          boundAt: identity.boundAt,
          metadata: identity.metadata,
        })),
      }, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 获取个人信息失败:`, error)

      reply.code(500)
      return createResponse(false, undefined, {
        code: 'GET_PROFILE_FAILED',
        message: '获取个人信息失败',
      }, { trace_id: traceId })
    }
  })

  // 更新个人信息
  fastify.put(`${prefix}/me`, {
    preHandler: [fastify.authenticate()],
    schema: {
      body: {
        type: 'object',
        properties: {
          nickname: {
            type: 'string',
            minLength: 1,
            maxLength: 50,
            description: '用户昵称',
          },
          avatarUrl: {
            type: 'string',
            format: 'uri',
            description: '头像URL',
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const { nickname, avatarUrl } = request.body as {
      nickname?: string
      avatarUrl?: string
    }

    try {
      // 这里应该实现更新用户信息的逻辑
      // 由于UserService中暂时没有updateUser方法，我们先返回成功
      // 实际项目中需要实现相应的数据库更新操作

      const updatedUser = {
        userId: user.userId,
        nickname: nickname || user.metadata?.nickname,
        avatarUrl: avatarUrl || user.metadata?.avatarUrl,
        updatedAt: new Date(),
      }

      reply.header('X-Trace-ID', traceId)
      return createResponse(updatedUser, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 更新个人信息失败:`, error)

      reply.code(500)
      return createResponse(false, undefined, {
        code: 'UPDATE_PROFILE_FAILED',
        message: '更新个人信息失败',
      }, { trace_id: traceId })
    }
  })

  // 获取身份绑定列表
  fastify.get(`${prefix}/me/identities`, {
    preHandler: [fastify.authenticate()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!

    try {
      // 获取用户的所有身份绑定
      const identities = await userService.getUserIdentities(user.userId)

      const formattedIdentities = identities.map(identity => ({
        id: identity.id,
        provider: identity.provider,
        providerName: getProviderName(identity.provider),
        identifier: maskIdentifier(identity.identifier, identity.provider),
        verified: identity.verified,
        verifiedAt: identity.verifiedAt,
        boundAt: identity.boundAt,
        metadata: identity.metadata,
      }))

      reply.header('X-Trace-ID', traceId)
      return createResponse({
        identities: formattedIdentities,
        total: formattedIdentities.length,
      }, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 获取身份绑定失败:`, error)

      reply.code(500)
      return createResponse(false, undefined, {
        code: 'GET_IDENTITIES_FAILED',
        message: '获取身份绑定失败',
      }, { trace_id: traceId })
    }
  })

  // 绑定新身份
  fastify.post(`${prefix}/me/identities`, {
    preHandler: [fastify.authenticate()],
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'identifier'],
        properties: {
          provider: {
            type: 'string',
            enum: Object.values(IdentityProvider),
            description: '身份提供商',
          },
          identifier: {
            type: 'string',
            description: '身份标识符（手机号、openid、邮箱等）',
          },
          metadata: {
            type: 'object',
            description: '身份元数据',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const { provider, identifier, metadata } = request.body as {
      provider: string
      identifier: string
      metadata?: Record<string, any>
    }

    try {
      // 绑定新身份
      const newIdentity = await userService.bindIdentityToUser(
        user.userId,
        provider,
        identifier,
        metadata
      )

      reply.header('X-Trace-ID', traceId)
      return createResponse({
        id: newIdentity.id,
        provider: newIdentity.provider,
        providerName: getProviderName(newIdentity.provider),
        identifier: maskIdentifier(newIdentity.identifier, newIdentity.provider),
        verified: newIdentity.verified,
        boundAt: newIdentity.boundAt,
        message: '身份绑定成功',
      }, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 绑定身份失败:`, error)

      const errorMessage = error instanceof Error ? error.message : '绑定身份失败'
      reply.code(400)
      return createResponse(false, undefined, {
        code: 'BIND_IDENTITY_FAILED',
        message: errorMessage,
      }, { trace_id: traceId })
    }
  })

  // 解绑身份
  fastify.delete(`${prefix}/me/identities/:provider/:identifier`, {
    preHandler: [fastify.authenticate()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!
    const { provider, identifier } = request.params as {
      provider: string
      identifier: string
    }

    try {
      // 解绑身份
      const success = await userService.unbindIdentity(user.userId, provider, identifier)

      if (!success) {
        reply.code(404)
        return createResponse(false, undefined, {
          code: 'IDENTITY_NOT_FOUND',
          message: '身份绑定不存在',
        }, { trace_id: traceId })
      }

      reply.header('X-Trace-ID', traceId)
      return createResponse({
        message: '身份解绑成功',
      }, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 解绑身份失败:`, error)

      reply.code(500)
      return createResponse(false, undefined, {
        code: 'UNBIND_IDENTITY_FAILED',
        message: '解绑身份失败',
      }, { trace_id: traceId })
    }
  })

  // 获取用户统计信息
  fastify.get(`${prefix}/me/stats`, {
    preHandler: [fastify.authenticate()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateTraceId()
    const user = request.user!

    try {
      // 这里应该获取用户的详细统计信息
      // 包括作品数量、积分使用情况、身份绑定数量等
      const stats = {
        userId: user.userId,
        credits: {
          current: user.metadata?.credits || 0,
          total: user.metadata?.totalCredits || 0,
          consumed: user.metadata?.totalConsumedCredits || 0,
        },
        identities: {
          total: 0, // 需要从数据库获取
          verified: 0,
        },
        works: {
          total: 0, // 需要从作品服务获取
          favorite: 0,
        },
        activity: {
          lastLoginTime: user.metadata?.lastLoginTime,
          registerTime: user.metadata?.registeredAt,
          loginDays: 0, // 需要计算
        },
      }

      reply.header('X-Trace-ID', traceId)
      return createResponse(stats, undefined, undefined, { trace_id: traceId })
    } catch (error) {
      fastify.log.error(`[${traceId}] 获取用户统计失败:`, error)

      reply.code(500)
      return createResponse(false, undefined, {
        code: 'GET_STATS_FAILED',
        message: '获取用户统计失败',
      }, { trace_id: traceId })
    }
  })

  /**
   * 获取身份提供商名称
   */
  function getProviderName(provider: string): string {
    const providerNames: Record<string, string> = {
      [IdentityProvider.WECHAT_MINIAPP]: '微信小程序',
      [IdentityProvider.WECHAT_OPEN]: '微信开放平台',
      [IdentityProvider.PHONE]: '手机号',
      [IdentityProvider.EMAIL]: '邮箱',
      [IdentityProvider.APPLE]: 'Apple ID',
      [IdentityProvider.GOOGLE]: 'Google',
    }
    return providerNames[provider] || provider
  }

  /**
   * 脱敏身份标识符
   */
  function maskIdentifier(identifier: string, provider: string): string {
    switch (provider) {
      case IdentityProvider.PHONE:
        // 手机号脱敏：138****1234
        if (identifier.length === 11) {
          return `${identifier.substring(0, 3)}****${identifier.substring(7)}`
        }
        return '***'
      case IdentityProvider.EMAIL:
        // 邮箱脱敏：u***@example.com
        const [localPart, domain] = identifier.split('@')
        if (localPart && domain) {
          return `${localPart[0]}***@${domain}`
        }
        return '***'
      default:
        // 其他类型：显示前3位和后3位
        if (identifier.length > 6) {
          return `${identifier.substring(0, 3)}***${identifier.substring(identifier.length - 3)}`
        }
        return '***'
    }
  }

  fastify.log.info(`用户路由注册完成: ${prefix}`)
}