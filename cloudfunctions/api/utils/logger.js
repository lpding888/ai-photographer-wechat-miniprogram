// 日志工具
class Logger {
  
  constructor() {
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    }
    
    // 生产环境只记录ERROR和WARN
    this.currentLevel = process.env.NODE_ENV === 'production' ? this.levels.WARN : this.levels.DEBUG
  }
  
  /**
   * 格式化日志消息
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString()
    
    // 安全处理message参数，防止undefined或null导致的toString错误
    let safeMessage = 'Unknown message'
    if (message !== undefined && message !== null) {
      safeMessage = typeof message === 'string' ? message : String(message)
    }
    
    const logEntry = {
      timestamp,
      level,
      message: safeMessage,
      data
    }
    
    return JSON.stringify(logEntry)
  }
  
  /**
   * 错误日志
   */
  error(message, error = null) {
    if (this.currentLevel >= this.levels.ERROR) {
      let errorData = null
      
      // 安全处理error对象
      if (error !== null && error !== undefined) {
        try {
          errorData = {
            message: error.message || 'Unknown error message',
            stack: error.stack || 'No stack trace available',
            name: error.name || 'Error'
          }
        } catch (e) {
          // 如果error对象无法处理，使用安全的默认值
          errorData = {
            message: 'Error object processing failed',
            stack: 'No stack trace available',
            name: 'ProcessingError'
          }
        }
      }
      
      console.error(this.formatMessage('ERROR', message, errorData))
    }
  }
  
  /**
   * 警告日志
   */
  warn(message, data = null) {
    if (this.currentLevel >= this.levels.WARN) {
      console.warn(this.formatMessage('WARN', message, data))
    }
  }
  
  /**
   * 信息日志
   */
  info(message, data = null) {
    if (this.currentLevel >= this.levels.INFO) {
      console.log(this.formatMessage('INFO', message, data))
    }
  }
  
  /**
   * 调试日志
   */
  debug(message, data = null) {
    if (this.currentLevel >= this.levels.DEBUG) {
      console.log(this.formatMessage('DEBUG', message, data))
    }
  }
  
  /**
   * 记录API请求
   */
  logRequest(action, userId, params = null) {
    this.info('API请求', {
      action,
      userId,
      params,
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * 记录API响应
   */
  logResponse(action, userId, success, duration = null) {
    this.info('API响应', {
      action,
      userId,
      success,
      duration,
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * 记录数据库操作
   */
  logDatabase(operation, collection, query = null, result = null) {
    this.debug('数据库操作', {
      operation,
      collection,
      query,
      result,
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * 记录外部API调用
   */
  logExternalAPI(service, endpoint, method, status, duration = null) {
    this.info('外部API调用', {
      service,
      endpoint,
      method,
      status,
      duration,
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * 记录性能指标
   */
  logPerformance(operation, duration, details = null) {
    this.info('性能指标', {
      operation,
      duration,
      details,
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * 记录用户行为
   */
  logUserAction(userId, action, details = null) {
    this.info('用户行为', {
      userId,
      action,
      details,
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * 记录安全事件
   */
  logSecurity(event, userId, details = null) {
    this.warn('安全事件', {
      event,
      userId,
      details,
      timestamp: new Date().toISOString()
    })
  }
}

module.exports = new Logger()