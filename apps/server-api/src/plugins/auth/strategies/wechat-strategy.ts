import { FastifyRequest } from 'fastify'
import { BaseAuthStrategy } from './base-strategy'
import { UserContext, AuthErrorType, Platform, UserRole, Permission, WechatAuthConfig } from '../types'
import { userService } from '../../../services/user.service'
import { IdentityProvider } from '../types'

/**
 * 微信用户信息接口
 */
interface WechatUserInfo {
  openid: string
  session_key: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

/**
 * 微信认证策略
 * 支持微信小程序和微信公众号认证
 */
export class WechatStrategy extends BaseAuthStrategy {
  public readonly name = 'wechat'

  private config: WechatAuthConfig
  private apiUrl: string

  constructor(config: WechatAuthConfig) {
    super()
    if (!config.appId || !config.appSecret) {
      throw new Error('Wechat appId and appSecret are required')
    }

    this.config = config
    this.apiUrl = config.apiUrl || 'https://api.weixin.qq.com'
  }

  /**
   * 检查是否支持处理当前请求
   */
  public supports(request: FastifyRequest): boolean {
    const params = this.extractWechatParams(request)

    // 支持code方式（小程序登录）
    if (params.code && params.appId === this.config.appId) {
      return true
    }

    // 支持直接传递openid和session_key方式
    if (params.openid && params.sessionKey) {
      return true
    }

    return false
  }

  /**
   * 执行微信认证
   */
  public async authenticate(request: FastifyRequest): Promise<UserContext | null> {
    try {
      const params = this.extractWechatParams(request)

      let wechatUserInfo: WechatUserInfo

      if (params.code) {
        // 使用code换取openid和session_key
        wechatUserInfo = await this.exchangeCodeForUserInfo(params.code)
      } else if (params.openid && params.sessionKey) {
        // 直接使用提供的openid和session_key
        wechatUserInfo = {
          openid: params.openid,
          session_key: params.session_key,
        }
      } else {
        throw this.createAuthError(
          AuthErrorType.MISSING_TOKEN,
          '缺少微信认证参数'
        )
      }

      // 验证微信API响应
      if (wechatUserInfo.errcode) {
        throw this.createAuthError(
          AuthErrorType.INVALID_TOKEN,
          `微信API错误: ${wechatUserInfo.errmsg}`
        )
      }

      // 构建用户上下文
      const userContext = await this.buildUserContext(wechatUserInfo, request)

      this.log(request, '微信认证成功', 'info', {
        openid: userContext.openid,
        platform: userContext.platform,
      })

      return userContext
    } catch (error) {
      this.log(request, `微信认证失败: ${error.message}`, 'warn', {
        error: error.type || 'UNKNOWN_ERROR',
      })

      if (error.type) {
        throw error
      }

      throw this.createAuthError(AuthErrorType.INVALID_TOKEN, error.message)
    }
  }

  /**
   * 使用code换取用户信息
   * @param code 微信授权码
   * @returns 微信用户信息
   */
  private async exchangeCodeForUserInfo(code: string): Promise<WechatUserInfo> {
    const url = `${this.apiUrl}/sns/jscode2session`
    const params = new URLSearchParams({
      appid: this.config.appId,
      secret: this.config.appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    })

    const fullUrl = `${url}?${params.toString()}`

    // 使用AbortController实现超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      // 清除超时定时器（避免内存泄漏）
      clearTimeout(timeoutId)

      // 处理超时错误
      if (error.name === 'AbortError') {
        throw this.createAuthError(
          AuthErrorType.CONFIGURATION_ERROR,
          '微信API调用超时'
        )
      }

      throw this.createAuthError(
        AuthErrorType.CONFIGURATION_ERROR,
        `微信API调用失败: ${error.message}`
      )
    } finally {
      // 确保超时定时器被清除
      clearTimeout(timeoutId)
    }
  }

  /**
   * 构建用户上下文
   * @param wechatUserInfo 微信用户信息
   * @param request Fastify请求对象
   * @returns 用户上下文
   */
  private async buildUserContext(
    wechatUserInfo: WechatUserInfo,
    request: FastifyRequest
  ): Promise<UserContext> {
    try {
      // 使用数据库服务查找或创建用户
      const { user, identity } = await userService.findOrCreateUserByIdentity(
        IdentityProvider.WECHAT_MINIAPP,
        wechatUserInfo.openid,
        {
          platform: Platform.MINIAPP,
          metadata: {
            appId: this.config.appId,
            unionid: wechatUserInfo.unionid,
            loginMethod: 'wechat',
          },
        },
        {
          verified: true,
          metadata: {
            sessionKey: wechatUserInfo.sessionKey,
            appId: this.config.appId,
            loginTime: new Date().toISOString(),
          },
        }
      )

      // 构建用户上下文
      const userContext = userService.buildUserContext(user, identity, Platform.MINIAPP)

      this.log(request, '微信用户构建上下文成功', 'info', {
        userId: userContext.userId,
        openid: userContext.openid,
        isNewUser: !identity ? true : false,
      })

      return userContext
    } catch (error) {
      this.log(request, `构建微信用户上下文失败: ${error.message}`, 'error')
      throw this.createAuthError(
        AuthErrorType.USER_NOT_FOUND,
        `构建用户信息失败: ${error.message}`
      )
    }
  }

  
  /**
   * 验证微信小程序数据签名
   * @param rawData 原始数据
   * @param signature 签名
   * @param sessionKey 会话密钥
   * @returns 签名是否有效
   */
  public async validateSignature(
    rawData: string,
    signature: string,
    sessionKey: string
  ): Promise<boolean> {
    try {
      const crypto = await import('crypto')
      const hash = crypto
        .createHmac('sha1', sessionKey)
        .update(rawData)
        .digest('hex')

      return hash === signature
    } catch (error) {
      this.log(
        { url: '', method: '', headers: {}, id: '', ip: '', log: null } as FastifyRequest,
        `签名验证失败: ${error.message}`,
        'error'
      )
      return false
    }
  }

  /**
   * 解密微信小程序数据
   * @param encryptedData 加密数据
   * @param iv 初始向量
   * @param sessionKey 会话密钥
   * @returns 解密后的数据
   */
  public async decryptData(
    encryptedData: string,
    iv: string,
    sessionKey: string
  ): Promise<any> {
    try {
      const crypto = await import('crypto')
      const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(sessionKey, 'base64'), Buffer.from(iv, 'base64'))

      let decrypted = decipher.update(encryptedData, 'base64', 'utf8')
      decrypted += decipher.final('utf8')

      const data = JSON.parse(decrypted)
      return data
    } catch (error) {
      throw new Error(`解密微信数据失败: ${error.message}`)
    }
  }

  /**
   * 获取微信用户Access Token（用于网页授权）
   * @param code 授权码
   * @returns Access Token信息
   */
  public async getAccessToken(code: string): Promise<{
    access_token: string
    expires_in: number
    refresh_token: string
    openid: string
    scope: string
    unionid?: string
  }> {
    const url = `${this.apiUrl}/sns/oauth2/access_token`
    const params = new URLSearchParams({
      appid: this.config.appId,
      secret: this.config.appSecret,
      code,
      grant_type: 'authorization_code',
    })

    const fullUrl = `${url}?${params.toString()}`

    try {
      const response = await fetch(fullUrl)
      const data = await response.json()

      if (data.errcode) {
        throw new Error(`获取Access Token失败: ${data.errmsg}`)
      }

      return data
    } catch (error) {
      throw this.createAuthError(
        AuthErrorType.CONFIGURATION_ERROR,
        `获取微信Access Token失败: ${error.message}`
      )
    }
  }

  /**
   * 刷新Access Token
   * @param refreshToken 刷新令牌
   * @returns 新的Access Token信息
   */
  public async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string
    expires_in: number
    refresh_token: string
    openid: string
    scope: string
  }> {
    const url = `${this.apiUrl}/sns/oauth2/refresh_token`
    const params = new URLSearchParams({
      appid: this.config.appId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })

    const fullUrl = `${url}?${params.toString()}`

    try {
      const response = await fetch(fullUrl)
      const data = await response.json()

      if (data.errcode) {
        throw new Error(`刷新Access Token失败: ${data.errmsg}`)
      }

      return data
    } catch (error) {
      throw this.createAuthError(
        AuthErrorType.CONFIGURATION_ERROR,
        `刷新微信Access Token失败: ${error.message}`
      )
    }
  }
}