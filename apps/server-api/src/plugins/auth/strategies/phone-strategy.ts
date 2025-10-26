import { FastifyRequest } from 'fastify'
import { BaseAuthStrategy } from './base-strategy'
import { UserContext, AuthErrorType, Platform, UserRole, Permission } from '../types'
import { authService } from '../../../services/auth.service'

/**
 * 手机号认证策略
 * 支持验证码认证和Token认证两种方式
 */
export class PhoneStrategy extends BaseAuthStrategy {
  public readonly name = 'phone'

  /**
   * 检查是否支持处理当前请求
   */
  public supports(request: FastifyRequest): boolean {
    // 支持验证码认证
    const { phone, code } = request.body as { phone?: string; code?: string }
    if (phone && code) {
      return true
    }

    // 支持Token认证（Authorization header或query参数）
    const token = this.extractToken(request)
    if (token) {
      return true
    }

    return false
  }

  /**
   * 执行手机号认证
   */
  public async authenticate(request: FastifyRequest): Promise<UserContext | null> {
    try {
      const { phone, code } = request.body as { phone?: string; code?: string }

      // 验证码认证方式
      if (phone && code) {
        return await this.authenticateByCode(phone, code, request)
      }

      // Token认证方式
      const token = this.extractToken(request)
      if (token) {
        return await this.authenticateByToken(token, request)
      }

      throw this.createAuthError(AuthErrorType.MISSING_TOKEN, '缺少认证信息')
    } catch (error) {
      this.log(request, `手机号认证失败: ${error.message}`, 'warn')

      if (error.type) {
        throw error
      }

      throw this.createAuthError(AuthErrorType.INVALID_TOKEN, error.message)
    }
  }

  /**
   * 通过验证码进行认证
   * @param phone 手机号
   * @param code 验证码
   * @param request Fastify请求对象
   * @returns 用户上下文
   */
  private async authenticateByCode(
    phone: string,
    code: string,
    request: FastifyRequest
  ): Promise<UserContext | null> {
    try {
      // 验证手机号格式
      if (!this.isValidPhoneNumber(phone)) {
        throw this.createAuthError(AuthErrorType.INVALID_TOKEN, '手机号格式不正确')
      }

      // 使用认证服务进行登录
      const loginResult = await authService.loginByPhone(phone, code, request)

      // 构建用户上下文
      const userContext: UserContext = {
        userId: loginResult.user.userId,
        platform: loginResult.user.platform,
        roles: loginResult.user.roles,
        permissions: loginResult.user.permissions,
        vipLevel: loginResult.user.vipLevel,
        isVipExpired: loginResult.user.isVipExpired,
        metadata: {
          phone,
          loginMethod: 'phone_code',
          isNewUser: loginResult.isNewUser,
          loginTime: new Date().toISOString(),
        },
      }

      this.log(request, '手机验证码认证成功', 'info', {
        userId: userContext.userId,
        phone: this.maskPhoneNumber(phone),
        isNewUser: loginResult.isNewUser,
      })

      return userContext
    } catch (error) {
      this.log(request, `手机验证码认证失败: ${error.message}`, 'warn')
      throw this.createAuthError(
        AuthErrorType.INVALID_TOKEN,
        error instanceof Error ? error.message : '手机验证码认证失败'
      )
    }
  }

  /**
   * 通过Token进行认证
   * @param token JWT Token
   * @param request Fastify请求对象
   * @returns 用户上下文
   */
  private async authenticateByToken(
    token: string,
    request: FastifyRequest
  ): Promise<UserContext | null> {
    try {
      // 使用认证插件的Token验证功能
      // 由于我们无法直接访问认证插件实例，这里使用简化的实现

      // 在实际项目中，这里应该：
      // 1. 解析JWT token
      // 2. 验证token签名和过期时间
      // 3. 检查token是否有效
      // 4. 返回用户上下文

      // 临时实现：返回模拟数据
      if (token.includes('mock')) {
        const userContext: UserContext = {
          userId: 'mock_user_id',
          platform: Platform.WEB,
          roles: [UserRole.USER],
          permissions: [Permission.READ_PROFILE, Permission.CREATE_WORK],
          vipLevel: 'FREE',
          isVipExpired: false,
          metadata: {
            loginMethod: 'phone_token',
            loginTime: new Date().toISOString(),
          },
        }

        this.log(request, '手机Token认证成功', 'info', {
          userId: userContext.userId,
        })

        return userContext
      }

      throw this.createAuthError(AuthErrorType.INVALID_TOKEN, '无效的Token')
    } catch (error) {
      this.log(request, `手机Token认证失败: ${error.message}`, 'warn')
      throw this.createAuthError(
        AuthErrorType.INVALID_TOKEN,
        error instanceof Error ? error.message : '手机Token认证失败'
      )
    }
  }

  /**
   * 验证手机号格式
   * @param phone 手机号
   * @returns 是否有效
   */
  private isValidPhoneNumber(phone: string): boolean {
    // 简单的中国手机号验证：11位数字，以1开头
    const phoneRegex = /^1[3-9]\d{9}$/
    return phoneRegex.test(phone)
  }

  /**
   * 手机号脱敏
   * @param phone 手机号
   * @returns 脱敏后的手机号
   */
  private maskPhoneNumber(phone: string): string {
    if (!phone || phone.length !== 11) {
      return '***'
    }
    return `${phone.substring(0, 3)}****${phone.substring(7)}`
  }

  /**
   * 检查手机号是否已注册
   * @param phone 手机号
   * @returns 是否已注册
   */
  async isPhoneRegistered(phone: string): Promise<boolean> {
    try {
      // 在实际项目中，这里应该查询数据库
      // 临时实现：返回模拟数据
      return phone === '13800138000' // 模拟已注册的手机号
    } catch (error) {
      console.error('[PhoneStrategy] 检查手机号注册状态失败:', error)
      return false
    }
  }

  /**
   * 获取手机号绑定的用户信息
   * @param phone 手机号
   * @returns 用户信息或null
   */
  async getUserByPhone(phone: string): Promise<{
    userId: string
    phone: string
    isActive: boolean
    lastLoginAt?: Date
  } | null> {
    try {
      // 在实际项目中，这里应该查询数据库
      // 临时实现：返回模拟数据
      if (phone === '13800138000') {
        return {
          userId: 'user_123',
          phone,
          isActive: true,
          lastLoginAt: new Date(),
        }
      }
      return null
    } catch (error) {
      console.error('[PhoneStrategy] 获取手机号用户信息失败:', error)
      return null
    }
  }

  /**
   * 检查手机号是否被禁用
   * @param phone 手机号
   * @returns 是否被禁用
   */
  async isPhoneBlocked(phone: string): Promise<boolean> {
    try {
      // 在实际项目中，这里应该检查黑名单或禁用状态
      // 临时实现：返回模拟数据
      const blockedPhones = ['13800138001'] // 模拟被禁用的手机号
      return blockedPhones.includes(phone)
    } catch (error) {
      console.error('[PhoneStrategy] 检查手机号禁用状态失败:', error)
      return false
    }
  }

  /**
   * 记录手机号登录成功
   * @param phone 手机号
   * @param userId 用户ID
   * @param request Fastify请求对象
   */
  async recordPhoneLoginSuccess(
    phone: string,
    userId: string,
    request: FastifyRequest
  ): Promise<void> {
    try {
      const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown'
      const userAgent = request.headers['user-agent'] || 'unknown'

      // 在实际项目中，这里应该记录登录日志到数据库
      console.log(`[PhoneStrategy] 手机号登录成功记录: ${this.maskPhoneNumber(phone)}, 用户ID: ${userId}, IP: ${ip}`)
    } catch (error) {
      console.error('[PhoneStrategy] 记录手机号登录失败:', error)
    }
  }

  /**
   * 检查手机号登录频率限制
   * @param phone 手机号
   * @param ip IP地址
   * @returns 检查结果
   */
  async checkPhoneLoginRateLimit(
    phone: string,
    ip: string
  ): Promise<{
    allowed: boolean
    reason?: string
    retryAfter?: number
  }> {
    try {
      // 在实际项目中，这里应该检查登录频率限制
      // 可以使用Redis或其他缓存来记录登录尝试

      // 临时实现：返回允许登录
      return { allowed: true }
    } catch (error) {
      console.error('[PhoneStrategy] 检查手机号登录频率限制失败:', error)
      return { allowed: true } // 出错时允许登录，避免影响正常用户
    }
  }
}