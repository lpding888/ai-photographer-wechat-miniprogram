import { FastifyInstance } from 'fastify'
import { TencentScfClient, createDefaultRetryOptions, ScfErrorCode } from '@ai-photographer/tencent-scf'

/**
 * 云函数调用服务
 */
export class CloudFunctionService {
  private client: TencentScfClient
  private logger: any

  constructor() {
    // 初始化腾讯云SCF客户端
    this.client = new TencentScfClient({
      SecretId: process.env.TENCENT_SECRET_ID!,
      SecretKey: process.env.TENCENT_SECRET_KEY!,
      Region: process.env.TENCENT_REGION || 'ap-beijing',
      timeout: parseInt(process.env.SCF_TIMEOUT || '30000'), // 30秒
      enableRequestLog: process.env.NODE_ENV !== 'production'
    })

    // 创建日志记录器
    this.logger = {
      info: (msg: string, obj?: any) => console.log(`[CloudFunctionService] ${msg}`, obj || ''),
      debug: (msg: string, obj?: any) => console.debug(`[CloudFunctionService] ${msg}`, obj || ''),
      warn: (msg: string, obj?: any) => console.warn(`[CloudFunctionService] ${msg}`, obj || ''),
      error: (msg: string, obj?: any) => console.error(`[CloudFunctionService] ${msg}`, obj || '')
    }
  }

  /**
   * 分析场景
   * @param sceneData 场景数据
   * @returns Promise<any>
   */
  async analyzeScene(sceneData: any): Promise<any> {
    const startTime = Date.now()

    try {
      this.logger.info('开始调用场景分析云函数', {
        function: 'analyze-scene',
        sceneId: sceneData.sceneId
      })

      const result = await this.client.invokeFunctionSync(
        'analyze-scene',
        {
          action: 'analyze',
          sceneData,
          timestamp: Date.now(),
          requestId: this.generateRequestId()
        },
        {
          timeout: 30000,
          retry: createDefaultRetryOptions(2, 1000),
          onProgress: (progress, message) => {
            this.logger.debug('场景分析进度', { progress, message })
          }
        }
      )

      this.logger.info('场景分析完成', {
        duration: Date.now() - startTime,
        result: result.success
      })

      return result
    } catch (error) {
      this.logger.error('场景分析失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 处理图像
   * @param imageData 图像数据
   * @param options 处理选项
   * @returns Promise<any>
   */
  async processImage(imageData: any, options: any = {}): Promise<any> {
    const startTime = Date.now()

    try {
      this.logger.info('开始调用图像处理云函数', {
        function: 'process-image',
        imageId: imageData.imageId,
        operation: options.operation
      })

      const result = await this.client.invokeFunctionSync(
        'process-image',
        {
          action: 'process',
          imageData,
          options,
          timestamp: Date.now(),
          requestId: this.generateRequestId()
        },
        {
          timeout: options.timeout || 60000, // 默认60秒
          retry: createDefaultRetryOptions(3, 2000),
          onProgress: (progress, message) => {
            this.logger.debug('图像处理进度', { progress, message })
          }
        }
      )

      this.logger.info('图像处理完成', {
        duration: Date.now() - startTime,
        result: result.success,
        operation: options.operation
      })

      return result
    } catch (error) {
      this.logger.error('图像处理失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        operation: options.operation
      })
      throw error
    }
  }

  /**
   * 生成AI摄影作品
   * @param params 生成参数
   * @returns Promise<any>
   */
  async generatePhotography(params: any): Promise<any> {
    const startTime = Date.now()

    try {
      this.logger.info('开始调用AI摄影生成云函数', {
        function: 'photography-generate',
        taskId: params.taskId
      })

      const result = await this.client.invokeFunctionAsync(
        'photography-generate',
        {
          action: 'generate',
          params,
          timestamp: Date.now(),
          requestId: this.generateRequestId()
        },
        {
          timeout: 10000, // 异步调用，超时时间较短
          retry: createDefaultRetryOptions(1, 500),
          onProgress: (progress, message) => {
            this.logger.debug('AI摄影生成进度', { progress, message })
          }
        }
      )

      this.logger.info('AI摄影生成任务已提交', {
        duration: Date.now() - startTime,
        taskId: params.taskId
      })

      return result
    } catch (error) {
      this.logger.error('AI摄影生成失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        taskId: params.taskId
      })
      throw error
    }
  }

  /**
   * 生成虚拟试衣作品
   * @param params 生成参数
   * @returns Promise<any>
   */
  async generateFitting(params: any): Promise<any> {
    const startTime = Date.now()

    try {
      this.logger.info('开始调用虚拟试衣生成云函数', {
        function: 'fitting-generate',
        taskId: params.taskId
      })

      const result = await this.client.invokeFunctionAsync(
        'fitting-generate',
        {
          action: 'generate',
          params,
          timestamp: Date.now(),
          requestId: this.generateRequestId()
        },
        {
          timeout: 10000,
          retry: createDefaultRetryOptions(1, 500),
          onProgress: (progress, message) => {
            this.logger.debug('虚拟试衣生成进度', { progress, message })
          }
        }
      )

      this.logger.info('虚拟试衣生成任务已提交', {
        duration: Date.now() - startTime,
        taskId: params.taskId
      })

      return result
    } catch (error) {
      this.logger.error('虚拟试衣生成失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        taskId: params.taskId
      })
      throw error
    }
  }

  /**
   * 姿势裂变生成
   * @param params 裂变参数
   * @returns Promise<any>
   */
  async generatePoseVariation(params: any): Promise<any> {
    const startTime = Date.now()

    try {
      this.logger.info('开始调用姿势裂变云函数', {
        function: 'pose-variation',
        taskId: params.taskId
      })

      const result = await this.client.invokeFunctionAsync(
        'pose-variation',
        {
          action: 'generate',
          params,
          timestamp: Date.now(),
          requestId: this.generateRequestId()
        },
        {
          timeout: 10000,
          retry: createDefaultRetryOptions(1, 500),
          onProgress: (progress, message) => {
            this.logger.debug('姿势裂变进度', { progress, message })
          }
        }
      )

      this.logger.info('姿势裂变任务已提交', {
        duration: Date.now() - startTime,
        taskId: params.taskId
      })

      return result
    } catch (error) {
      this.logger.error('姿势裂变失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        taskId: params.taskId
      })
      throw error
    }
  }

  /**
   * 获取函数调用统计
   * @returns Promise<any>
   */
  async getInvokeStats(): Promise<any> {
    try {
      const stats = this.client.getStats()

      // 添加额外的监控信息
      const monitoringData = {
        ...stats,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }

      this.logger.info('获取调用统计', monitoringData)
      return monitoringData
    } catch (error) {
      this.logger.error('获取调用统计失败', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * 重置调用统计
   */
  async resetStats(): Promise<void> {
    try {
      this.client.resetStats()
      this.logger.info('调用统计已重置')
    } catch (error) {
      this.logger.error('重置调用统计失败', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * 健康检查
   * @returns Promise<boolean>
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 尝试调用一个简单的健康检查函数
      await this.client.invokeFunctionSync(
        'health-check',
        { action: 'ping', timestamp: Date.now() },
        {
          timeout: 5000,
          retry: createDefaultRetryOptions(1, 1000)
        }
      )

      this.logger.info('云函数服务健康检查通过')
      return true
    } catch (error) {
      this.logger.error('云函数服务健康检查失败', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * 测试连接
   * @returns Promise<boolean>
   */
  async testConnection(): Promise<boolean> {
    try {
      // 测试基本连接，不调用实际函数
      this.logger.info('测试云函数连接配置')

      const hasCredentials = !!(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY)

      if (!hasCredentials) {
        this.logger.error('云函数连接配置失败：缺少认证信息')
        return false
      }

      this.logger.info('云函数连接配置正常')
      return true
    } catch (error) {
      this.logger.error('云函数连接测试失败', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * 生成请求ID
   * @returns string
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }
}

// 创建服务实例
export const cloudFunctionService = new CloudFunctionService()

// 注册插件
export async function registerCloudFunctionPlugin(fastify: FastifyInstance) {
  fastify.decorate('cloudFunction', cloudFunctionService)

  // 健康检查路由
  fastify.get('/health/cloud-function', async (request, reply) => {
    try {
      const isHealthy = await cloudFunctionService.healthCheck()
      return {
        success: true,
        data: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      reply.code(500)
      return {
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: error instanceof Error ? error.message : '健康检查失败'
        }
      }
    }
  })

  // 统计信息路由
  fastify.get('/cloud-function/stats', async (request, reply) => {
    try {
      const stats = await cloudFunctionService.getInvokeStats()
      return {
        success: true,
        data: stats
      }
    } catch (error) {
      reply.code(500)
      return {
        success: false,
        error: {
          code: 'GET_STATS_FAILED',
          message: error instanceof Error ? error.message : '获取统计失败'
        }
      }
    }
  })

  fastify.log.info('云函数插件注册完成')
}