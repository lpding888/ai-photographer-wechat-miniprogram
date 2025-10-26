/**
 * SCF服务 - 调用腾讯云SCF函数
 *
 * @author 老王
 * @version 3.0.0
 */

import { tencentcloud } from 'tencentcloud-sdk-nodejs'

// SCF客户端实例
let scfClient: tencentcloud.SCF | null = null

/**
 * 初始化SCF客户端
 */
function initSCFClient() {
  if (!scfClient) {
    scfClient = new tencentcloud.SCF({
      credential: {
        secretId: process.env.TENCENTCLOUD_SECRET_ID,
        secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
      },
      region: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
      profile: {
        httpProfile: {
          endpoint: 'scf.tencentcloudapi.com',
        },
      },
    })
  }
  return scfClient
}

/**
 * SCF服务类
 */
export class SCFService {
  private client = initSCFClient()

  /**
   * 调用AI图像处理器
   */
  async callImageProcessor(action: string, params: any) {
    try {
      console.log(`🖼️ 调用AI图像处理器: ${action}`)

      const response = await this.client!.Invoke({
        FunctionName: 'ai-image-processor',
        Payload: JSON.stringify({
          action,
          ...params
        }),
        InvocationType: 'RequestResponse',
        LogType: 'Tail'
      })

      if (response.Result) {
        const result = JSON.parse(response.Result as string)
        console.log(`✅ AI图像处理器响应:`, result)
        return result
      }

      throw new Error('SCF调用未返回结果')
    } catch (error) {
      console.error(`❌ AI图像处理器调用失败:`, error)
      throw error
    }
  }

  /**
   * 调用提示词生成器
   */
  async callPromptGenerator(params: {
    imageUrl: string
    clothingType?: string
    stylePreference?: string
    sceneType?: string
  }) {
    try {
      console.log(`🧠 调用提示词生成器`)

      const response = await this.client!.Invoke({
        FunctionName: 'prompt-generator',
        Payload: JSON.stringify(params),
        InvocationType: 'RequestResponse',
        LogType: 'Tail'
      })

      if (response.Result) {
        const result = JSON.parse(response.Result as string)
        console.log(`✅ 提示词生成器响应:`, result)
        return result
      }

      throw new Error('SCF调用未返回结果')
    } catch (error) {
      console.error(`❌ 提示词生成器调用失败:`, error)
      throw error
    }
  }

  /**
   * 调用图像生成器
   */
  async callImageGenerator(params: {
    prompt: string
    options?: {
      size?: string
      quality?: string
      n?: number
    }
    modelConfig?: {
      model?: string
      apiEndpoint?: string
    }
    generationMode?: string
    referenceWorkId?: string
  }) {
    try {
      console.log(`🎨 调用图像生成器`)

      const response = await this.client!.Invoke({
        FunctionName: 'image-generator',
        Payload: JSON.stringify(params),
        InvocationType: 'RequestResponse',
        LogType: 'Tail'
      })

      if (response.Result) {
        const result = JSON.parse(response.Result as string)
        console.log(`✅ 图像生成器响应:`, result)
        return result
      }

      throw new Error('SCF调用未返回结果')
    } catch (error) {
      console.error(`❌ 图像生成器调用失败:`, error)
      throw error
    }
  }

  /**
   * 异步调用SCF函数（用于长时间运行的任务）
   */
  async callAsync(functionName: string, params: any) {
    try {
      console.log(`🚀 异步调用SCF函数: ${functionName}`)

      const response = await this.client!.Invoke({
        FunctionName: functionName,
        Payload: JSON.stringify(params),
        InvocationType: 'Event', // 异步调用
        LogType: 'Tail'
      })

      console.log(`✅ 异步调用成功:`, response)
      return { success: true, requestId: response.RequestId }
    } catch (error) {
      console.error(`❌ 异步调用失败:`, error)
      throw error
    }
  }

  /**
   * 批量调用SCF函数
   */
  async callBatch(calls: Array<{
    functionName: 'ai-image-processor' | 'prompt-generator' | 'image-generator'
    params: any
    async?: boolean
  }>) {
    const results = await Promise.allSettled(
      calls.map(call => {
        if (call.functionName === 'ai-image-processor') {
          return this.callImageProcessor(call.params.action || 'compressImage', call.params)
        } else if (call.functionName === 'prompt-generator') {
          return this.callPromptGenerator(call.params)
        } else if (call.functionName === 'image-generator') {
          return this.callImageGenerator(call.params)
        }
        throw new Error(`未知的SCF函数: ${call.functionName}`)
      })
    )

    return results.map((result, index) => ({
      index,
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null,
      call: calls[index]
    }))
  }

  /**
   * 健康检查所有SCF函数
   */
  async healthCheck() {
    const functions = [
      { name: 'ai-image-processor', type: 'processor' },
      { name: 'prompt-generator', type: 'generator' },
      { name: 'image-generator', type: 'generator' }
    ]

    const results = await Promise.allSettled(
      functions.map(async (func) => {
        try {
          const response = await this.client!.Invoke({
            FunctionName: func.name,
            Payload: JSON.stringify({ action: 'health_check' }),
            InvocationType: 'RequestResponse'
          })

          if (response.Result) {
            const result = JSON.parse(response.Result as string)
            return {
              name: func.name,
              type: func.type,
              status: 'healthy',
              data: result
            }
          }

          throw new Error('健康检查响应为空')
        } catch (error) {
          return {
            name: func.name,
            type: func.type,
            status: 'unhealthy',
            error: error instanceof Error ? error.message : String(error)
          }
        }
      })
    )

    return {
      timestamp: new Date().toISOString(),
      architecture: 'tencent_cloud_scf',
      functions: results.map(result =>
        result.status === 'fulfilled' ? result.value : {
          name: 'unknown',
          type: 'unknown',
          status: 'error',
          error: result.reason
        }
      )
    }
  }
}

// 导出单例实例
export const scfService = new SCFService()
export default scfService