import { AuthPluginOptions } from '../plugins/auth'

/**
 * 认证插件配置
 */
export const authConfig: AuthPluginOptions = {
  // 默认认证配置
  default: {
    required: false, // 默认不强制要求认证
    excludeRoutes: [
      '/health',                    // 健康检查
      '/api/v1/health',              // API健康检查
      '/docs',                      // API文档
      '/api/v1/info',                 // V1版本信息
      '/api/v1/auth/phone/send-code', // 发送验证码（无需认证）
      '/api/v1/auth/wechat/login',      // 微信登录（可选认证）
      '/api/v1/auth/jwt/login',         // JWT登录
      '/api/v1/auth/refresh',          // 刷新Token（可选认证）
      '/api/v1/test/*',                // 测试路由
    ]
  },

  // JWT认证配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: '7d',
    issuer: 'ai-photographer-api',
    audience: 'ai-photographer-clients',
  },

  // 微信认证配置
  wechat: {
    appId: process.env.WECHAT_OPEN_APP_ID || 'your-wechat-open-app-id',
    appSecret: process.env.WECHAT_OPEN_SECRET || 'your-wechat-open-secret',
    apiUrl: 'https://api.weixin.qq.com'
  },

  // 手机号认证配置
  phone: {
    verificationCode: {
      length: 6,
      expireMinutes: 5,
      resendInterval: 60,
      dailyLimit: 5,
      hourlyIpLimit: 10,
      maxAttempts: 3,
    },
    phoneRegex: /^1[3-9]\d{9}$/,
  },

  // API Key认证配置
  apiKey: {
    headerName: 'x-api-key',
    queryParam: 'apiKey',
    keys: [
      // 内部服务API Key
      {
        key: process.env.INTERNAL_API_KEY || 'internal-service-key-12345',
        userId: 'internal_service',
        permissions: [
          'read:profile',
          'write:profile',
          'manage:works',
          'view:statistics'
        ],
        active: true,
        description: '内部服务调用API Key'
      },
      // 管理员API Key
      {
        key: process.env.ADMIN_API_KEY || 'admin-key-67890',
        userId: 'admin_user',
        permissions: [
          'manage:users',
          'manage:works',
          'manage:system',
          'view:statistics'
        ],
        active: true,
        description: '管理员操作API Key'
      }
    ]
  },

  // 路由级认证配置
  routes: {
    // 管理员路由需要强制认证和管理员权限
    '/api/v1/admin/*': {
      required: true,
      errorMessage: '需要管理员权限才能访问'
    },

    // VIP功能路由需要VIP权限
    '/api/v1/vip/*': {
      required: true,
      errorMessage: '需要VIP权限才能访问'
    },

    // 用户相关路由需要认证
    '/api/v1/user/*': {
      required: true,
      errorMessage: '需要登录才能访问'
    },

    // 作品相关路由需要认证
    '/api/v1/works/*': {
      required: true,
      errorMessage: '需要登录才能访问作品功能'
    }
  }
}

/**
 * 获取认证配置
 * @returns 认证配置
 */
export function getAuthConfig(): AuthPluginOptions {
  // 在生产环境中，确保所有必需的环境变量都已设置
  if (process.env.NODE_ENV === 'production') {
    const requiredEnvVars = [
      'JWT_SECRET',
      'WECHAT_OPEN_APP_ID',
      'WECHAT_OPEN_SECRET',
      'SMS_SECRET_ID',
      'SMS_SECRET_KEY',
      'SMS_SDK_APPID',
      'SMS_SIGN_NAME',
      'SMS_TEMPLATE_CODE'
    ]

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

    if (missingVars.length > 0) {
      throw new Error(`生产环境缺少必需的环境变量: ${missingVars.join(', ')}`)
    }
  }

  return authConfig
}