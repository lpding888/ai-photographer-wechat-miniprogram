import { FastifyRequest } from 'fastify'
import { IAuthStrategy, UserContext, AuthError, AuthErrorType } from '../types'

/**
 * 认证策略抽象基类
 * 提供通用的认证功能和工具方法
 */
export abstract class BaseAuthStrategy implements IAuthStrategy {
  /** 策略名称 */
  public abstract readonly name: string

  /**
   * 检查是否支持处理当前请求
   * 子类必须实现此方法
   */
  public abstract supports(request: FastifyRequest): boolean

  /**
   * 执行认证逻辑
   * 子类必须实现此方法
   */
  public abstract authenticate(request: FastifyRequest): Promise<UserContext | null>

  /**
   * 从请求中提取Token
   * @param request Fastify请求对象
   * @param headerName 请求头名称（默认为Authorization）
   * @returns Token字符串或null
   */
  protected extractToken(request: FastifyRequest, headerName: string = 'authorization'): string | null {
    const headers = request.headers as Record<string, string>

    // 从请求头获取token
    const authHeader = headers[headerName]
    if (authHeader) {
      // 支持Bearer格式和直接token格式
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7)
      }
      return authHeader
    }

    // 从查询参数获取token
    const tokenFromQuery = (request.query as Record<string, string>)?.token
    if (tokenFromQuery) {
      return tokenFromQuery
    }

    // 从Cookie获取token
    const tokenFromCookie = (request.cookies as Record<string, string>)?.token
    if (tokenFromCookie) {
      return tokenFromCookie
    }

    return null
  }

  /**
   * 从请求中提取API Key
   * @param request Fastify请求对象
   * @param headerName 请求头名称（默认为X-API-Key）
   * @param queryParam 查询参数名称（默认为apiKey）
   * @returns API Key字符串或null
   */
  protected extractApiKey(
    request: FastifyRequest,
    headerName: string = 'x-api-key',
    queryParam: string = 'apiKey'
  ): string | null {
    const headers = request.headers as Record<string, string>

    // 从请求头获取API Key
    const apiKeyFromHeader = headers[headerName]
    if (apiKeyFromHeader) {
      return apiKeyFromHeader
    }

    // 从查询参数获取API Key
    const apiKeyFromQuery = (request.query as Record<string, string>)?.[queryParam]
    if (apiKeyFromQuery) {
      return apiKeyFromQuery
    }

    return null
  }

  /**
   * 从请求中提取微信相关参数
   * @param request Fastify请求对象
   * @returns 微信认证参数对象
   */
  protected extractWechatParams(request: FastifyRequest): {
    code?: string
    appId?: string
    openid?: string
    sessionKey?: string
  } {
    const headers = request.headers as Record<string, string>
    const query = request.query as Record<string, string>
    const body = request.body as Record<string, any>

    return {
      // 从查询参数获取
      code: query.code,
      appId: query.appId || headers['x-app-id'],
      openid: query.openid || headers['x-openid'],
      sessionKey: query.sessionKey || headers['x-session-key'],

      // 从请求体获取（POST请求）
      ...body,
    }
  }

  /**
   * 创建认证错误
   * @param type 错误类型
   * @param message 错误消息
   * @param statusCode HTTP状态码
   * @returns 认证错误对象
   */
  protected createAuthError(
    type: AuthErrorType,
    message?: string,
    statusCode: number = 401
  ): AuthError {
    const error = new Error(message || this.getDefaultErrorMessage(type)) as AuthError
    error.type = type
    error.statusCode = statusCode
    return error
  }

  /**
   * 获取默认错误消息
   * @param type 错误类型
   * @returns 默认错误消息
   */
  private getDefaultErrorMessage(type: AuthErrorType): string {
    switch (type) {
      case AuthErrorType.MISSING_TOKEN:
        return '缺少认证令牌'
      case AuthErrorType.INVALID_TOKEN:
        return '无效的认证令牌'
      case AuthErrorType.EXPIRED_TOKEN:
        return '认证令牌已过期'
      case AuthErrorType.INSUFFICIENT_PERMISSIONS:
        return '权限不足'
      case AuthErrorType.USER_NOT_FOUND:
        return '用户不存在'
      case AuthErrorType.STRATEGY_NOT_SUPPORTED:
        return '不支持的认证策略'
      case AuthErrorType.CONFIGURATION_ERROR:
        return '认证配置错误'
      default:
        return '认证失败'
    }
  }

  /**
   * 验证用户权限
   * @param user 用户上下文
   * @param requiredPermissions 需要的权限列表
   * @returns 是否具有权限
   */
  protected hasPermissions(user: UserContext, requiredPermissions: string[]): boolean {
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true
    }

    const userPermissions = user.permissions || []
    return requiredPermissions.every(permission =>
      userPermissions.includes(permission as any)
    )
  }

  /**
   * 验证用户角色
   * @param user 用户上下文
   * @param requiredRoles 需要的角色列表
   * @returns 是否具有角色
   */
  protected hasRoles(user: UserContext, requiredRoles: string[]): boolean {
    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const userRoles = user.roles || []
    return requiredRoles.some(role =>
      userRoles.includes(role as any)
    )
  }

  /**
   * 检查VIP状态
   * @param user 用户上下文
   * @returns VIP是否有效
   */
  protected isVipValid(user: UserContext): boolean {
    if (!user.vipLevel || user.vipLevel === 'FREE') {
      return false
    }

    if (user.isVipExpired) {
      return false
    }

    return true
  }

  /**
   * 记录认证日志
   * @param request Fastify请求对象
   * @param message 日志消息
   * @param level 日志级别
   * @param data 附加数据
   */
  protected log(
    request: FastifyRequest,
    message: string,
    level: 'info' | 'warn' | 'error' = 'info',
    data?: any
  ): void {
    const logData = {
      strategy: this.name,
      requestId: request.id,
      url: request.url,
      method: request.method,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      ...data,
    }

    request.log[level](`[Auth:${this.name}] ${message}`, logData)
  }

  /**
   * 安全地解析JSON
   * @param jsonString JSON字符串
   * @returns 解析结果或null
   */
  protected safeParseJson(jsonString: string): any | null {
    try {
      return JSON.parse(jsonString)
    } catch (error) {
      return null
    }
  }

  /**
   * 延迟执行（用于防止时序攻击）
   * @param ms 延迟毫秒数
   * @returns Promise
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 生成随机字符串（用于安全相关场景）
   * @param length 字符串长度
   * @returns 随机字符串
   */
  protected generateRandomString(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }
}