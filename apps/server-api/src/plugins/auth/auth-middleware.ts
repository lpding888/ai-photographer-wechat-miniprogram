import { FastifyRequest, FastifyReply } from 'fastify'
import { IAuthStrategy, UserContext, AuthConfig, AuthError, AuthErrorType } from './types'

/**
 * 认证中间件类
 * 实现责任链模式，依次尝试各个认证策略
 */
export class AuthMiddleware {
  private strategies: IAuthStrategy[]
  private defaultConfig: AuthConfig

  constructor(strategies: IAuthStrategy[], defaultConfig: Partial<AuthConfig> = {}) {
    this.strategies = strategies
    this.defaultConfig = {
      required: true,
      strategies,
      ...defaultConfig,
    }
  }

  /**
   * 创建认证中间件函数
   * @param routeConfig 路由级认证配置（可选）
   * @returns Fastify中间件函数
   */
  public createMiddleware(routeConfig?: Partial<AuthConfig>) {
    const config = { ...this.defaultConfig, ...routeConfig }

    return async (request: FastifyRequest, reply: FastifyReply) => {
      // 检查是否在排除列表中
      if (this.isExcludedRoute(request.url, config)) {
        return
      }

      // 存储认证配置到请求对象中
      request.authConfig = config

      let userContext: UserContext | null = null
      let lastError: Error | null = null

      // 依次尝试各个认证策略
      for (const strategy of config.strategies) {
        try {
          // 检查策略是否支持当前请求
          if (!strategy.supports(request)) {
            request.log.debug(`[AuthMiddleware] 策略 ${strategy.name} 不支持当前请求`)
            continue
          }

          // 执行认证
          userContext = await strategy.authenticate(request)
          if (userContext) {
            request.log.info(`[AuthMiddleware] 策略 ${strategy.name} 认证成功`, {
              userId: userContext.userId,
              platform: userContext.platform,
            })
            break
          }
        } catch (error) {
          lastError = error
          request.log.warn(`[AuthMiddleware] 策略 ${strategy.name} 认证失败`, {
            error: error.message,
            strategy: strategy.name,
          })
        }
      }

      // 处理认证结果
      if (userContext) {
        // 认证成功，注入用户上下文
        request.user = userContext
      } else if (config.required) {
        // 认证失败且必须认证
        const authError = this.createAuthError(lastError)
        await this.handleAuthError(request, reply, authError, config)
        return reply.send(authError)
      } else {
        // 认证失败但非必须，继续执行
        request.log.debug('[AuthMiddleware] 认证失败但非必须，继续执行请求')
      }
    }
  }

  /**
   * 检查路由是否在排除列表中
   * @param url 请求URL
   * @param config 认证配置
   * @returns 是否排除
   */
  private isExcludedRoute(url: string, config: AuthConfig): boolean {
    if (!config.excludeRoutes || config.excludeRoutes.length === 0) {
      return false
    }

    return config.excludeRoutes.some(pattern => {
      // 支持通配符匹配
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'))
        return regex.test(url)
      }

      // 精确匹配或前缀匹配
      return url === pattern || url.startsWith(pattern)
    })
  }

  /**
   * 创建认证错误
   * @param originalError 原始错误
   * @returns 标准化认证错误
   */
  private createAuthError(originalError: Error | null): AuthError {
    if (originalError && 'type' in originalError) {
      return originalError as AuthError
    }

    const authError = new Error(
      originalError?.message || '认证失败'
    ) as AuthError

    authError.type = AuthErrorType.INVALID_TOKEN
    authError.statusCode = 401

    return authError
  }

  /**
   * 处理认证错误
   * @param request Fastify请求对象
   * @param reply Fastify响应对象
   * @param error 认证错误
   * @param config 认证配置
   */
  private async handleAuthError(
    request: FastifyRequest,
    reply: FastifyReply,
    error: AuthError,
    config: AuthConfig
  ): Promise<void> {
    // 设置响应状态码
    reply.status(error.statusCode)

    // 设置响应头
    reply.header('Content-Type', 'application/json')

    // 构建错误响应体
    const errorResponse = {
      success: false,
      error: {
        type: error.type,
        message: config.errorMessage || error.message,
        code: error.statusCode,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    }

    // 添加WWW-Authenticate头（用于401响应）
    if (error.statusCode === 401) {
      const authenticateHeader = this.buildAuthenticateHeader(config)
      if (authenticateHeader) {
        reply.header('WWW-Authenticate', authenticateHeader)
      }
    }

    // 记录错误日志
    request.log.error('[AuthMiddleware] 认证失败', {
      error: error.message,
      type: error.type,
      statusCode: error.statusCode,
      url: request.url,
      method: request.method,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    })

    // 发送错误响应
    reply.send(errorResponse)
  }

  /**
   * 构建WWW-Authenticate头
   * @param config 认证配置
   * @returns WWW-Authenticate头的值
   */
  private buildAuthenticateHeader(config: AuthConfig): string {
    const schemes: string[] = []

    for (const strategy of config.strategies) {
      switch (strategy.name) {
        case 'jwt':
          schemes.push('Bearer realm="JWT Authentication"')
          break
        case 'api-key':
          schemes.push('ApiKey realm="API Key Authentication"')
          break
        case 'wechat':
          schemes.push('WeChat realm="WeChat Authentication"')
          break
        default:
          schemes.push(`${strategy.name} realm="${strategy.name} Authentication"`)
      }
    }

    return schemes.join(', ')
  }

  /**
   * 添加认证策略
   * @param strategy 认证策略
   */
  public addStrategy(strategy: IAuthStrategy): void {
    this.strategies.push(strategy)
    this.defaultConfig.strategies.push(strategy)
  }

  /**
   * 移除认证策略
   * @param strategyName 策略名称
   * @returns 是否成功移除
   */
  public removeStrategy(strategyName: string): boolean {
    const index = this.strategies.findIndex(s => s.name === strategyName)
    if (index !== -1) {
      this.strategies.splice(index, 1)
      const defaultIndex = this.defaultConfig.strategies.findIndex(s => s.name === strategyName)
      if (defaultIndex !== -1) {
        this.defaultConfig.strategies.splice(defaultIndex, 1)
      }
      return true
    }
    return false
  }

  /**
   * 获取所有策略
   * @returns 策略列表
   */
  public getStrategies(): IAuthStrategy[] {
    return [...this.strategies]
  }

  /**
   * 更新默认配置
   * @param newConfig 新的配置
   */
  public updateDefaultConfig(newConfig: Partial<AuthConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...newConfig }
  }

  /**
   * 创建路由级认证装饰器
   * @param config 认证配置
   * @returns 装饰器函数
   */
  public createAuthDecorator(config: Partial<AuthConfig>) {
    return (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
      this.createMiddleware(config)(request, reply).then(done).catch(done)
    }
  }
}

/**
 * 权限检查装饰器
 * 用于在路由处理函数中检查用户权限
 */
export function requirePermissions(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({
        success: false,
        error: {
          type: AuthErrorType.MISSING_TOKEN,
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
          type: AuthErrorType.INSUFFICIENT_PERMISSIONS,
          message: '权限不足',
          code: 403,
          required: permissions,
          current: userPermissions,
        },
      })
      return
    }
  }
}

/**
 * 角色检查装饰器
 * 用于在路由处理函数中检查用户角色
 */
export function requireRoles(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({
        success: false,
        error: {
          type: AuthErrorType.MISSING_TOKEN,
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
          type: AuthErrorType.INSUFFICIENT_PERMISSIONS,
          message: '角色权限不足',
          code: 403,
          required: roles,
          current: userRoles,
        },
      })
      return
    }
  }
}

/**
 * VIP检查装饰器
 * 用于检查用户VIP状态
 */
export function requireVip(minimumLevel: 'BASIC' | 'PRO' | 'ENTERPRISE' = 'BASIC') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({
        success: false,
        error: {
          type: AuthErrorType.MISSING_TOKEN,
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
          type: AuthErrorType.INSUFFICIENT_PERMISSIONS,
          message: `需要${minimumLevel}及以上VIP等级`,
          code: 403,
          currentVipLevel: user.vipLevel,
          isVipExpired: user.isVipExpired,
        },
      })
      return
    }
  }
}