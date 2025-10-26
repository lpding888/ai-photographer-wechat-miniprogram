import Redis from 'ioredis'
import { FastifyRequest } from 'fastify'
import TencentCloud from 'tencentcloud-sdk-nodejs'
import {
  getSmsConfig,
  RedisKeyGenerator,
  SmsTemplateParams,
  SendSmsResult,
  VerifyCodeResult
} from '../config/sms'

/**
 * SMS短信服务类
 * 提供验证码发送、验证、频率限制等功能
 */
export class SmsService {
  private config = getSmsConfig()
  private redis: Redis
  private smsClient: any

  constructor() {
    // 初始化Redis客户端
    this.redis = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    })

    // 初始化腾讯云SMS客户端
    const SmsClient = TencentCloud.sms.v20210111.Client
    this.smsClient = new SmsClient({
      credential: {
        secretId: this.config.secretId,
        secretKey: this.config.secretKey,
      },
      region: this.config.region,
      profile: {
        httpProfile: {
          reqMethod: 'POST',
          reqTimeout: 30,
          endpoint: 'sms.tencentcloudapi.com',
        },
      },
    })
  }

  /**
   * 生成随机验证码
   * @param length 验证码长度
   * @returns 验证码字符串
   */
  private generateCode(length: number): string {
    const chars = '0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * 发送验证码短信
   * @param phone 手机号
   * @param request Fastify请求对象（用于获取IP）
   * @returns 发送结果
   */
  async sendVerificationCode(phone: string, request: FastifyRequest): Promise<SendSmsResult> {
    try {
      // 验证手机号格式
      if (!this.isValidPhoneNumber(phone)) {
        return {
          success: false,
          error: '手机号格式不正确',
        }
      }

      const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown'

      // 检查频率限制
      const rateCheckResult = await this.checkRateLimit(phone, ip)
      if (!rateCheckResult.success) {
        return rateCheckResult
      }

      // 生成验证码
      const code = this.generateCode(this.config.codeConfig.length)

      // 存储验证码到Redis
      await this.storeVerificationCode(phone, code)

      // 发送短信
      const smsResult = await this.sendSms(phone, code)

      if (smsResult.success) {
        // 记录发送成功
        await this.recordSendSuccess(phone, ip)
        console.log(`[SMS] 验证码发送成功: ${phone}, IP: ${ip}`)
      }

      return smsResult
    } catch (error) {
      console.error('[SMS] 发送验证码失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '发送验证码失败',
      }
    }
  }

  /**
   * 验证验证码
   * @param phone 手机号
   * @param code 用户输入的验证码
   * @returns 验证结果
   */
  async verifyCode(phone: string, code: string): Promise<VerifyCodeResult> {
    try {
      // 验证手机号格式
      if (!this.isValidPhoneNumber(phone)) {
        return {
          success: false,
          error: '手机号格式不正确',
        }
      }

      // 验证验证码格式
      if (!code || code.length !== this.config.codeConfig.length) {
        return {
          success: false,
          error: '验证码格式不正确',
        }
      }

      const codeKey = RedisKeyGenerator.codeKey(phone)
      const attemptsKey = RedisKeyGenerator.attemptsKey(phone)

      // 检查尝试次数
      const attempts = await this.redis.incr(attemptsKey)
      if (attempts > this.config.codeConfig.maxAttempts) {
        await this.redis.expire(attemptsKey, this.config.codeConfig.expireMinutes * 60)
        return {
          success: false,
          tooManyAttempts: true,
          error: '验证码错误次数过多，请重新获取',
          remainingAttempts: 0,
        }
      }

      // 获取存储的验证码
      const storedData = await this.redis.get(codeKey)
      if (!storedData) {
        return {
          success: false,
          error: '验证码不存在或已过期',
          remainingAttempts: this.config.codeConfig.maxAttempts - attempts,
        }
      }

      const { code: storedCode, timestamp } = JSON.parse(storedData)

      // 检查是否过期
      const now = Date.now()
      const expireTime = timestamp + (this.config.codeConfig.expireMinutes * 60 * 1000)
      if (now > expireTime) {
        await this.redis.del(codeKey)
        await this.redis.del(attemptsKey)
        return {
          success: false,
          expired: true,
          error: '验证码已过期',
          remainingAttempts: this.config.codeConfig.maxAttempts - attempts,
        }
      }

      // 验证码是否正确
      if (storedCode !== code) {
        const remainingAttempts = this.config.codeConfig.maxAttempts - attempts
        return {
          success: false,
          error: '验证码错误',
          remainingAttempts,
        }
      }

      // 验证成功，删除验证码和尝试记录
      await this.redis.del(codeKey)
      await this.redis.del(attemptsKey)

      console.log(`[SMS] 验证码验证成功: ${phone}`)
      return {
        success: true,
        expired: false,
        tooManyAttempts: false,
      }
    } catch (error) {
      console.error('[SMS] 验证验证码失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '验证验证码失败',
      }
    }
  }

  /**
   * 检查频率限制
   * @param phone 手机号
   * @param ip IP地址
   * @returns 检查结果
   */
  private async checkRateLimit(phone: string, ip: string): Promise<SendSmsResult> {
    // 检查60秒重发限制
    const codeKey = RedisKeyGenerator.codeKey(phone)
    const existingCode = await this.redis.get(codeKey)
    if (existingCode) {
      const { timestamp } = JSON.parse(existingCode)
      const timeDiff = Date.now() - timestamp
      if (timeDiff < this.config.codeConfig.resendInterval * 1000) {
        const remainingTime = Math.ceil(
          (this.config.codeConfig.resendInterval * 1000 - timeDiff) / 1000
        )
        return {
          success: false,
          error: `请等待${remainingTime}秒后重新发送`,
        }
      }
    }

    // 检查每日发送限制
    const phoneDailyKey = RedisKeyGenerator.phoneDailyLimitKey(phone)
    const dailyCount = await this.redis.incr(phoneDailyKey)
    await this.redis.expire(phoneDailyKey, 24 * 60 * 60) // 24小时过期
    if (dailyCount > this.config.codeConfig.dailyLimit) {
      return {
        success: false,
        error: '今日发送次数已达上限',
      }
    }

    // 检查IP每小时限制
    const ipHourlyKey = RedisKeyGenerator.ipHourlyLimitKey(ip)
    const hourlyCount = await this.redis.incr(ipHourlyKey)
    await this.redis.expire(ipHourlyKey, 60 * 60) // 1小时过期
    if (hourlyCount > this.config.codeConfig.hourlyIpLimit) {
      return {
        success: false,
        error: '该IP发送频率过高，请稍后再试',
      }
    }

    return { success: true }
  }

  /**
   * 存储验证码到Redis
   * @param phone 手机号
   * @param code 验证码
   */
  private async storeVerificationCode(phone: string, code: string): Promise<void> {
    const codeKey = RedisKeyGenerator.codeKey(phone)
    const data = {
      code,
      timestamp: Date.now(),
    }

    await this.redis.setex(
      codeKey,
      this.config.codeConfig.expireMinutes * 60,
      JSON.stringify(data)
    )
  }

  /**
   * 发送短信
   * @param phone 手机号
   * @param code 验证码
   * @returns 发送结果
   */
  private async sendSms(phone: string, code: string): Promise<SendSmsResult> {
    return new Promise((resolve) => {
      const params = {
        PhoneNumberSet: [`+86${phone}`],
        SmsSdkAppId: this.config.sdkAppId,
        SignName: this.config.signName,
        TemplateId: this.config.templateCode,
        TemplateParamSet: [code, this.config.codeConfig.expireMinutes.toString()],
      }

      this.smsClient.SendSms(params, (err: any, response: any) => {
        if (err) {
          console.error('[SMS] 腾讯云API调用失败:', err)
          resolve({
            success: false,
            error: err.message || '短信发送失败',
          })
          return
        }

        if (response.SendStatusSet && response.SendStatusSet.length > 0) {
          const status = response.SendStatusSet[0]
          if (status.Code === 'Ok') {
            resolve({
              success: true,
              messageId: status.SerialNo,
              statusCode: status.Code,
              statusMessage: status.Message,
            })
          } else {
            resolve({
              success: false,
              error: status.Message || '短信发送失败',
              statusCode: status.Code,
              statusMessage: status.Message,
            })
          }
        } else {
          resolve({
            success: false,
            error: '短信发送失败：无响应数据',
          })
        }
      })
    })
  }

  /**
   * 记录发送成功
   * @param phone 手机号
   * @param ip IP地址
   */
  private async recordSendSuccess(phone: string, ip: string): Promise<void> {
    const recordKey = RedisKeyGenerator.sendRecordKey(phone)
    const record = {
      phone,
      ip,
      timestamp: Date.now(),
    }

    await this.redis.setex(recordKey, this.config.codeConfig.expireMinutes * 60, JSON.stringify(record))
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
   * 清理过期数据
   * 定期清理Redis中的过期数据
   */
  async cleanupExpiredData(): Promise<void> {
    try {
      // 这里可以添加清理逻辑，比如清理过期的验证码记录等
      console.log('[SMS] 清理过期数据完成')
    } catch (error) {
      console.error('[SMS] 清理过期数据失败:', error)
    }
  }

  /**
   * 获取Redis统计信息
   * @returns 统计信息
   */
  async getStats(): Promise<any> {
    try {
      const info = await this.redis.info('memory')
      return {
        redisInfo: info,
        connected: this.redis.status === 'ready',
      }
    } catch (error) {
      console.error('[SMS] 获取统计信息失败:', error)
      return {
        error: error instanceof Error ? error.message : '获取统计信息失败',
      }
    }
  }

  /**
   * 关闭Redis连接
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit()
    }
  }
}

// 导出单例实例
export const smsService = new SmsService()