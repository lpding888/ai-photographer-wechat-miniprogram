/**
 * 日志工具类
 * 提供统一的日志记录功能
 */

class Logger {
  constructor(module = 'aimodels') {
    this.module = module
    this.logLevel = process.env.LOG_LEVEL || 'info'
  }

  /**
   * 格式化日志消息
   */
  format(level, message, data = null) {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${this.module}] [${level.toUpperCase()}]`

    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data)}`
    }

    return `${prefix} ${message}`
  }

  /**
   * 检查日志级别
   */
  shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error']
    const currentLevel = levels.indexOf(this.logLevel)
    const targetLevel = levels.indexOf(level)

    return targetLevel >= currentLevel
  }

  /**
   * Debug日志
   */
  debug(message, data = null) {
    if (this.shouldLog('debug')) {
      console.log(this.format('debug', message, data))
    }
  }

  /**
   * Info日志
   */
  info(message, data = null) {
    if (this.shouldLog('info')) {
      console.log(this.format('info', message, data))
    }
  }

  /**
   * Warning日志
   */
  warn(message, data = null) {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, data))
    }
  }

  /**
   * Error日志
   */
  error(message, data = null) {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message, data))
    }
  }

  /**
   * 性能日志
   */
  performance(action, duration, additionalData = {}) {
    this.info(`Performance: ${action}`, {
      duration_ms: duration,
      ...additionalData
    })
  }

  /**
   * 工作流步骤日志
   */
  workflow(taskId, step, status, data = {}) {
    this.info(`Workflow: ${step}`, {
      task_id: taskId,
      status: status,
      ...data
    })
  }
}

module.exports = Logger