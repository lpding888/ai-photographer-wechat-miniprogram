/**
 * 大模型基础适配器接口
 * 所有AI大模型适配器都必须实现这个基础接口
 *
 * 设计原则：
 * 1. 统一接口，便于替换
 * 2. 标准化输入输出格式
 * 3. 支持健康检查和配置验证
 * 4. 完善的错误处理
 *
 * @author 老王
 * @version 1.0.0
 */

/**
 * 大模型基础适配器类
 */
class BaseModelAdapter {
  constructor(config) {
    this.config = config
    this.name = config.name
    this.type = config.type
    this.version = config.version || '1.0.0'
    this.isInitialized = false

    // 验证必需配置
    this.validateConfig()
  }

  /**
   * 验证配置完整性
   */
  validateConfig() {
    const requiredFields = ['name', 'type']
    const missingFields = requiredFields.filter(field => !this.config[field])

    if (missingFields.length > 0) {
      throw new Error(`适配器配置缺少必需字段: ${missingFields.join(', ')}`)
    }
  }

  /**
   * 初始化适配器
   * 子类必须实现此方法
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    throw new Error(`${this.constructor.name}.initialize() 方法必须被实现`)
  }

  /**
   * 图像分析功能
   * 用于prompt-generator SCF函数
   * @param {Array<string>} imageUrls - 图片URL数组
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeImages(imageUrls, options = {}) {
    throw new Error(`${this.constructor.name}.analyzeImages() 方法必须被实现`)
  }

  /**
   * 图像生成功能
   * 用于image-generator SCF函数
   * @param {string} prompt - 生成提示词
   * @param {Object} options - 生成选项
   * @returns {Promise<Object>} 生成结果
   */
  async generateImage(prompt, options = {}) {
    throw new Error(`${this.constructor.name}.generateImage() 方法必须被实现`)
  }

  /**
   * 图像处理功能
   * 用于ai-image-processor SCF函数
   * @param {Array<string>} imageUrls - 图片URL数组
   * @param {Object} options - 处理选项
   * @returns {Promise<Object>} 处理结果
   */
  async processImages(imageUrls, options = {}) {
    throw new Error(`${this.constructor.name}.processImages() 方法必须被实现`)
  }

  /**
   * 健康检查
   * @returns {Promise<Object>} 健康状态
   */
  async healthCheck() {
    if (!this.isInitialized) {
      return {
        status: 'uninitialized',
        adapter: this.name,
        message: '适配器未初始化'
      }
    }

    return {
      status: 'unknown',
      adapter: this.name,
      message: '健康检查未实现'
    }
  }

  /**
   * 获取模型信息
   * @returns {Object} 模型详细信息
   */
  getModelInfo() {
    return {
      name: this.name,
      type: this.type,
      version: this.version,
      isInitialized: this.isInitialized,
      capabilities: this.config.capabilities || [],
      config: this.sanitizeConfig(this.config),
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 获取性能指标
   * @returns {Object} 性能统计
   */
  getMetrics() {
    return {
      adapter: this.name,
      uptime: this.isInitialized ? Date.now() - this.initTime : 0,
      requestCount: this.requestCount || 0,
      successCount: this.successCount || 0,
      errorCount: this.errorCount || 0,
      lastRequestTime: this.lastRequestTime,
      averageResponseTime: this.averageResponseTime || 0
    }
  }

  /**
   * 清理敏感配置信息
   * @param {Object} config - 原始配置
   * @returns {Object} 清理后的配置
   */
  sanitizeConfig(config) {
    const sanitized = { ...config }

    // 移除敏感信息用于日志记录
    const sensitiveFields = ['secretId', 'secretKey', 'apiKey', 'password', 'token']

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = sanitized[field] ? '***' : 'undefined'
      }
    })

    return sanitized
  }

  /**
   * 统一错误处理
   * @param {Error} error - 错误对象
   * @param {string} operation - 操作名称
   * @returns {Object} 标准化错误响应
   */
  handleError(error, operation) {
    console.error(`❌ ${this.name} ${operation} 操作失败:`, error)

    this.errorCount = (this.errorCount || 0) + 1
    this.lastRequestTime = Date.now()

    return {
      success: false,
      error: {
        code: error.code || 'OPERATION_FAILED',
        message: error.message,
        type: error.constructor.name,
        operation,
        adapter: this.name,
        timestamp: new Date().toISOString()
      },
      adapter: this.getModelInfo()
    }
  }

  /**
   * 统一成功响应
   * @param {Object} data - 响应数据
   * @param {string} operation - 操作名称
   * @returns {Object} 标准化成功响应
   */
  handleSuccess(data, operation) {
    this.successCount = (this.successCount || 0) + 1
    this.lastRequestTime = Date.now()

    return {
      success: true,
      data,
      operation,
      adapter: this.getModelInfo(),
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 记录操作开始
   * @param {string} operation - 操作名称
   * @param {Object} params - 操作参数
   */
  logOperationStart(operation, params = {}) {
    this.requestCount = (this.requestCount || 0) + 1
    this.initTime = this.initTime || Date.now()

    console.log(`🚀 ${this.name} 开始 ${operation} 操作`, {
      params: this.sanitizeConfig(params),
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 记录操作结束
   * @param {string} operation - 操作名称
   * @param {number} duration - 操作耗时(ms)
   * @param {Object} result - 操作结果
   */
  logOperationEnd(operation, duration, result = {}) {
    this.averageResponseTime = this.updateAverageResponseTime(duration)

    console.log(`✅ ${this.name} ${operation} 操作完成`, {
      duration: `${duration}ms`,
      result: typeof result === 'object' ? 'success' : 'failure',
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 更新平均响应时间
   * @param {number} duration - 最新响应时间
   * @returns {number} 更新后的平均响应时间
   */
  updateAverageResponseTime(duration) {
    const current = this.averageResponseTime || 0
    const count = this.requestCount || 1
    return (current * (count - 1) + duration) / count
  }

  /**
   * 验证输入参数
   * @param {string} operation - 操作名称
   * @param {Object} params - 输入参数
   * @param {Object} schema - 验证规则
   * @returns {boolean} 验证结果
   */
  validateParams(operation, params, schema) {
    if (!schema) return true

    // 简单的参数验证逻辑
    for (const [key, rules] of Object.entries(schema)) {
      const value = params[key]

      if (rules.required && (value === undefined || value === null || value === '')) {
        throw new Error(`${operation} 缺少必需参数: ${key}`)
      }

      if (rules.type && typeof value !== rules.type) {
        throw new Error(`${operation} 参数类型错误: ${key} 期望 ${rules.type}, 实际 ${typeof value}`)
      }

      if (rules.min && value.length < rules.min) {
        throw new Error(`${operation} 参数长度不足: ${key} 最小长度 ${rules.min}`)
      }

      if (rules.max && value.length > rules.max) {
        throw new Error(`${operation} 参数长度超限: ${key} 最大长度 ${rules.max}`)
      }
    }

    return true
  }
}

module.exports = BaseModelAdapter