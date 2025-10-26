import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { AuthMiddleware } from './auth-middleware'
import {
  IAuthStrategy,
  AuthConfig,
  AuthOptions,
  UserContext,
  JwtStrategyConfig,
  WechatAuthConfig,
  PhoneAuthConfig,
  ApiKeyConfig,
} from './types'
import { JwtStrategy } from './strategies/jwt-strategy'
import { WechatStrategy } from './strategies/wechat-strategy'
import { PhoneStrategy } from './strategies/phone-strategy'
import { ApiKeyStrategy } from './strategies/api-key-strategy'

/**
 * 认证插件选项接口
 */
export interface AuthPluginOptions extends AuthOptions {
  /** JWT配置 */
  jwt?: JwtStrategyConfig
  /** 微信认证配置 */
  wechat?: WechatAuthConfig
  /** 手机号认证配置 */
  phone?: PhoneAuthConfig
  /** API Key配置 */
  apiKey?: ApiKeyConfig
}

/**
 * 认证插件实例
 */
declare module 'fastify' {
  export interface FastifyInstance {
    /**
     * 认证中间件实例
     */
    auth: AuthMiddleware

    /**
     * 认证装饰器
     */
    authenticate: (config?: Partial<AuthConfig>) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>

    /**
     * 权限检查装饰器
     */
    requirePermissions: (permissions: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>

    /**
     * 角色检查装饰器
     */
    requireRoles: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>

    /**
     * VIP检查装饰器
     */
    requireVip: (minimumLevel?: 'BASIC' | 'PRO' | 'ENTERPRISE') => (request: FastifyRequest, reply: FastifyReply) => Promise<void>

    /**
     * 检查用户权限的工具方法
     */
    hasPermission: (user: UserContext, permission: string) => boolean

    /**
     * 检查用户角色的工具方法
     */
    hasRole: (user: UserContext, role: string) => boolean

    /**
     * 生成JWT token的方法
     */
    generateToken: (user: UserContext, expiresIn?: string | number) => string

    /**
     * 验证JWT token的方法
     */
    verifyToken: (token: string) => Promise<UserContext | null>

    /**
     * 创建API Key的方法
     */
    createApiKey: (userId: string, permissions: string[], description?: string) => string
  }

  export interface FastifyRequest {
    /**
     * 当前认证用户
     */
    user?: UserContext

    /**
     * 认证配置
     */
    authConfig?: AuthConfig
  }
}

/**
 * 认证插件
 * 提供统一的认证中间件和装饰器
 */
export default fp<AuthPluginOptions>(async function authPlugin(
  fastify: FastifyInstance,
  options: AuthPluginOptions
) {
  // 构建认证策略列表
  const strategies: IAuthStrategy[] = []

  // 添加JWT策略
  if (options.jwt) {
    const jwtStrategy = new JwtStrategy(options.jwt)
    strategies.push(jwtStrategy)

    fastify.log.info('[AuthPlugin] JWT策略已启用')
  }

  // 添加微信策略
  if (options.wechat) {
    const wechatStrategy = new WechatStrategy(options.wechat)
    strategies.push(wechatStrategy)

    fastify.log.info('[AuthPlugin] 微信策略已启用')
  }

  // 添加手机号策略
  if (options.phone) {
    const phoneStrategy = new PhoneStrategy()
    strategies.push(phoneStrategy)

    fastify.log.info('[AuthPlugin] 手机号策略已启用')
  }

  // 添加API Key策略
  if (options.apiKey) {
    const apiKeyStrategy = new ApiKeyStrategy(options.apiKey)
    strategies.push(apiKeyStrategy)

    fastify.log.info('[AuthPlugin] API Key策略已启用')
  }

  if (strategies.length === 0) {
    throw new Error('至少需要配置一个认证策略')
  }

  // 创建认证中间件实例
  const authMiddleware = new AuthMiddleware(strategies, options.default)

  // 注册认证中间件实例到Fastify
  fastify.decorate('auth', authMiddleware)

  // 注册认证装饰器
  fastify.decorate('authenticate', (config?: Partial<AuthConfig>) => {
    return authMiddleware.createMiddleware(config)
  })

  // 注册权限检查装饰器
  fastify.decorate('requirePermissions', (permissions: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        reply.status(401).send({
          success: false,
          error: {
            type: 'MISSING_TOKEN',
            message: '需要认证',
            code: 401,
          },
        })
        return
      }

      const userPermissions = request.user.permissions || []
      const hasAllPermissions = permissions.every(permission =>
        userPermissions.includes(permission as any)
      )

      if (!hasAllPermissions) {
        reply.status(403).send({
          success: false,
          error: {
            type: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足',
            code: 403,
            required: permissions,
            current: userPermissions,
          },
        })
        return
      }
    }
  })

  // 注册角色检查装饰器
  fastify.decorate('requireRoles', (roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        reply.status(401).send({
          success: false,
          error: {
            type: 'MISSING_TOKEN',
            message: '需要认证',
            code: 401,
          },
        })
        return
      }

      const userRoles = request.user.roles || []
      const hasRequiredRole = roles.some(role =>
        userRoles.includes(role as any)
      )

      if (!hasRequiredRole) {
        reply.status(403).send({
          success: false,
          error: {
            type: 'INSUFFICIENT_PERMISSIONS',
            message: '角色权限不足',
            code: 403,
            required: roles,
            current: userRoles,
          },
        })
        return
      }
    }
  })

  // 注册VIP检查装饰器
  fastify.decorate('requireVip', (minimumLevel: 'BASIC' | 'PRO' | 'ENTERPRISE' = 'BASIC') => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        reply.status(401).send({
          success: false,
          error: {
            type: 'MISSING_TOKEN',
            message: '需要认证',
            code: 401,
          },
        })
        return
      }

      const user = request.user
      const vipLevels = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE']
      const userLevelIndex = vipLevels.indexOf(user.vipLevel || 'FREE')
      const requiredLevelIndex = vipLevels.indexOf(minimumLevel)

      if (userLevelIndex < requiredLevelIndex || user.isVipExpired) {
        reply.status(403).send({
          success: false,
          error: {
            type: 'INSUFFICIENT_PERMISSIONS',
            message: `需要${minimumLevel}及以上VIP等级`,
            code: 403,
            currentVipLevel: user.vipLevel,
            isVipExpired: user.isVipExpired,
          },
        })
        return
      }
    }
  })

  // 注册工具方法
  fastify.decorate('hasPermission', (user: UserContext, permission: string) => {
    const userPermissions = user.permissions || []
    return userPermissions.includes(permission as any)
  })

  fastify.decorate('hasRole', (user: UserContext, role: string) => {
    const userRoles = user.roles || []
    return userRoles.includes(role as any)
  })

  // 注册JWT相关方法（如果配置了JWT策略）
  const jwtStrategy = strategies.find(s => s.name === 'jwt') as JwtStrategy
  if (jwtStrategy) {
    fastify.decorate('generateToken', (user: UserContext, expiresIn?: string | number) => {
      return jwtStrategy.generateToken(user, expiresIn)
    })

    fastify.decorate('verifyToken', async (token: string) => {
      try {
        const mockRequest = {
          headers: { authorization: `Bearer ${token}` },
          log: fastify.log,
        } as FastifyRequest

        return await jwtStrategy.authenticate(mockRequest)
      } catch (error) {
        fastify.log.warn(`验证JWT token失败: ${error.message}`)
        return null
      }
    })
  }

  // 注册API Key相关方法（如果配置了API Key策略）
  const apiKeyStrategy = strategies.find(s => s.name === 'api-key') as ApiKeyStrategy
  if (apiKeyStrategy) {
    fastify.decorate('createApiKey', (userId: string, permissions: string[], description?: string) => {
      return apiKeyStrategy.createApiKey(userId, permissions as any, description)
    })
  }

  // 添加全局认证中间件（如果配置了默认认证）
  if (options.default?.required !== false) {
    fastify.addHook('preHandler', authMiddleware.createMiddleware(options.default))
    fastify.log.info('[AuthPlugin] 全局认证中间件已启用')
  }

  // 添加请求上下文清理钩子
  fastify.addHook('onRequest', async (request, reply) => {
    // 清理上一个请求的用户上下文
    delete request.user
    delete request.authConfig
  })

  fastify.log.info(`[AuthPlugin] 认证插件加载完成，已启用 ${strategies.length} 个策略`)
}, {
  name: 'auth',
  dependencies: [],
})

// 导出所有类型和类
export * from './types'
export * from './strategies/base-strategy'
export * from './strategies/jwt-strategy'
export * from './strategies/wechat-strategy'
export * from './strategies/phone-strategy'
export * from './strategies/api-key-strategy'
export * from './auth-middleware'