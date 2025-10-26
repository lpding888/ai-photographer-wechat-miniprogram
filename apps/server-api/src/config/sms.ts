/**
 * SMS短信服务配置
 */

export interface SmsConfig {
  /** 腾讯云Secret ID */
  secretId: string
  /** 腾讯云Secret Key */
  secretKey: string
  /** 腾讯云区域 */
  region: string
  /** 短信应用ID */
  sdkAppId: string
  /** 短信签名 */
  signName: string
  /** 验证码模板ID */
  templateCode: string
  /** Redis配置 */
  redis: {
    host: string
    port: number
    password?: string
    db?: number
  }
  /** 验证码配置 */
  codeConfig: {
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
}

/**
 * 获取SMS配置
 * @returns SMS配置
 */
export function getSmsConfig(): SmsConfig {
  const config: SmsConfig = {
    secretId: process.env.SMS_SECRET_ID || '',
    secretKey: process.env.SMS_SECRET_KEY || '',
    region: process.env.SMS_REGION || 'ap-beijing',
    sdkAppId: process.env.SMS_SDK_APPID || '',
    signName: process.env.SMS_SIGN_NAME || 'AI摄影师',
    templateCode: process.env.SMS_TEMPLATE_CODE || '',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    },
    codeConfig: {
      length: 6,
      expireMinutes: 5,
      resendInterval: 60,
      dailyLimit: 5,
      hourlyIpLimit: 10,
      maxAttempts: 3,
    },
  }

  // 验证必需的环境变量
  const requiredFields = ['secretId', 'secretKey', 'sdkAppId', 'signName', 'templateCode']
  const missingFields = requiredFields.filter(field => !config[field as keyof SmsConfig])

  if (missingFields.length > 0) {
    throw new Error(`SMS配置缺少必需字段: ${missingFields.join(', ')}`)
  }

  return config
}

/**
 * Redis Key生成器
 */
export class RedisKeyGenerator {
  /**
   * 验证码存储Key
   * @param phone 手机号
   * @returns Redis key
   */
  static codeKey(phone: string): string {
    return `sms:code:${phone}`
  }

  /**
   * 手机号频率限制Key（每日）
   * @param phone 手机号
   * @returns Redis key
   */
  static phoneDailyLimitKey(phone: string): string {
    const today = new Date().toISOString().split('T')[0]
    return `sms:rate:phone:${phone}:${today}`
  }

  /**
   * IP频率限制Key（每小时）
   * @param ip IP地址
   * @returns Redis key
   */
  static ipHourlyLimitKey(ip: string): string {
    const currentHour = new Date().toISOString().slice(0, 13) // YYYY-MM-DDTHH
    return `sms:rate:ip:${ip}:${currentHour}`
  }

  /**
   * 验证码尝试次数Key
   * @param phone 手机号
   * @returns Redis key
   */
  static attemptsKey(phone: string): string {
    return `sms:attempts:${phone}`
  }

  /**
   * 短信发送记录Key
   * @param phone 手机号
   * @returns Redis key
   */
  static sendRecordKey(phone: string): string {
    return `sms:record:${phone}`
  }
}

/**
 * 短信模板参数接口
 */
export interface SmsTemplateParams {
  /** 验证码 */
  code: string
  /** 有效期（分钟） */
  expireMinutes: number
}

/**
 * 发送短信结果接口
 */
export interface SendSmsResult {
  /** 是否成功 */
  success: boolean
  /** 短信ID */
  messageId?: string
  /** 错误信息 */
  error?: string
  /** 发送状态码 */
  statusCode?: string
  /** 发送状态消息 */
  statusMessage?: string
}

/**
 * 验证码验证结果接口
 */
export interface VerifyCodeResult {
  /** 是否验证成功 */
  success: boolean
  /** 是否已过期 */
  expired: boolean
  /** 是否尝试次数过多 */
  tooManyAttempts: boolean
  /** 错误信息 */
  error?: string
  /** 剩余尝试次数 */
  remainingAttempts?: number
}