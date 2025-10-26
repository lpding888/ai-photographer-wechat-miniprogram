# @ai-photographer/tencent-scf

腾讯云SCF (Serverless Cloud Function) 客户端库，为AI摄影师项目提供简单易用的云函数调用接口。

## 功能特性

- ✅ **简单的API接口**：支持同步和异步调用
- ✅ **智能重试策略**：内置多种重试策略，支持指数退避
- ✅ **完善的错误处理**：统一的错误类型和处理机制
- ✅ **TypeScript支持**：完整的类型定义
- ✅ **调用统计**：内置调用统计和监控
- ✅ **超时控制**：灵活的超时配置
- ✅ **日志记录**：详细的调用日志和错误追踪

## 安装

```bash
pnpm add @ai-photographer/tencent-scf
```

## 基本用法

### 1. 创建客户端

```typescript
import { TencentScfClient } from '@ai-photographer/tencent-scf'

const client = new TencentScfClient({
  SecretId: process.env.TENCENT_SECRET_ID,
  SecretKey: process.env.TENCENT_SECRET_KEY,
  Region: 'ap-beijing'
})
```

### 2. 同步调用函数

```typescript
try {
  const result = await client.invokeFunctionSync('my-function', {
    name: 'test',
    data: [1, 2, 3]
  })
  console.log('函数返回结果:', result)
} catch (error) {
  console.error('调用失败:', error.message)
}
```

### 3. 异步调用函数

```typescript
await client.invokeFunctionAsync('async-function', {
  task: 'process-image',
  url: 'https://example.com/image.jpg'
})
console.log('异步调用已发送')
```

### 4. 带选项的调用

```typescript
import { createDefaultRetryOptions } from '@ai-photographer/tencent-scf'

const result = await client.invokeFunctionSync('my-function', payload, {
  timeout: 60000,
  retry: createDefaultRetryOptions(3, 2000),
  onProgress: (progress, message) => {
    console.log(`进度: ${progress}% - ${message}`)
  },
  enableDetailLog: true
})
```

## API参考

### TencentScfClient

#### 构造函数

```typescript
new TencentScfClient(options: ScfClientOptions)
```

**参数:**
- `options` - 客户端配置选项
  - `SecretId` (string) - 腾讯云SecretId
  - `SecretKey` (string) - 腾讯云SecretKey
  - `Region` (string, 可选) - 区域，默认 'ap-beijing'
  - `timeout` (number, 可选) - 超时时间(ms)，默认 30000
  - `enableRequestLog` (boolean, 可选) - 是否启用请求日志
  - `headers` (object, 可选) - 自定义请求头

#### 主要方法

##### invokeFunction()

```typescript
invokeFunction(params: InvokeFunctionParams, options?: InvokeOptions): Promise<InvokeFunctionResponse>
```

调用云函数的基础方法。

##### invokeFunctionSync()

```typescript
invokeFunctionSync<T>(functionName: string, payload: any, options?: InvokeOptions): Promise<T>
```

同步调用云函数，自动解析返回结果。

##### invokeFunctionAsync()

```typescript
invokeFunctionAsync(functionName: string, payload: any, options?: InvokeOptions): Promise<void>
```

异步调用云函数，不等待返回结果。

##### getStats()

```typescript
getStats(): InvokeStats
```

获取调用统计信息。

##### resetStats()

```typescript
resetStats(): void
```

重置统计信息。

### 工具函数

#### 重试策略

```typescript
import {
  createDefaultRetryOptions,
  createFastRetryOptions,
  createConservativeRetryOptions
} from '@ai-photographer/tencent-scf'

// 默认重试策略
const defaultRetry = createDefaultRetryOptions(3, 1000)

// 快速重试策略（高频调用）
const fastRetry = createFastRetryOptions()

// 保守重试策略（重要调用）
const conservativeRetry = createConservativeRetryOptions()
```

#### 参数验证

```typescript
import {
  validateFunctionName,
  validateNamespace,
  validatePayloadSize
} from '@ai-photographer/tencent-scf'

const isValidName = validateFunctionName('my-function') // true
const isValidNamespace = validateNamespace('default') // true
const isValidPayload = validatePayloadSize({ data: 'test' }) // true
```

#### 监控和成本计算

```typescript
import {
  createMonitoringData,
  calculateFunctionCost
} from '@ai-photographer/tencent-scf'

const monitoringData = createMonitoringData(
  'my-function',
  1500, // 执行时间(ms)
  true,
  undefined // 无错误
)

const cost = calculateFunctionCost(1500, 256, 'ap-beijing') // 预估成本
```

## 错误处理

所有错误都会抛出 `ScfError` 实例：

```typescript
import { ScfError, ScfErrorCode } from '@ai-photographer/tencent-scf'

try {
  await client.invokeFunctionSync('my-function', data)
} catch (error) {
  if (error instanceof ScfError) {
    console.error('错误代码:', error.code)
    console.error('请求ID:', error.requestId)
    console.error('HTTP状态:', error.statusCode)
  }
}
```

### 错误代码

- `NETWORK_ERROR` - 网络连接错误
- `TIMEOUT_ERROR` - 请求超时
- `AUTH_ERROR` - 认证失败
- `FUNCTION_NOT_FOUND` - 函数不存在
- `INVALID_PARAMETER` - 参数错误
- `FUNCTION_ERROR` - 函数执行错误
- `QUOTA_EXCEEDED` - 配额超限
- `THROTTLED` - 请求被限流
- `UNKNOWN_ERROR` - 未知错误

## 环境变量配置

```bash
# 腾讯云访问密钥
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key

# 云函数区域
TENCENT_REGION=ap-beijing

# 日志级别
LOG_LEVEL=info
```

## 许可证

MIT License