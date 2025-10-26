import { FastifyRequest } from 'fastify'

/**
 * 平台枚举
 */
export enum Platform {
  MINIAPP = 'MINIAPP',    // 微信小程序
  WEB = 'WEB',            // Web端
  APP = 'APP',            // 移动APP
  ADMIN = 'ADMIN',        // 管理后台
}

/**
 * 身份提供商枚举
 */
export enum IdentityProvider {
  WECHAT = 'wechat',      // 微信
  PHONE = 'phone',        // 手机号
  EMAIL = 'email',        // 邮箱
  API_KEY = 'api_key',    // API密钥
}

/**
 * 用户角色枚举
 */
export enum UserRole {
  USER = 'USER',          // 普通用户
  VIP = 'VIP',            // VIP用户
  ADMIN = 'ADMIN',        // 管理员
  SUPER_ADMIN = 'SUPER_ADMIN', // 超级管理员
}

/**
 * 权限枚举
 */
export enum Permission {
  // 用户相关权限
  READ_PROFILE = 'read:profile',
  UPDATE_PROFILE = 'update:profile',

  // 作品相关权限
  CREATE_WORK = 'create:work',
  READ_WORK = 'read:work',
  UPDATE_WORK = 'update:work',
  DELETE_WORK = 'delete:work',

  // VIP相关权限
  UPGRADE_VIP = 'upgrade:vip',
  USE_VIP_FEATURES = 'use:vip_features',

  // 管理员权限
  MANAGE_USERS = 'manage:users',
  MANAGE_WORKS = 'manage:works',
  MANAGE_SYSTEM = 'manage:system',
  VIEW_STATISTICS = 'view:statistics',
}

/**
 * 用户上下文接口
 */
export interface UserContext {
  /** 用户ID */
  userId: string
  /** 微信OpenID（可选） */
  openid?: string
  /** 平台类型 */
  platform: Platform
  /** 用户角色列表 */
  roles: UserRole[]
  /** 用户权限列表 */
  permissions: Permission[]
  /** VIP等级 */
  vipLevel?: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE'
  /** VIP是否过期 */
  isVipExpired?: boolean
  /** 扩展元数据 */
  metadata?: Record<string, any>
}

/**
 * 认证策略接口
 */
export interface IAuthStrategy {
  /** 策略名称 */
  readonly name: string

  /** 检查是否支持处理当前请求 */
  supports(request: FastifyRequest): boolean

  /** 执行认证逻辑 */
  authenticate(request: FastifyRequest): Promise<UserContext | null>
}

/**
 * 认证配置接口
 */
export interface AuthConfig {
  /** 认证策略列表（按优先级排序） */
  strategies: IAuthStrategy[]
  /** 是否必须认证 */
  required: boolean
  /** 自定义错误消息 */
  errorMessage?: string
  /** 排除的路由 */
  excludeRoutes?: string[]
}

/**
 * 认证选项接口
 */
export interface AuthOptions {
  /** 默认认证配置 */
  default?: AuthConfig
  /** 路由级认证配置 */
  routes?: Record<string, AuthConfig>
}

/**
 * JWT Payload 接口
 */
export interface JwtPayload {
  /** 用户ID */
  sub: string
  /** 用户OpenID */
  openid?: string
  /** 平台类型 */
  platform: Platform
  /** 用户角色 */
  roles: UserRole[]
  /** 权限列表 */
  permissions: Permission[]
  /** VIP等级 */
  vipLevel?: string
  /** VIP过期时间 */
  vipExpiredAt?: number
  /** 签发时间 */
  iat?: number
  /** 过期时间 */
  exp?: number
  /** JWT ID */
  jti?: string
}

/**
 * 微信认证配置接口
 */
export interface WechatAuthConfig {
  /** 微信AppID */
  appId: string
  /** 微信AppSecret */
  appSecret: string
  /** 微信API端点 */
  apiUrl?: string
}

/**
 * 手机号认证配置接口
 */
export interface PhoneAuthConfig {
  /** 验证码配置 */
  verificationCode: {
    /** 验证码长度 */
    length: number
    /** 验证码有效期（分钟） */
    expireMinutes: number
    /** 重发间隔（秒） */
    resendInterval: number
    /** 每日最大发送次数 */
    dailyLimit: number
    /** 每小时最大发送次数（按IP） */
    hourlyIpLimit: number
    /** 最大错误尝试次数 */
    maxAttempts: number
  }
  /** 手机号格式验证正则 */
  phoneRegex: RegExp
}

/**
 * API Key配置接口
 */
export interface ApiKeyConfig {
  /** API Key列表 */
  keys: Array<{
    /** Key值 */
    key: string
    /** 关联的用户ID */
    userId: string
    /** 权限列表 */
    permissions: Permission[]
    /** 是否启用 */
    active: boolean
    /** 描述 */
    description?: string
  }>
  /** 请求头名称 */
  headerName?: string
  /** 查询参数名称 */
  queryParam?: string
}

/**
 * 认证错误类型
 */
export enum AuthErrorType {
  MISSING_TOKEN = 'MISSING_TOKEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  STRATEGY_NOT_SUPPORTED = 'STRATEGY_NOT_SUPPORTED',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}

/**
 * 认证错误接口
 */
export interface AuthError extends Error {
  type: AuthErrorType
  statusCode: number
}

/**
 * 扩展FastifyRequest接口
 */
declare module 'fastify' {
  export interface FastifyRequest {
    /** 当前认证用户 */
    user?: UserContext
    /** 认证配置 */
    authConfig?: AuthConfig
  }
}