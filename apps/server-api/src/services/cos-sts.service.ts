import { CloudApiService } from '@ai-photographer/tencent-scf'
import crypto from 'crypto'

export interface CosStsCredentials {
  tmpSecretId: string
  tmpSecretKey: string
  sessionToken: string
  expiredTime: number
  bucket: string
  region: string
  key: string
}

export interface CosSignatureRequest {
  fileType: string
  fileName: string
  fileSize?: number
  directory?: string
}

export class CosStsService {
  private cloudApi: CloudApiService
  private cosConfig: {
    secretId: string
    secretKey: string
    bucket: string
    region: string
    domain?: string
  }

  constructor() {
    this.cloudApi = new CloudApiService()

    // 从环境变量获取COS配置
    this.cosConfig = {
      secretId: process.env.COS_SECRET_ID || '',
      secretKey: process.env.COS_SECRET_KEY || '',
      bucket: process.env.COS_BUCKET || '',
      region: process.env.COS_REGION || 'ap-guangzhou',
      domain: process.env.COS_DOMAIN
    }

    if (!this.cosConfig.secretId || !this.cosConfig.secretKey || !this.cosConfig.bucket) {
      throw new Error('COS配置不完整，请检查环境变量')
    }
  }

  /**
   * 生成COS STS临时密钥
   */
  async generateStsCredentials(request: CosSignatureRequest): Promise<CosStsCredentials> {
    const { fileType, fileName, fileSize, directory = 'ai-generation' } = request

    // 1. 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    if (!allowedTypes.includes(fileType.toLowerCase())) {
      throw new Error(`不支持的文件类型: ${fileType}`)
    }

    // 2. 验证文件大小（可选）
    if (fileSize && fileSize > 10 * 1024 * 1024) { // 10MB限制
      throw new Error('文件大小不能超过10MB')
    }

    // 3. 生成文件路径
    const fileExtension = fileName.split('.').pop() || 'jpg'
    const timestamp = Date.now()
    const randomString = crypto.randomBytes(4).toString('hex')
    const key = `${directory}/${timestamp}_${randomString}.${fileExtension}`

    // 4. 构造权限策略
    const policy = this.buildPolicy(key)

    try {
      // 5. 调用STS API获取临时密钥
      const stsResponse = await this.requestStsToken(policy)

      const credentials: CosStsCredentials = {
        tmpSecretId: stsResponse.credentials.tmpSecretId,
        tmpSecretKey: stsResponse.credentials.tmpSecretKey,
        sessionToken: stsResponse.credentials.sessionToken,
        expiredTime: stsResponse.expiredTime,
        bucket: this.cosConfig.bucket,
        region: this.cosConfig.region,
        key
      }

      console.log(`✅ 生成COS STS凭证成功: ${key}`)
      return credentials

    } catch (error) {
      console.error('❌ 生成COS STS凭证失败:', error)
      throw new Error('生成上传凭证失败，请稍后重试')
    }
  }

  /**
   * 构造COS权限策略
   */
  private buildPolicy(key: string): string {
    const policy = {
      version: '2.0',
      statement: [
        {
          effect: 'allow',
          action: [
            // 允许上传文件
            'name/cos:PutObject',
            // 允许分片上传相关操作
            'name/cos:InitiateMultipartUpload',
            'name/cos:UploadPart',
            'name/cos:CompleteMultipartUpload',
            'name/cos:AbortMultipartUpload',
            // 允许获取文件信息
            'name/cos:HeadObject',
            // 允许删除文件（用于清理临时文件）
            'name/cos:DeleteObject'
          ],
          resource: [
            // 只允许访问指定bucket的指定目录
            `qcs::cos:${this.cosConfig.region}:uid/*:${this.cosConfig.bucket}/ai-generation/*`,
            `qcs::cos:${this.cosConfig.region}:uid/*:${this.cosConfig.bucket}/${key}`
          ]
        }
      ]
    }

    return JSON.stringify(policy)
  }

  /**
   * 请求STS临时密钥
   */
  private async requestStsToken(policy: string): Promise<any> {
    // 这里需要调用腾讯云STS API
    // 由于我们使用的是tencentcloud-sdk，这里提供模拟实现
    // 实际使用时需要安装和配置 @tencentcloud/sts-sdk

    const stsUrl = 'https://sts.tencentcloudapi.com/'

    // 构造请求参数
    const params = {
      Action: 'GetFederationToken',
      Version: '2018-08-13',
      Name: 'cos-upload-token',
      Policy: policy,
      DurationSeconds: 1800, // 30分钟有效期
      Region: this.cosConfig.region
    }

    // 简化的STS调用实现
    // 在实际项目中，应该使用官方SDK
    const mockResponse = {
      credentials: {
        tmpSecretId: this.cosConfig.secretId, // 实际应该是临时密钥
        tmpSecretKey: this.cosConfig.secretKey, // 实际应该是临时密钥
        sessionToken: 'mock-session-token'
      },
      expiredTime: Math.floor(Date.now() / 1000) + 1800
    }

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 100))

    return mockResponse
  }

  /**
   * 生成COS上传签名（备用方案）
   */
  generateCosSignature(key: string, method: 'PUT' | 'POST' = 'PUT', expiresIn: number = 1800): string {
    const expiredTime = Math.floor(Date.now() / 1000) + expiresIn
    const signKeyTime = `${Math.floor(Date.now() / 1000)};${expiredTime}`

    // 构造签名密钥
    const secretKey = this.cosConfig.secretKey
    const httpString = `${method}\n/\n\n\nhost=${this.cosConfig.bucket}.cos.${this.cosConfig.region}.myqcloud.com`
    const stringToSign = `sha256\n${signKeyTime}\n${crypto.createHash('sha256').update(httpString).digest('hex')}\n`

    const signKey = crypto.createHmac('sha256', secretKey).update(signKeyTime).digest('hex')
    const signature = crypto.createHmac('sha256', signKey).update(stringToSign).digest('hex')

    // 构造最终签名
    const authorization = [
      `q-sign-algorithm=sha256`,
      `q-ak=${this.cosConfig.secretId}`,
      `q-sign-time=${signKeyTime}`,
      `q-key-time=${signKeyTime}`,
      `q-header-list=host`,
      `q-url-param-list=`,
      `q-signature=${signature}`
    ].join('&')

    return authorization
  }

  /**
   * 验证COS文件是否存在
   */
  async validateFileExists(key: string): Promise<boolean> {
    // 这里应该调用COS HeadObject API
    // 简化实现，返回true
    return true
  }

  /**
   * 获取COS文件访问URL
   */
  getFileUrl(key: string, expiresIn: number = 3600): string {
    const domain = this.cosConfig.domain || `${this.cosConfig.bucket}.cos.${this.cosConfig.region}.myqcloud.com`
    return `https://${domain}/${key}`
  }

  /**
   * 生成预签名URL（用于私有bucket的文件访问）
   */
  generatePresignedUrl(key: string, expiresIn: number = 3600): string {
    const domain = this.cosConfig.domain || `${this.cosConfig.bucket}.cos.${this.cosConfig.region}.myqcloud.com`
    const expiredTime = Math.floor(Date.now() / 1000) + expiresIn

    // 构造查询参数
    const params = new URLSearchParams({
      'q-sign-algorithm': 'sha256',
      'q-ak': this.cosConfig.secretId,
      'q-sign-time': `${Math.floor(Date.now() / 1000)};${expiredTime}`,
      'q-key-time': `${Math.floor(Date.now() / 1000)};${expiredTime}`,
      'q-header-list': 'host',
      'q-url-param-list': '',
      'q-signature': this.generateCosSignature(key, 'GET', expiresIn)
    })

    return `https://${domain}/${key}?${params.toString()}`
  }
}