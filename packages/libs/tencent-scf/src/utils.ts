import { ScfErrorCode, RetryOptions } from './types'

/**
 * 云函数工具函数
 */

/**
 * 创建默认重试策略
 * @param maxRetries 最大重试次数
 * @param baseDelay 基础延迟时间
 * @returns RetryOptions
 */
export function createDefaultRetryOptions(
  maxRetries: number = 3,
  baseDelay: number = 1000
): RetryOptions {
  return {
    maxRetries,
    baseDelay,
    maxDelay: 10000,
    backoffStrategy: 'exponential',
    jitterFactor: 0.1,
    retryableErrors: [
      ScfErrorCode.NETWORK_ERROR,
      ScfErrorCode.TIMEOUT_ERROR,
      ScfErrorCode.THROTTLED
    ]
  }
}

/**
 * 创建快速重试策略（适用于高频调用）
 * @returns RetryOptions
 */
export function createFastRetryOptions(): RetryOptions {
  return {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
    backoffStrategy: 'linear',
    jitterFactor: 0.05,
    retryableErrors: [
      ScfErrorCode.NETWORK_ERROR,
      ScfErrorCode.THROTTLED
    ]
  }
}

/**
 * 创建保守重试策略（适用于重要调用）
 * @returns RetryOptions
 */
export function createConservativeRetryOptions(): RetryOptions {
  return {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffStrategy: 'exponential',
    jitterFactor: 0.2,
    retryableErrors: [
      ScfErrorCode.NETWORK_ERROR,
      ScfErrorCode.TIMEOUT_ERROR,
      ScfErrorCode.THROTTLED
    ]
  }
}

/**
 * 验证函数名称
 * @param functionName 函数名称
 * @returns boolean
 */
export function validateFunctionName(functionName: string): boolean {
  if (!functionName || typeof functionName !== 'string') {
    return false
  }

  // 函数名称规则：1-60个字符，只能包含字母、数字、下划线和连字符
  const pattern = /^[a-zA-Z0-9_-]{1,60}$/
  return pattern.test(functionName)
}

/**
 * 验证命名空间名称
 * @param namespace 命名空间名称
 * @returns boolean
 */
export function validateNamespace(namespace: string): boolean {
  if (!namespace || typeof namespace !== 'string') {
    return false
  }

  // 命名空间规则：1-32个字符，只能包含字母、数字、下划线和连字符
  const pattern = /^[a-zA-Z0-9_-]{1,32}$/
  return pattern.test(namespace)
}

/**
 * 验证Payload大小
 * @param payload 载荷数据
 * @param maxSize 最大大小（字节）
 * @returns boolean
 */
export function validatePayloadSize(payload: any, maxSize: number = 6 * 1024 * 1024): boolean {
  if (!payload) {
    return true
  }

  let size = 0
  if (typeof payload === 'string') {
    size = Buffer.byteLength(payload, 'utf8')
  } else if (Buffer.isBuffer(payload)) {
    size = payload.length
  } else {
    size = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  }

  return size <= maxSize
}

/**
 * 格式化函数名称
 * @param name 原始名称
 * @returns string
 */
export function formatFunctionName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
}

/**
 * 格式化命名空间名称
 * @param namespace 原始命名空间
 * @returns string
 */
export function formatNamespace(namespace: string): string {
  return namespace.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
}

/**
 * 生成客户端上下文
 * @param context 上下文信息
 * @returns string
 */
export function generateClientContext(context: Record<string, any>): string {
  const clientContext = {
    custom: context,
    timestamp: Date.now(),
    requestId: `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }
  return Buffer.from(JSON.stringify(clientContext)).toString('base64')
}

/**
 * 解析客户端上下文
 * @param clientContext 客户端上下文字符串
 * @returns Record<string, any>
 */
export function parseClientContext(clientContext: string): Record<string, any> {
  try {
    const decoded = Buffer.from(clientContext, 'base64').toString('utf8')
    return JSON.parse(decoded)
  } catch (error) {
    throw new Error('Invalid client context format')
  }
}

/**
 * 创建函数调用的监控数据
 * @param functionName 函数名称
 * @param duration 执行时间
 * @param success 是否成功
 * @param error 错误信息
 * @returns Record<string, any>
 */
export function createMonitoringData(
  functionName: string,
  duration: number,
  success: boolean,
  error?: string
): Record<string, any> {
  return {
    functionName,
    duration,
    success,
    error,
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    pid: process.pid,
    platform: process.platform,
    nodeVersion: process.version
  }
}

/**
 * 计算函数调用成本
 * @param duration 执行时间（毫秒）
 * @param memory 内存大小（MB）
 * @param region 区域
 * @returns number 预估成本（元）
 */
export function calculateFunctionCost(
  duration: number,
  memory: number,
  region: string = 'ap-beijing'
): number {
  // 腾讯云SCF计费规则（示例价格，实际价格请查阅官方文档）
  const prices = {
    'ap-beijing': {
      invocation: 0.000013, // 每次调用价格（元）
      duration: 0.0000167,  // 每GB秒价格（元）
      memory: 0.000000208   // 每GB秒价格（元）
    },
    'ap-shanghai': {
      invocation: 0.000013,
      duration: 0.0000167,
      memory: 0.000000208
    },
    'ap-guangzhou': {
      invocation: 0.000013,
      duration: 0.0000167,
      memory: 0.000000208
    }
  }

  const price = prices[region as keyof typeof prices] || prices['ap-beijing']

  // 计算调用成本
  const invocationCost = price.invocation

  // 计算执行时间成本（转换为GB秒）
  const durationInSeconds = duration / 1000
  const memoryInGB = memory / 1024
  const durationCost = durationInSeconds * memoryInGB * price.duration

  return invocationCost + durationCost
}

/**
 * 检查函数状态是否可调用
 * @param status 函数状态
 * @returns boolean
 */
export function isFunctionInvocable(status: string): boolean {
  const invocableStatuses = ['Active', 'Updating']
  return invocableStatuses.includes(status)
}

/**
 * 获取推荐的内存大小
 * @param complexity 复杂度等级：low, medium, high
 * @returns number 内存大小（MB）
 */
export function getRecommendedMemorySize(complexity: 'low' | 'medium' | 'high'): number {
  const memoryMap = {
    low: 128,
    medium: 256,
    high: 512
  }
  return memoryMap[complexity]
}

/**
 * 获取推荐的超时时间
 * @param type 函数类型：sync, async, batch
 * @returns number 超时时间（秒）
 */
export function getRecommendedTimeout(type: 'sync' | 'async' | 'batch'): number {
  const timeoutMap = {
    sync: 30,
    async: 900,
    batch: 900
  }
  return timeoutMap[type]
}