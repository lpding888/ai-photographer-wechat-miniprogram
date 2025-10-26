/**
 * 腾讯云SCF (Serverless Cloud Function) 客户端库
 *
 * 提供简单易用的腾讯云函数调用接口，支持同步/异步调用、重试策略、错误处理等功能
 */

// 导出主要类和类型
export { TencentScfClient } from './client'
export {
  ScfError,
  ScfErrorCode,
  RuntimeEnvironment,
  FunctionStatus,
  type MemorySize,
  type TimeoutSeconds,
  type ScfClientOptions,
  type InvokeFunctionParams,
  type InvokeFunctionResponse,
  type InvokeOptions,
  type RetryOptions,
  type InvokeStats,
  type FunctionInfo
} from './types'

// 导出工具函数
export {
  createDefaultRetryOptions,
  createFastRetryOptions,
  createConservativeRetryOptions,
  validateFunctionName,
  validateNamespace,
  validatePayloadSize,
  formatFunctionName,
  formatNamespace,
  generateClientContext,
  parseClientContext,
  createMonitoringData,
  calculateFunctionCost,
  isFunctionInvocable,
  getRecommendedMemorySize,
  getRecommendedTimeout
} from './utils'

// 默认导出客户端类
export { TencentScfClient as default } from './client'