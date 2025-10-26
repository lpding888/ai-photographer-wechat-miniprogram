import { scf } from 'tencentcloud-sdk-nodejs-scf'
import {
  ScfClientOptions,
  InvokeFunctionParams,
  InvokeFunctionResponse,
  InvokeOptions,
  ScfError,
  ScfErrorCode,
  InvokeStats,
  RetryOptions
} from './types'

/**
 * 腾讯云SCF客户端包装器
 */
export class TencentScfClient {
  private client: any
  private logger: any
  private stats: InvokeStats
  private options: Required<ScfClientOptions>

  constructor(options: ScfClientOptions) {
    this.options = {
      Region: 'ap-beijing',
      timeout: 30000,
      enableRequestLog: true,
      headers: {},
      ...options
    }

    // 创建SCF客户端
    const Client = scf.v20180416.Client
    this.client = new Client({
      credential: {
        secretId: this.options.SecretId,
        secretKey: this.options.SecretKey
      },
      region: this.options.Region,
      profile: {
        httpProfile: {
          reqMethod: 'POST',
          protocol: 'https',
          headers: this.options.headers
        }
      }
    })

    // 创建简单的日志记录器
    this.logger = {
      info: (msg: string, obj?: any) => console.log(`[SCF] ${msg}`, obj || ''),
      debug: (msg: string, obj?: any) => console.debug(`[SCF] ${msg}`, obj || ''),
      warn: (msg: string, obj?: any) => console.warn(`[SCF] ${msg}`, obj || ''),
      error: (msg: string, obj?: any) => console.error(`[SCF] ${msg}`, obj || '')
    }

    // 初始化统计信息
    this.stats = {
      invokeCount: 0,
      successCount: 0,
      failureCount: 0,
      avgDuration: 0,
      totalDuration: 0,
      errorStats: {} as Record<ScfErrorCode, number>
    }
  }

  /**
   * 调用云函数
   * @param params 调用参数
   * @param options 调用选项
   * @returns Promise<InvokeFunctionResponse>
   */
  async invokeFunction(
    params: InvokeFunctionParams,
    options: InvokeOptions = {}
  ): Promise<InvokeFunctionResponse> {
    const startTime = Date.now()
    const invokeOptions: Required<InvokeOptions> = {
      timeout: this.options.timeout,
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffStrategy: 'exponential',
        jitterFactor: 0.1,
        retryableErrors: [
          ScfErrorCode.NETWORK_ERROR,
          ScfErrorCode.TIMEOUT_ERROR,
          ScfErrorCode.THROTTLED
        ]
      },
      onProgress: () => {},
      requestId: this.generateRequestId(),
      enableDetailLog: false,
      ...options
    }

    // 处理Payload参数
    const processedParams = this.processParams(params)

    if (invokeOptions.enableDetailLog) {
      this.logger.debug('准备调用云函数', {
        function: processedParams.FunctionName,
        namespace: processedParams.Namespace,
        requestId: invokeOptions.requestId,
        payloadSize: processedParams.Payload ?
          (typeof processedParams.Payload === 'string' ? processedParams.Payload.length :
           Buffer.byteLength(JSON.stringify(processedParams.Payload))) : 0
      })
    }

    try {
      // 执行调用（带重试）
      const result = await this.invokeWithRetry(processedParams, invokeOptions)

      // 更新统计信息
      this.updateStats(true, Date.now() - startTime)

      if (invokeOptions.enableDetailLog) {
        this.logger.info('云函数调用成功', {
          function: processedParams.FunctionName,
          requestId: result.RequestId,
          duration: Date.now() - startTime,
          logResult: result.Result?.LogResult ? result.Result.LogResult.substring(0, 200) + '...' : undefined
        })
      }

      return result
    } catch (error) {
      // 更新统计信息
      this.updateStats(false, Date.now() - startTime, error as ScfError)

      if (invokeOptions.enableDetailLog) {
        this.logger.error('云函数调用失败', {
          function: processedParams.FunctionName,
          requestId: invokeOptions.requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime
        })
      }

      throw error
    }
  }

  /**
   * 同步调用云函数
   * @param functionName 函数名称
   * @param payload 函数参数
   * @param options 调用选项
   * @returns Promise<any>
   */
  async invokeFunctionSync<T = any>(
    functionName: string,
    payload: any,
    options: InvokeOptions = {}
  ): Promise<T> {
    const result = await this.invokeFunction({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: payload
    }, options)

    if (result.Result?.Payload) {
      const payloadStr = Buffer.isBuffer(result.Result.Payload)
        ? result.Result.Payload.toString('utf8')
        : result.Result.Payload

      try {
        return JSON.parse(payloadStr)
      } catch (error) {
        // 如果不是JSON格式，直接返回字符串
        return payloadStr as unknown as T
      }
    }

    throw new ScfError(
      '函数返回结果为空',
      ScfErrorCode.FUNCTION_ERROR,
      result.RequestId
    )
  }

  /**
   * 异步调用云函数
   * @param functionName 函数名称
   * @param payload 函数参数
   * @param options 调用选项
   * @returns Promise<void>
   */
  async invokeFunctionAsync(
    functionName: string,
    payload: any,
    options: InvokeOptions = {}
  ): Promise<void> {
    await this.invokeFunction({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: payload
    }, options)
  }

  /**
   * 获取调用统计信息
   * @returns InvokeStats
   */
  getStats(): InvokeStats {
    return { ...this.stats }
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      invokeCount: 0,
      successCount: 0,
      failureCount: 0,
      avgDuration: 0,
      totalDuration: 0,
      errorStats: {} as Record<ScfErrorCode, number>
    }
  }

  /**
   * 处理参数
   * @param params 原始参数
   * @returns 处理后的参数
   */
  private processParams(params: InvokeFunctionParams): any {
    const processed: any = {
      FunctionName: params.FunctionName,
      Namespace: params.Namespace || 'default',
      Qualifier: params.Qualifier || '$LATEST',
      InvocationType: params.InvocationType || 'RequestResponse',
      LogType: params.LogType || 'None'
    }

    if (params.ClientContext) {
      processed.ClientContext = params.ClientContext
    }

    if (params.Payload !== undefined) {
      if (typeof params.Payload === 'string' || Buffer.isBuffer(params.Payload)) {
        processed.Payload = params.Payload
      } else {
        processed.Payload = JSON.stringify(params.Payload)
      }
    }

    return processed
  }

  /**
   * 带重试的函数调用
   * @param params 调用参数
   * @param options 调用选项
   * @returns Promise<InvokeFunctionResponse>
   */
  private async invokeWithRetry(
    params: any,
    options: Required<InvokeOptions>
  ): Promise<InvokeFunctionResponse> {
    let lastError: Error | null = null
    const { retry } = options

    for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateRetryDelay(attempt, retry)
          options.onProgress(0, `重试第 ${attempt} 次，等待 ${delay}ms`)
          await this.sleep(delay)
        }

        options.onProgress((attempt / (retry.maxRetries + 1)) * 100, `执行第 ${attempt + 1} 次调用`)

        // 执行实际的云函数调用
        const result = await this.executeInvoke(params)
        return result

      } catch (error) {
        lastError = error as Error

        // 检查是否可重试
        if (!this.shouldRetry(lastError as ScfError, retry, attempt)) {
          break
        }

        if (options.enableDetailLog) {
          this.logger.warn(`第 ${attempt + 1} 次调用失败，准备重试`, {
            error: lastError.message,
            code: (lastError as ScfError).code
          })
        }
      }
    }

    throw lastError || new ScfError('调用失败', ScfErrorCode.UNKNOWN_ERROR)
  }

  /**
   * 执行实际的云函数调用
   * @param params 调用参数
   * @returns Promise<InvokeFunctionResponse>
   */
  private async executeInvoke(params: any): Promise<InvokeFunctionResponse> {
    try {
      const response = await this.client.InvokeFunction(params)
      return response
    } catch (error: any) {
      throw this.processError(error)
    }
  }

  /**
   * 处理错误
   * @param error 原始错误
   * @returns ScfError
   */
  private processError(error: any): ScfError {
    if (error.response) {
      const statusCode = error.response.status || 500
      const errorCode = this.getErrorCodeFromResponse(error.response)
      const message = error.response.data?.Response?.Error?.Message || error.message
      const requestId = error.response.data?.Response?.RequestId

      return new ScfError(
        message,
        errorCode,
        requestId,
        statusCode,
        error
      )
    }

    if (error.code) {
      const errorCode = this.getErrorCodeFromCode(error.code)
      return new ScfError(
        error.message,
        errorCode,
        undefined,
        undefined,
        error
      )
    }

    return new ScfError(
      error.message || '未知错误',
      ScfErrorCode.UNKNOWN_ERROR,
      undefined,
      undefined,
      error
    )
  }

  /**
   * 从HTTP响应获取错误代码
   * @param response HTTP响应
   * @returns ScfErrorCode
   */
  private getErrorCodeFromResponse(response: any): ScfErrorCode {
    const statusCode = response.status || 500
    const errorCode = response.data?.Response?.Error?.Code

    switch (statusCode) {
      case 401:
      case 403:
        return ScfErrorCode.AUTH_ERROR
      case 404:
        return ScfErrorCode.FUNCTION_NOT_FOUND
      case 429:
        return ScfErrorCode.THROTTLED
      case 400:
        return ScfErrorCode.INVALID_PARAMETER
      default:
        return ScfErrorCode.FUNCTION_ERROR
    }
  }

  /**
   * 从错误代码获取SCF错误代码
   * @param code 原始错误代码
   * @returns ScfErrorCode
   */
  private getErrorCodeFromCode(code: string): ScfErrorCode {
    if (code.includes('Network') || code.includes('ECONNREFUSED')) {
      return ScfErrorCode.NETWORK_ERROR
    }
    if (code.includes('Timeout') || code.includes('TIMEOUT')) {
      return ScfErrorCode.TIMEOUT_ERROR
    }
    if (code.includes('Auth') || code.includes('Secret')) {
      return ScfErrorCode.AUTH_ERROR
    }
    return ScfErrorCode.UNKNOWN_ERROR
  }

  /**
   * 判断是否应该重试
   * @param error 错误对象
   * @param retry 重试配置
   * @param attempt 当前尝试次数
   * @returns boolean
   */
  private shouldRetry(error: ScfError, retry: RetryOptions, attempt: number): boolean {
    // 已达到最大重试次数
    if (attempt >= retry.maxRetries) {
      return false
    }

    // 检查错误代码是否在可重试列表中
    return retry.retryableErrors.includes(error.code)
  }

  /**
   * 计算重试延迟时间
   * @param attempt 当前尝试次数
   * @param retry 重试配置
   * @returns number 延迟时间（毫秒）
   */
  private calculateRetryDelay(attempt: number, retry: RetryOptions): number {
    let delay: number

    switch (retry.backoffStrategy) {
      case 'fixed':
        delay = retry.baseDelay
        break
      case 'linear':
        delay = retry.baseDelay * attempt
        break
      case 'exponential':
        delay = retry.baseDelay * Math.pow(2, attempt - 1)
        break
      default:
        delay = retry.baseDelay
    }

    // 应用抖动
    if (retry.jitterFactor && retry.jitterFactor > 0) {
      const jitter = delay * retry.jitterFactor * Math.random()
      delay += jitter
    }

    // 限制最大延迟时间
    return Math.min(delay, retry.maxDelay)
  }

  /**
   * 更新统计信息
   * @param success 是否成功
   * @param duration 执行时间
   * @param error 错误对象
   */
  private updateStats(success: boolean, duration: number, error?: ScfError): void {
    this.stats.invokeCount++

    if (success) {
      this.stats.successCount++
    } else {
      this.stats.failureCount++
      if (error) {
        this.stats.errorStats[error.code] = (this.stats.errorStats[error.code] || 0) + 1
      }
    }

    this.stats.totalDuration += duration
    this.stats.avgDuration = this.stats.totalDuration / this.stats.invokeCount
    this.stats.lastInvokeTime = new Date()
  }

  /**
   * 生成请求ID
   * @returns string
   */
  private generateRequestId(): string {
    return `scf_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }

  /**
   * 休眠函数
   * @param ms 休眠时间（毫秒）
   * @returns Promise<void>
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}