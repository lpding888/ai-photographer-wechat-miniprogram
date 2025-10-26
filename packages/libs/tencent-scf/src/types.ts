/**
 * 腾讯云SCF (Serverless Cloud Function) 相关类型定义
 */

// 云函数调用参数
export interface InvokeFunctionParams {
  /** 函数名称 */
  FunctionName: string
  /** 函数命名空间，默认为 default */
  Namespace?: string
  /** 函数版本或别名，默认为 $LATEST */
  Qualifier?: string
  /** 调用类型，同步或异步 */
  InvocationType?: 'RequestResponse' | 'Event'
  /** 客户端上下文信息 */
  ClientContext?: string
  /** 函数运行日志 */
  LogType?: 'None' | 'Tail'
  /** 函数入参，JSON格式字符串 */
  Payload?: string | Record<string, any> | Buffer
}

// 云函数调用响应
export interface InvokeFunctionResponse {
  /** 函数执行结果 */
  Result?: {
    /** 函数返回数据 */
    Payload?: string | Buffer
    /** 函数执行日志 */
    LogResult?: string
    /** 函数执行错误信息 */
    ErrorMsg?: string
    /** 函数内存使用量，单位MB */
    MemUsage?: number
    /** 函数执行时间，单位毫秒 */
    Duration?: number
    /** 计费粒度，单位毫秒 */
    BillDuration?: number
    /** 函数请求ID */
    RequestId?: string
  }
  /** 请求ID */
  RequestId?: string
}

// 云函数配置选项
export interface ScfClientOptions {
  /** 腾讯云 SecretId */
  SecretId: string
  /** 腾讯云 SecretKey */
  SecretKey: string
  /** 腾讯云区域，默认为 ap-beijing */
  Region?: string
  /** 请求超时时间，单位毫秒，默认30000 */
  timeout?: number
  /** 是否启用请求日志 */
  enableRequestLog?: boolean
  /** 自定义请求头 */
  headers?: Record<string, string>
}

// 云函数错误类型
export enum ScfErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  FUNCTION_NOT_FOUND = 'FUNCTION_NOT_FOUND',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  FUNCTION_ERROR = 'FUNCTION_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  THROTTLED = 'THROTTLED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// 云函数错误类
export class ScfError extends Error {
  public readonly code: ScfErrorCode
  public readonly requestId?: string
  public readonly statusCode?: number
  public readonly originalError?: any

  constructor(
    message: string,
    code: ScfErrorCode = ScfErrorCode.UNKNOWN_ERROR,
    requestId?: string,
    statusCode?: number,
    originalError?: any
  ) {
    super(message)
    this.name = 'ScfError'
    this.code = code
    this.requestId = requestId
    this.statusCode = statusCode
    this.originalError = originalError

    // 确保错误堆栈正确
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ScfError)
    }
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      requestId: this.requestId,
      statusCode: this.statusCode,
      stack: this.stack
    }
  }
}

// 函数调用统计信息
export interface InvokeStats {
  /** 调用次数 */
  invokeCount: number
  /** 成功次数 */
  successCount: number
  /** 失败次数 */
  failureCount: number
  /** 平均执行时间 */
  avgDuration: number
  /** 总执行时间 */
  totalDuration: number
  /** 最后调用时间 */
  lastInvokeTime?: Date
  /** 错误统计 */
  errorStats: Record<ScfErrorCode, number>
}

// 重试策略配置
export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number
  /** 基础延迟时间，单位毫秒 */
  baseDelay: number
  /** 最大延迟时间，单位毫秒 */
  maxDelay: number
  /** 退避策略：fixed, linear, exponential */
  backoffStrategy: 'fixed' | 'linear' | 'exponential'
  /** 抖动因子，用于exponential策略 */
  jitterFactor?: number
  /** 可重试的错误代码 */
  retryableErrors: ScfErrorCode[]
}

// 调用选项
export interface InvokeOptions {
  /** 超时时间，单位毫秒 */
  timeout?: number
  /** 重试策略 */
  retry?: RetryOptions
  /** 进度回调函数 */
  onProgress?: (progress: number, message?: string) => void
  /** 自定义请求ID */
  requestId?: string
  /** 是否启用详细日志 */
  enableDetailLog?: boolean
}

// 云函数运行时环境
export enum RuntimeEnvironment {
  NODEJS_16 = 'Nodejs16.13',
  NODEJS_18 = 'Nodejs18.15',
  PYTHON_3_9 = 'Python3.9',
  PYTHON_3_10 = 'Python3.10',
  PHP_8 = 'Php8.0',
  GO_1 = 'Go1.8',
  JAVA_11 = 'Java11',
  JAVA_17 = 'Java17'
}

// 函数内存配置
export type MemorySize = 64 | 128 | 256 | 512 | 1024 | 2048 | 3072 | 4096 | 5120 | 6144 | 7168 | 8192 | 9216 | 10240 | 11264 | 12288 | 13312 | 14336 | 15360

// 函数超时配置
export type TimeoutSeconds = 1 | 3 | 5 | 10 | 15 | 30 | 60 | 120 | 180 | 240 | 300 | 600 | 900

// 函数状态
export enum FunctionStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
  CREATING = 'Creating',
  UPDATING = 'Updating',
  DELETING = 'Deleting',
  CREATE_FAILED = 'CreateFailed',
  UPDATE_FAILED = 'UpdateFailed',
  DELETE_FAILED = 'DeleteFailed'
}

// 函数信息
export interface FunctionInfo {
  /** 函数名称 */
  FunctionName: string
  /** 函数命名空间 */
  Namespace: string
  /** 运行时环境 */
  Runtime: RuntimeEnvironment
  /** 函数描述 */
  Description?: string
  /** 函数代码大小，单位字节 */
  CodeSize: number
  /** 函数代码MD5 */
  CodeMd5?: string
  /** 函数超时时间 */
  Timeout: TimeoutSeconds
  /** 函数内存大小 */
  MemorySize: MemorySize
  /** 函数环境变量 */
  Environment?: Record<string, string>
  /** 函数VPC配置 */
  VpcConfig?: {
    VpcId: string
    SubnetId: string
  }
  /** 函数状态 */
  Status: FunctionStatus
  /** 函数状态描述 */
  StatusDesc?: string
  /** 创建时间 */
  AddTime: string
  /** 更新时间 */
  ModTime: string
}