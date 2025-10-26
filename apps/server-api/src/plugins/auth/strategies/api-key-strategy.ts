import { FastifyRequest } from 'fastify'
import { BaseAuthStrategy } from './base-strategy'
import { UserContext, AuthErrorType, Platform, UserRole, Permission, ApiKeyConfig } from '../types'

/**
 * API Key信息接口
 */
interface ApiKeyInfo {
  key: string
  userId: string
  permissions: Permission[]
  active: boolean
  description?: string
  createdAt: Date
  lastUsedAt?: Date
  usageCount: number
}

/**
 * API Key认证策略
 * 支持请求头和查询参数方式传递API Key
 */
export class ApiKeyStrategy extends BaseAuthStrategy {
  public readonly name = 'api-key'

  private config: ApiKeyConfig
  private headerName: string
  private queryParam: string

  constructor(config: ApiKeyConfig) {
    super()
    if (!config.keys || config.keys.length === 0) {
      throw new Error('API keys are required')
    }

    this.config = config
    this.headerName = config.headerName || 'x-api-key'
    this.queryParam = config.queryParam || 'apiKey'

    // 验证配置的API keys
    this.validateConfig()
  }

  /**
   * 检查是否支持处理当前请求
   */
  public supports(request: FastifyRequest): boolean {
    const apiKey = this.extractApiKey(request, this.headerName, this.queryParam)
    return !!apiKey
  }

  /**
   * 执行API Key认证
   */
  public async authenticate(request: FastifyRequest): Promise<UserContext | null> {
    try {
      const apiKey = this.extractApiKey(request, this.headerName, this.queryParam)
      if (!apiKey) {
        throw this.createAuthError(AuthErrorType.MISSING_TOKEN, '缺少API Key')
      }

      // 查找API Key信息
      const apiKeyInfo = this.findApiKey(apiKey)
      if (!apiKeyInfo) {
        throw this.createAuthError(AuthErrorType.INVALID_TOKEN, '无效的API Key')
      }

      // 检查API Key是否激活
      if (!apiKeyInfo.active) {
        throw this.createAuthError(AuthErrorType.INVALID_TOKEN, 'API Key已禁用')
      }

      // 更新使用统计
      this.updateUsageStats(apiKeyInfo)

      // 构建用户上下文
      const userContext = this.buildUserContext(apiKeyInfo, request)

      this.log(request, 'API Key认证成功', 'info', {
        userId: userContext.userId,
        apiKey: this.maskApiKey(apiKey),
        permissions: userContext.permissions,
      })

      return userContext
    } catch (error) {
      this.log(request, `API Key认证失败: ${error.message}`, 'warn', {
        error: error.type || 'UNKNOWN_ERROR',
      })

      if (error.type) {
        throw error
      }

      throw this.createAuthError(AuthErrorType.INVALID_TOKEN, error.message)
    }
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    const keySet = new Set<string>()

    for (const apiKey of this.config.keys) {
      if (!apiKey.key || !apiKey.userId) {
        throw new Error('API key and userId are required')
      }

      if (keySet.has(apiKey.key)) {
        throw new Error(`Duplicate API key found: ${this.maskApiKey(apiKey.key)}`)
      }

      keySet.add(apiKey.key)
    }
  }

  /**
   * 查找API Key信息
   * @param apiKey API Key字符串
   * @returns API Key信息或null
   */
  private findApiKey(apiKey: string): ApiKeyInfo | null {
    const keyConfig = this.config.keys.find(k => k.key === apiKey)
    if (!keyConfig) {
      return null
    }

    return {
      key: keyConfig.key,
      userId: keyConfig.userId,
      permissions: keyConfig.permissions,
      active: keyConfig.active,
      description: keyConfig.description,
      createdAt: new Date(), // 实际项目中应该从数据库获取
      usageCount: 0,
    }
  }

  /**
   * 更新使用统计
   * @param apiKeyInfo API Key信息
   */
  private updateUsageStats(apiKeyInfo: ApiKeyInfo): void {
    // 在实际项目中，这里应该更新数据库中的使用统计
    apiKeyInfo.lastUsedAt = new Date()
    apiKeyInfo.usageCount += 1
  }

  /**
   * 构建用户上下文
   * @param apiKeyInfo API Key信息
   * @param request Fastify请求对象
   * @returns 用户上下文
   */
  private buildUserContext(
    apiKeyInfo: ApiKeyInfo,
    request: FastifyRequest
  ): UserContext {
    // 根据权限确定用户角色
    const roles = this.determineRoles(apiKeyInfo.permissions)

    return {
      userId: apiKeyInfo.userId,
      platform: Platform.ADMIN, // API Key主要用于服务间调用和管理
      roles,
      permissions: apiKeyInfo.permissions,
      vipLevel: 'ENTERPRISE', // API Key用户默认具有企业级权限
      isVipExpired: false,
      metadata: {
        apiKey: this.maskApiKey(apiKeyInfo.key),
        apiKeyDescription: apiKeyInfo.description,
        createdAt: apiKeyInfo.createdAt.toISOString(),
        usageCount: apiKeyInfo.usageCount,
        lastUsedAt: apiKeyInfo.lastUsedAt?.toISOString(),
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      },
    }
  }

  /**
   * 根据权限确定用户角色
   * @param permissions 权限列表
   * @returns 用户角色列表
   */
  private determineRoles(permissions: Permission[]): UserRole[] {
    const roles: UserRole[] = []

    // 根据权限判断角色
    if (permissions.includes(Permission.MANAGE_SYSTEM)) {
      roles.push(UserRole.SUPER_ADMIN)
    } else if (permissions.some(p => p.startsWith('manage:'))) {
      roles.push(UserRole.ADMIN)
    } else if (permissions.includes(Permission.USE_VIP_FEATURES)) {
      roles.push(UserRole.VIP)
    } else {
      roles.push(UserRole.USER)
    }

    return roles
  }

  /**
   * 掩码API Key用于日志显示
   * @param apiKey API Key字符串
   * @returns 掩码后的API Key
   */
  private maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 8) {
      return '***'
    }
    return `${apiKey.substring(0, 4)}***${apiKey.substring(apiKey.length - 4)}`
  }

  /**
   * 创建新的API Key
   * @param userId 用户ID
   * @param permissions 权限列表
   * @param description 描述
   * @returns 新的API Key
   */
  public createApiKey(
    userId: string,
    permissions: Permission[],
    description?: string
  ): string {
    const newKey = this.generateApiKey()

    // 在实际项目中，这里应该保存到数据库
    this.config.keys.push({
      key: newKey,
      userId,
      permissions,
      active: true,
      description,
    })

    return newKey
  }

  /**
   * 生成随机API Key
   * @returns API Key字符串
   */
  private generateApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return `ak_${result}`
  }

  /**
   * 禁用API Key
   * @param apiKey API Key字符串
   * @returns 是否成功禁用
   */
  public disableApiKey(apiKey: string): boolean {
    const keyConfig = this.config.keys.find(k => k.key === apiKey)
    if (keyConfig) {
      keyConfig.active = false
      return true
    }
    return false
  }

  /**
   * 启用API Key
   * @param apiKey API Key字符串
   * @returns 是否成功启用
   */
  public enableApiKey(apiKey: string): boolean {
    const keyConfig = this.config.keys.find(k => k.key === apiKey)
    if (keyConfig) {
      keyConfig.active = true
      return true
    }
    return false
  }

  /**
   * 删除API Key
   * @param apiKey API Key字符串
   * @returns 是否成功删除
   */
  public deleteApiKey(apiKey: string): boolean {
    const index = this.config.keys.findIndex(k => k.key === apiKey)
    if (index !== -1) {
      this.config.keys.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * 更新API Key权限
   * @param apiKey API Key字符串
   * @param permissions 新的权限列表
   * @returns 是否成功更新
   */
  public updateApiKeyPermissions(apiKey: string, permissions: Permission[]): boolean {
    const keyConfig = this.config.keys.find(k => k.key === apiKey)
    if (keyConfig) {
      keyConfig.permissions = permissions
      return true
    }
    return false
  }

  /**
   * 获取API Key信息（不包含密钥）
   * @param apiKey API Key字符串
   * @returns API Key信息（不包含密钥）或null
   */
  public getApiKeyInfo(apiKey: string): Omit<ApiKeyConfig['keys'][0], 'key'> | null {
    const keyConfig = this.config.keys.find(k => k.key === apiKey)
    if (keyConfig) {
      const { key, ...info } = keyConfig
      return info
    }
    return null
  }

  /**
   * 列出用户的所有API Key（不包含密钥）
   * @param userId 用户ID
   * @returns API Key信息列表
   */
  public listUserApiKeys(userId: string): Omit<ApiKeyConfig['keys'][0], 'key'>[] {
    return this.config.keys
      .filter(k => k.userId === userId)
      .map(({ key, ...info }) => info)
  }
}