/**
 * 错误处理工具类
 * 提供统一的错误处理和恢复机制
 */

const Logger = require('./logger')

class ErrorHandler {
  constructor() {
    this.logger = new Logger('ErrorHandler')
  }

  /**
   * 处理工作流错误
   */
  async handleWorkflowError(taskId, error, context = {}) {
    this.logger.error('Workflow error occurred', {
      task_id: taskId,
      error_message: error.message,
      error_type: error.constructor.name,
      context: context,
      stack: error.stack
    })

    // 根据错误类型进行分类处理
    const errorType = this.classifyError(error)

    return {
      success: false,
      error_type: errorType,
      message: this.getUserFriendlyMessage(errorType, error),
      should_retry: this.shouldRetry(errorType),
      recovery_suggestions: this.getRecoverySuggestions(errorType)
    }
  }

  /**
   * 错误分类
   */
  classifyError(error) {
    const message = error.message.toLowerCase()

    if (message.includes('timeout') || message.includes('超时')) {
      return 'TIMEOUT'
    }

    if (message.includes('network') || message.includes('网络')) {
      return 'NETWORK'
    }

    if (message.includes('quota') || message.includes('limit') || message.includes('配额')) {
      return 'QUOTA_EXCEEDED'
    }

    if (message.includes('invalid') || message.includes('无效')) {
      return 'INVALID_INPUT'
    }

    if (message.includes('permission') || message.includes('权限')) {
      return 'PERMISSION'
    }

    if (message.includes('storage') || message.includes('存储')) {
      return 'STORAGE'
    }

    if (message.includes('ai') || message.includes('model')) {
      return 'AI_MODEL'
    }

    if (message.includes('watermark') || message.includes('水印')) {
      return 'WATERMARK'
    }

    return 'UNKNOWN'
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserFriendlyMessage(errorType, originalError) {
    const messages = {
      'TIMEOUT': '请求超时，请稍后重试',
      'NETWORK': '网络连接错误，请检查网络状态',
      'QUOTA_EXCEEDED': 'API调用次数已达上限，请稍后重试',
      'INVALID_INPUT': '输入参数有误，请检查后重试',
      'PERMISSION': '权限不足，请联系管理员',
      'STORAGE': '存储服务异常，请稍后重试',
      'AI_MODEL': 'AI模型服务暂时不可用，请稍后重试',
      'WATERMARK': '水印处理失败，但图片生成成功',
      'UNKNOWN': '系统暂时异常，请稍后重试'
    }

    return messages[errorType] || originalError.message
  }

  /**
   * 判断是否应该重试
   */
  shouldRetry(errorType) {
    const retryableErrors = ['TIMEOUT', 'NETWORK', 'STORAGE', 'AI_MODEL']
    return retryableErrors.includes(errorType)
  }

  /**
   * 获取恢复建议
   */
  getRecoverySuggestions(errorType) {
    const suggestions = {
      'TIMEOUT': ['减少输入图片数量', '简化提示词', '稍后重试'],
      'NETWORK': ['检查网络连接', '稍后重试'],
      'QUOTA_EXCEEDED': ['等待配额重置', '联系管理员增加配额'],
      'INVALID_INPUT': ['检查图片格式', '检查提示词内容', '检查参数设置'],
      'PERMISSION': ['联系管理员获取权限'],
      'STORAGE': ['稍后重试', '检查存储空间'],
      'AI_MODEL': ['尝试其他AI模型', '稍后重试'],
      'WATERMARK': ['图片已生成，水印可手动添加'],
      'UNKNOWN': ['稍后重试', '联系技术支持']
    }

    return suggestions[errorType] || ['稍后重试', '联系技术支持']
  }

  /**
   * 创建错误报告
   */
  createErrorReport(taskId, error, context = {}) {
    return {
      task_id: taskId,
      timestamp: new Date(),
      error: {
        message: error.message,
        type: error.constructor.name,
        stack: error.stack
      },
      context: context,
      classification: this.classifyError(error),
      environment: {
        node_version: process.version,
        memory_usage: process.memoryUsage(),
        uptime: process.uptime()
      }
    }
  }

  /**
   * 异步错误处理包装器
   */
  async safeExecute(fn, context = {}) {
    try {
      return await fn()
    } catch (error) {
      this.logger.error('Safe execution failed', {
        context: context,
        error: error.message
      })

      throw error
    }
  }

  /**
   * 重试机制
   */
  async retry(fn, options = {}) {
    const {
      maxAttempts = 3,
      delay = 1000,
      backoff = 2,
      shouldRetry = (error) => this.shouldRetry(this.classifyError(error))
    } = options

    let lastError

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error

        if (attempt === maxAttempts || !shouldRetry(error)) {
          throw error
        }

        const waitTime = delay * Math.pow(backoff, attempt - 1)
        this.logger.warn(`Retry attempt ${attempt}/${maxAttempts} failed, waiting ${waitTime}ms`, {
          error: error.message,
          attempt: attempt
        })

        await this.sleep(waitTime)
      }
    }

    throw lastError
  }

  /**
   * 等待指定时间
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = ErrorHandler