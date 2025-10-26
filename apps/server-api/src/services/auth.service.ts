import { FastifyInstance } from 'fastify'
import { getPrismaClient, User, UserIdentity } from '@ai-photographer/db'
import { Platform, UserRole, Permission, VipLevel } from '../plugins/auth/types'
import { userService } from './user.service'
import { smsService } from './sms.service'

/**
 * 手机号登录请求接口
 */
export interface PhoneLoginRequest {
  phone: string
  code: string
}

/**
 * 微信登录请求接口
 */
export interface WechatLoginRequest {
  code: string
  state?: string
}

/**
 * Token刷新请求接口
 */
export interface RefreshTokenRequest {
  refreshToken: string
}

/**
 * 登录响应接口
 */
export interface LoginResponse {
  user: {
    userId: string
    nickname?: string
    avatarUrl?: string
    phone?: string
    platform: Platform
    roles: UserRole[]
    permissions: Permission[]
    vipLevel: VipLevel
    isVipExpired: boolean
  }
  tokens: {
    accessToken: string
    refreshToken: string
    expiresIn: number
    tokenType: string
  }
  isNewUser: boolean
}

/**
 * 认证业务服务类
 * 处理登录、注册、Token管理等业务逻辑
 */
export class AuthService {
  private prisma = getPrismaClient()

  /**
   * 手机号登录
   * @param phone 手机号
   * @param code 验证码
   * @param request Fastify请求对象
   * @returns 登录结果
   */
  async loginByPhone(phone: string, code: string, request: any): Promise<LoginResponse> {
    try {
      // 验证验证码
      const verifyResult = await smsService.verifyCode(phone, code)
      if (!verifyResult.success) {
        throw new Error(verifyResult.error || '验证码验证失败')
      }

      // 查找或创建用户
      const { user, identity } = await userService.findOrCreateUserByIdentity(
        'PHONE',
        phone,
        {
          platform: Platform.WEB, // 默认Web端
          metadata: {
            phone,
            loginMethod: 'phone',
            lastLoginAt: new Date().toISOString(),
          },
        },
        {
          verified: true,
          metadata: {
            phone,
            verifiedAt: new Date().toISOString(),
          },
        }
      )

      // 构建用户上下文
      const userContext = userService.buildUserContext(user, identity, Platform.WEB)

      // 生成Token
      const tokens = await this.generateTokens(userContext, request)

      console.log(`[Auth] 手机号登录成功: ${phone}, 用户ID: ${user.id}`)

      return {
        user: {
          userId: userContext.userId,
          nickname: user.nickname || undefined,
          avatarUrl: user.avatarUrl || undefined,
          phone,
          platform: userContext.platform,
          roles: userContext.roles,
          permissions: userContext.permissions,
          vipLevel: userContext.vipLevel!,
          isVipExpired: userContext.isVipExpired!,
        },
        tokens,
        isNewUser: !identity ? true : false,
      }
    } catch (error) {
      console.error('[Auth] 手机号登录失败:', error)
      throw new Error(error instanceof Error ? error.message : '手机号登录失败')
    }
  }

  /**
   * 微信扫码登录
   * @param code 微信授权码
   * @param request Fastify请求对象
   * @returns 登录结果
   */
  async loginByWechat(code: string, request: any): Promise<LoginResponse> {
    try {
      // 这里应该调用微信开放平台API获取用户信息
      // 目前先使用模拟数据，实际项目中需要接入微信开放平台
      const wechatUserInfo = await this.getWechatUserInfo(code)

      // 查找或创建用户
      const { user, identity } = await userService.findOrCreateUserByIdentity(
        'WECHAT_OPEN',
        wechatUserInfo.openid,
        {
          platform: Platform.WEB,
          nickname: wechatUserInfo.nickname,
          avatarUrl: wechatUserInfo.avatarUrl,
          metadata: {
            wechatUnionId: wechatUserInfo.unionid,
            loginMethod: 'wechat_open',
            lastLoginAt: new Date().toISOString(),
          },
        },
        {
          verified: true,
          metadata: {
            wechatUnionId: wechatUserInfo.unionid,
            verifiedAt: new Date().toISOString(),
          },
        }
      )

      // 构建用户上下文
      const userContext = userService.buildUserContext(user, identity, Platform.WEB)

      // 生成Token
      const tokens = await this.generateTokens(userContext, request)

      console.log(`[Auth] 微信登录成功: ${wechatUserInfo.openid}, 用户ID: ${user.id}`)

      return {
        user: {
          userId: userContext.userId,
          nickname: user.nickname || undefined,
          avatarUrl: user.avatarUrl || undefined,
          platform: userContext.platform,
          roles: userContext.roles,
          permissions: userContext.permissions,
          vipLevel: userContext.vipLevel!,
          isVipExpired: userContext.isVipExpired!,
        },
        tokens,
        isNewUser: !identity ? true : false,
      }
    } catch (error) {
      console.error('[Auth] 微信登录失败:', error)
      throw new Error(error instanceof Error ? error.message : '微信登录失败')
    }
  }

  /**
   * 刷新Token
   * @param refreshToken 刷新令牌
   * @param request Fastify请求对象
   * @returns 新的Token
   */
  async refreshToken(refreshToken: string, request: any): Promise<LoginResponse> {
    try {
      // 验证刷新Token
      const userContext = await this.verifyRefreshToken(refreshToken)
      if (!userContext) {
        throw new Error('刷新Token无效或已过期')
      }

      // 生成新的Token
      const tokens = await this.generateTokens(userContext, request)

      // 获取用户详细信息
      const user = await userService.getUserById(userContext.userId, true)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 构建响应
      return {
        user: {
          userId: userContext.userId,
          nickname: user.nickname || undefined,
          avatarUrl: user.avatarUrl || undefined,
          platform: userContext.platform,
          roles: userContext.roles,
          permissions: userContext.permissions,
          vipLevel: userContext.vipLevel!,
          isVipExpired: userContext.isVipExpired!,
        },
        tokens,
        isNewUser: false,
      }
    } catch (error) {
      console.error('[Auth] 刷新Token失败:', error)
      throw new Error(error instanceof Error ? error.message : '刷新Token失败')
    }
  }

  /**
   * 生成访问令牌和刷新令牌
   * @param userContext 用户上下文
   * @param request Fastify请求对象
   * @returns Token信息
   */
  private async generateTokens(userContext: any, request: FastifyInstance): Promise<LoginResponse['tokens']> {
    const accessToken = request.generateToken(userContext, '15m')
    const refreshToken = request.generateToken(userContext, '7d')

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15分钟，以秒为单位
      tokenType: 'Bearer',
    }
  }

  /**
   * 验证刷新Token
   * @param refreshToken 刷新令牌
   * @returns 用户上下文或null
   */
  private async verifyRefreshToken(refreshToken: string): Promise<any> {
    try {
      // 这里应该实现JWT验证逻辑
      // 由于我们有认证插件，可以使用认证插件的验证功能
      // 但为了简化，这里使用模拟实现

      // 实际项目中应该：
      // 1. 解析JWT token
      // 2. 验证token签名和过期时间
      // 3. 检查token类型是否为refresh token
      // 4. 返回用户上下文

      // 临时实现：返回模拟数据
      if (refreshToken === 'mock_refresh_token') {
        return {
          userId: 'mock_user_id',
          platform: Platform.WEB,
          roles: [UserRole.USER],
          permissions: [Permission.READ_PROFILE],
          vipLevel: 'FREE',
          isVipExpired: false,
        }
      }

      return null
    } catch (error) {
      console.error('[Auth] 验证刷新Token失败:', error)
      return null
    }
  }

  /**
   * 获取微信用户信息
   * @param code 微信授权码
   * @returns 微信用户信息
   */
  private async getWechatUserInfo(code: string): Promise<{
    openid: string
    unionid?: string
    nickname?: string
    avatarUrl?: string
  }> {
    try {
      // 这里应该调用微信开放平台API
      // 实际项目需要接入微信开放平台OAuth2.0流程

      // 临时实现：返回模拟数据
      return {
        openid: `mock_openid_${code}`,
        unionid: `mock_unionid_${code}`,
        nickname: '微信用户',
        avatarUrl: 'https://example.com/avatar.jpg',
      }
    } catch (error) {
      console.error('[Auth] 获取微信用户信息失败:', error)
      throw new Error('获取微信用户信息失败')
    }
  }

  /**
   * 用户登出
   * @param userId 用户ID
   * @param refreshToken 刷新令牌
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    try {
      // 在实际项目中，这里应该：
      // 1. 将refresh token加入黑名单
      // 2. 清理用户会话信息
      // 3. 记录登出日志

      console.log(`[Auth] 用户登出: ${userId}`)

      // 临时实现：只记录日志
      if (refreshToken) {
        console.log(`[Auth] 刷新Token已失效: ${refreshToken.substring(0, 10)}...`)
      }
    } catch (error) {
      console.error('[Auth] 登出失败:', error)
      throw new Error(error instanceof Error ? error.message : '登出失败')
    }
  }

  /**
   * 检查用户会话状态
   * @param userId 用户ID
   * @returns 会话状态
   */
  async checkSessionStatus(userId: string): Promise<{
    active: boolean
    lastActivity?: Date
    sessions: number
  }> {
    try {
      // 在实际项目中，这里应该检查用户的活跃会话
      // 临时实现：返回模拟数据

      return {
        active: true,
        lastActivity: new Date(),
        sessions: 1,
      }
    } catch (error) {
      console.error('[Auth] 检查会话状态失败:', error)
      return {
        active: false,
        sessions: 0,
      }
    }
  }

  /**
   * 强制用户下线
   * @param userId 用户ID
   * @param excludeToken 排除的Token（当前会话）
   */
  async forceLogout(userId: string, excludeToken?: string): Promise<void> {
    try {
      // 在实际项目中，这里应该：
      // 1. 使该用户的所有refresh token失效
      // 2. 清理用户会话缓存
      // 3. 通知客户端重新登录

      console.log(`[Auth] 强制用户下线: ${userId}`)
    } catch (error) {
      console.error('[Auth] 强制用户下线失败:', error)
      throw new Error(error instanceof Error ? error.message : '强制用户下线失败')
    }
  }
}

// 导出单例实例
export const authService = new AuthService()