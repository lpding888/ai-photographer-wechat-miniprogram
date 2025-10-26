import { getPrismaClient, User, UserIdentity } from '@ai-photographer/db'
import { FastifyRequest } from 'fastify'
import { Platform, UserRole, Permission, VipLevel } from '../plugins/auth/types'

/**
 * 用户创建数据接口
 */
export interface CreateUserData {
  nickname?: string
  avatarUrl?: string
  platform: Platform
  metadata?: Record<string, any>
}

/**
 * 用户身份绑定数据接口
 */
export interface CreateIdentityData {
  userId: string
  provider: string
  identifier: string
  verified?: boolean
  metadata?: Record<string, any>
}

/**
 * 用户服务类
 * 处理用户相关的数据库操作
 */
export class UserService {
  private prisma = getPrismaClient()

  /**
   * 根据身份信息查找或创建用户
   * @param provider 身份提供商
   * @param identifier 身份标识符
   * @param createUserData 用户创建数据（如果用户不存在）
   * @param identityData 身份数据
   * @returns 用户信息和身份信息
   */
  async findOrCreateUserByIdentity(
    provider: string,
    identifier: string,
    createUserData: CreateUserData,
    identityData?: Partial<CreateIdentityData>
  ): Promise<{ user: User; identity: UserIdentity }> {
    try {
      // 首先查找已存在的身份绑定
      let identity = await this.prisma.userIdentity.findUnique({
        where: {
          provider_identifier: {
            provider,
            identifier,
          },
        },
        include: {
          user: true,
        },
      })

      if (identity) {
        // 身份已存在，更新相关信息
        await this.updateUserLastLogin(identity.userId)

        // 如果提供了额外的身份数据，更新身份信息
        if (identityData) {
          identity = await this.prisma.userIdentity.update({
            where: { id: identity.id },
            data: {
              verified: identityData.verified ?? true,
              metadata: identityData.metadata,
              updatedAt: new Date(),
            },
            include: { user: true },
          })
        }

        return { user: identity.user, identity }
      }

      // 身份不存在，创建新用户和身份绑定
      const user = await this.createNewUser(createUserData)

      const newIdentity = await this.prisma.userIdentity.create({
        data: {
          userId: user.id,
          provider,
          identifier,
          verified: identityData?.verified ?? true,
          metadata: identityData?.metadata,
          boundAt: new Date(),
        },
        include: { user: true },
      })

      return { user, identity: newIdentity }
    } catch (error) {
      throw new Error(`查找或创建用户失败: ${error.message}`)
    }
  }

  /**
   * 根据用户ID获取用户信息
   * @param userId 用户ID
   * @param includeIdentities 是否包含身份信息
   * @returns 用户信息
   */
  async getUserById(
    userId: string,
    includeIdentities: boolean = false
  ): Promise<User | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          identities: includeIdentities,
        },
      })

      return user
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`)
    }
  }

  /**
   * 根据身份信息查找用户
   * @param provider 身份提供商
   * @param identifier 身份标识符
   * @returns 用户信息和身份信息
   */
  async findUserByIdentity(
    provider: string,
    identifier: string
  ): Promise<{ user: User; identity: UserIdentity } | null> {
    try {
      const identity = await this.prisma.userIdentity.findUnique({
        where: {
          provider_identifier: {
            provider,
            identifier,
          },
        },
        include: {
          user: true,
        },
      })

      return identity ? { user: identity.user, identity } : null
    } catch (error) {
      throw new Error(`查找身份用户失败: ${error.message}`)
    }
  }

  /**
   * 创建新用户
   * @param userData 用户数据
   * @returns 创建的用户
   */
  private async createNewUser(userData: CreateUserData): Promise<User> {
    try {
      const defaultPermissions = this.getDefaultPermissions(userData.platform)
      const defaultRoles = this.getDefaultRoles(userData.platform)

      return await this.prisma.user.create({
        data: {
          nickname: userData.nickname,
          avatarUrl: userData.avatarUrl,
          status: 'active',
          credits: 10, // 新用户赠送10积分
          totalCredits: 10,
          metadata: {
            platform: userData.platform,
            registeredAt: new Date().toISOString(),
            ...userData.metadata,
          },
          vipLevel: 'FREE',
          // 注意：identities需要在创建用户后单独创建
        },
      })
    } catch (error) {
      throw new Error(`创建用户失败: ${error.message}`)
    }
  }

  /**
   * 更新用户最后登录时间
   * @param userId 用户ID
   */
  private async updateUserLastLogin(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginTime: new Date(),
          updatedAt: new Date(),
        },
      })
    } catch (error) {
      // 记录错误但不抛出异常，避免影响主流程
      console.error(`更新用户登录时间失败: ${error.message}`)
    }
  }

  /**
   * 获取平台默认权限
   * @param platform 平台类型
   * @returns 权限列表
   */
  private getDefaultPermissions(platform: Platform): Permission[] {
    const basePermissions = [
      Permission.READ_PROFILE,
      Permission.UPDATE_PROFILE,
      Permission.CREATE_WORK,
      Permission.READ_WORK,
      Permission.UPDATE_WORK,
      Permission.DELETE_WORK,
    ]

    switch (platform) {
      case Platform.MINIAPP:
        return [
          ...basePermissions,
          Permission.USE_VIP_FEATURES, // 小程序用户有试用VIP功能权限
        ]

      case Platform.WEB:
        return basePermissions

      case Platform.APP:
        return [
          ...basePermissions,
          Permission.USE_VIP_FEATURES,
        ]

      case Platform.ADMIN:
        return [
          ...basePermissions,
          Permission.MANAGE_USERS,
          Permission.MANAGE_WORKS,
          Permission.VIEW_STATISTICS,
        ]

      default:
        return basePermissions
    }
  }

  /**
   * 获取平台默认角色
   * @param platform 平台类型
   * @returns 角色列表
   */
  private getDefaultRoles(platform: Platform): UserRole[] {
    switch (platform) {
      case Platform.ADMIN:
        return [UserRole.ADMIN]
      case Platform.MINIAPP:
      case Platform.APP:
        return [UserRole.USER, UserRole.VIP] // 给个试用VIP
      default:
        return [UserRole.USER]
    }
  }

  /**
   * 构建用户上下文
   * @param user 用户信息
   * @param identity 身份信息
   * @param platform 平台类型
   * @returns 用户上下文
   */
  buildUserContext(
    user: User,
    identity?: UserIdentity,
    platform?: Platform
  ): import('../plugins/auth/types').UserContext {
    // 确定平台类型
    const userPlatform = platform || this.extractPlatformFromUser(user)

    // 从用户metadata中获取权限和角色，如果没有则使用默认值
    const userMetadata = user.metadata as any || {}
    const storedPermissions = userMetadata.permissions || []
    const storedRoles = userMetadata.roles || []

    // 如果数据库中没有存储权限角色，则使用默认值
    const permissions = storedPermissions.length > 0
      ? storedPermissions
      : this.getDefaultPermissions(userPlatform)

    const roles = storedRoles.length > 0
      ? storedRoles
      : this.getDefaultRoles(userPlatform)

    // 检查VIP状态
    const isVipExpired = this.isVipExpired(user)

    return {
      userId: user.id,
      openid: identity?.identifier,
      platform: userPlatform,
      roles: roles as UserRole[],
      permissions: permissions as Permission[],
      vipLevel: user.vipLevel as any,
      isVipExpired,
      metadata: {
        ...user.metadata,
        identityProvider: identity?.provider,
        identityVerified: identity?.verified,
        loginTime: new Date().toISOString(),
        // 动态权限和角色信息
        dynamicPermissions: permissions,
        dynamicRoles: roles,
      },
    }
  }

  /**
   * 从用户信息中提取平台类型
   * @param user 用户信息
   * @returns 平台类型
   */
  private extractPlatformFromUser(user: User): Platform {
    const metadata = user.metadata as any
    if (metadata?.platform) {
      return metadata.platform as Platform
    }

    // 根据注册时间等信息推断平台
    // 这里可以根据实际业务逻辑进行调整
    return Platform.WEB
  }

  /**
   * 检查VIP是否过期
   * @param user 用户信息
   * @returns 是否过期
   */
  private isVipExpired(user: User): boolean {
    if (!user.vipExpiredAt || user.vipLevel === 'FREE') {
      return false
    }

    return new Date() > user.vipExpiredAt
  }

  /**
   * 绑定新的身份到现有用户
   * @param userId 用户ID
   * @param provider 身份提供商
   * @param identifier 身份标识符
   * @param metadata 身份元数据
   * @returns 创建的身份信息
   */
  async bindIdentityToUser(
    userId: string,
    provider: string,
    identifier: string,
    metadata?: Record<string, any>
  ): Promise<UserIdentity> {
    try {
      // 检查用户是否存在
      const user = await this.getUserById(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 检查身份是否已被绑定
      const existingIdentity = await this.prisma.userIdentity.findUnique({
        where: {
          provider_identifier: {
            provider,
            identifier,
          },
        },
      })

      if (existingIdentity) {
        throw new Error('该身份已被其他用户绑定')
      }

      // 创建新的身份绑定
      return await this.prisma.userIdentity.create({
        data: {
          userId,
          provider,
          identifier,
          verified: true,
          metadata,
          boundAt: new Date(),
        },
      })
    } catch (error) {
      throw new Error(`绑定身份失败: ${error.message}`)
    }
  }

  /**
   * 解绑用户身份
   * @param userId 用户ID
   * @param provider 身份提供商
   * @param identifier 身份标识符
   * @returns 是否成功解绑
   */
  async unbindIdentity(
    userId: string,
    provider: string,
    identifier: string
  ): Promise<boolean> {
    try {
      const deleted = await this.prisma.userIdentity.deleteMany({
        where: {
          userId,
          provider,
          identifier,
        },
      })

      return deleted.count > 0
    } catch (error) {
      throw new Error(`解绑身份失败: ${error.message}`)
    }
  }

  /**
   * 获取用户的所有身份
   * @param userId 用户ID
   * @returns 身份列表
   */
  async getUserIdentities(userId: string): Promise<UserIdentity[]> {
    try {
      return await this.prisma.userIdentity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
    } catch (error) {
      throw new Error(`获取用户身份失败: ${error.message}`)
    }
  }
}

// 导出单例实例
export const userService = new UserService()