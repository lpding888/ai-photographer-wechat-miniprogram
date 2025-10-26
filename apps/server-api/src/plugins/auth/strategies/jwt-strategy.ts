import { FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import { BaseAuthStrategy } from './base-strategy'
import { UserContext, JwtPayload, AuthErrorType, Platform, UserRole, Permission } from '../types'

/**
 * JWT认证策略配置接口
 */
export interface JwtStrategyConfig {
  /** JWT密钥 */
  secret: string
  /** 算法（默认HS256） */
  algorithm?: string
  /** 过期时间（默认7天） */
  expiresIn?: string | number
  /** 发行者 */
  issuer?: string
  /** 受众 */
  audience?: string
}

/**
 * JWT认证策略
 * 支持Bearer token和query parameter方式传递JWT
 */
export class JwtStrategy extends BaseAuthStrategy {
  public readonly name = 'jwt'

  private config: JwtStrategyConfig

  constructor(config: JwtStrategyConfig) {
    super()
    if (!config.secret) {
      throw new Error('JWT secret is required')
    }
    this.config = {
      algorithm: 'HS256',
      expiresIn: '7d',
      ...config,
    }
  }

  /**
   * 检查是否支持处理当前请求
   */
  public supports(request: FastifyRequest): boolean {
    const token = this.extractToken(request)
    return !!token
  }

  /**
   * 执行JWT认证
   */
  public async authenticate(request: FastifyRequest): Promise<UserContext | null> {
    try {
      const token = this.extractToken(request)
      if (!token) {
        throw this.createAuthError(AuthErrorType.MISSING_TOKEN)
      }

      // 验证JWT token
      const payload = await this.verifyToken(token)

      // 构建用户上下文
      const userContext = this.buildUserContext(payload)

      this.log(request, 'JWT认证成功', 'info', {
        userId: userContext.userId,
        platform: userContext.platform,
        roles: userContext.roles,
      })

      return userContext
    } catch (error) {
      this.log(request, `JWT认证失败: ${error.message}`, 'warn', {
        error: error.type || 'UNKNOWN_ERROR',
      })

      if (error.type) {
        throw error
      }

      throw this.createAuthError(AuthErrorType.INVALID_TOKEN, error.message)
    }
  }

  /**
   * 验证JWT token
   * @param token JWT字符串
   * @returns 解析后的payload
   */
  private async verifyToken(token: string): Promise<JwtPayload> {
    return new Promise((resolve, reject) => {
      const verifyOptions: jwt.VerifyOptions = {}

      if (this.config.algorithm) {
        verifyOptions.algorithms = [this.config.algorithm]
      }

      if (this.config.issuer) {
        verifyOptions.issuer = this.config.issuer
      }

      if (this.config.audience) {
        verifyOptions.audience = this.config.audience
      }

      jwt.verify(token, this.config.secret, verifyOptions, (error, decoded) => {
        if (error) {
          if (error.name === 'TokenExpiredError') {
            reject(this.createAuthError(
              AuthErrorType.EXPIRED_TOKEN,
              'JWT token已过期'
            ))
          } else if (error.name === 'JsonWebTokenError') {
            reject(this.createAuthError(
              AuthErrorType.INVALID_TOKEN,
              'JWT token格式无效'
            ))
          } else {
            reject(this.createAuthError(
              AuthErrorType.INVALID_TOKEN,
              error.message
            ))
          }
        } else {
          resolve(decoded as JwtPayload)
        }
      })
    })
  }

  /**
   * 构建用户上下文
   * @param payload JWT payload
   * @returns 用户上下文
   */
  private buildUserContext(payload: JwtPayload): UserContext {
    // 检查VIP状态
    let isVipExpired = false
    if (payload.vipExpiredAt) {
      isVipExpired = Date.now() > payload.vipExpiredAt
    }

    return {
      userId: payload.sub,
      openid: payload.openid,
      platform: payload.platform || Platform.WEB,
      roles: payload.roles || [UserRole.USER],
      permissions: payload.permissions || [Permission.READ_PROFILE],
      vipLevel: payload.vipLevel as any,
      isVipExpired,
      metadata: {
        jwtId: payload.jti,
        issuedAt: payload.iat ? new Date(payload.iat * 1000) : undefined,
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
      },
    }
  }

  /**
   * 生成JWT token
   * @param userContext 用户上下文
   * @param expiresIn 过期时间（可选，覆盖默认配置）
   * @returns JWT字符串
   */
  public generateToken(userContext: UserContext, expiresIn?: string | number): string {
    const payload: JwtPayload = {
      sub: userContext.userId,
      openid: userContext.openid,
      platform: userContext.platform,
      roles: userContext.roles,
      permissions: userContext.permissions,
      vipLevel: userContext.vipLevel,
      jti: this.generateRandomString(16),
    }

    // 添加VIP过期时间
    if (userContext.vipLevel && userContext.vipLevel !== 'FREE') {
      // 如果没有明确设置过期时间，设置为1年后
      const defaultVipExpiry = Date.now() + (365 * 24 * 60 * 60 * 1000)
      payload.vipExpiredAt = defaultVipExpiry
    }

    const signOptions: jwt.SignOptions = {
      algorithm: this.config.algorithm as jwt.Algorithm,
      expiresIn: expiresIn || this.config.expiresIn,
      issuer: this.config.issuer,
      audience: this.config.audience,
    }

    return jwt.sign(payload, this.config.secret, signOptions)
  }

  /**
   * 刷新JWT token
   * @param oldToken 旧token
   * @returns 新token
   */
  public async refreshToken(oldToken: string): Promise<string> {
    try {
      // 解析旧token（忽略过期检查）
      const decoded = jwt.decode(oldToken) as JwtPayload
      if (!decoded) {
        throw this.createAuthError(AuthErrorType.INVALID_TOKEN, '无法解析旧token')
      }

      // 构建新的用户上下文
      const userContext = this.buildUserContext(decoded)

      // 生成新token
      return this.generateToken(userContext)
    } catch (error) {
      throw this.createAuthError(
        AuthErrorType.INVALID_TOKEN,
        `刷新token失败: ${error.message}`
      )
    }
  }

  /**
   * 获取token剩余有效时间（秒）
   * @param token JWT字符串
   * @returns 剩余秒数，-1表示已过期，-2表示无效
   */
  public getTokenRemainingTime(token: string): number {
    try {
      const decoded = jwt.decode(token) as JwtPayload
      if (!decoded || !decoded.exp) {
        return -2
      }

      const now = Math.floor(Date.now() / 1000)
      return decoded.exp - now
    } catch (error) {
      return -2
    }
  }

  /**
   * 验证token格式（不验证签名和过期时间）
   * @param token JWT字符串
   * @returns 是否为有效格式
   */
  public isValidTokenFormat(token: string): boolean {
    try {
      const decoded = jwt.decode(token)
      return decoded !== null && typeof decoded === 'object'
    } catch (error) {
      return false
    }
  }
}