/**
 * 数据验证工具类
 * 提供统一的参数验证和数据校验功能
 */

class Validator {
  /**
   * 验证必需参数
   * @param {Object} data - 待验证数据
   * @param {Array} requiredFields - 必需字段列表
   * @throws {Error} 验证失败时抛出错误
   */
  static validateRequired(data, requiredFields) {
    const missing = []

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        missing.push(field)
      }
    }

    if (missing.length > 0) {
      throw new Error(`缺少必需参数: ${missing.join(', ')}`)
    }
  }

  /**
   * 验证字符串参数
   * @param {string} value - 待验证值
   * @param {string} fieldName - 字段名
   * @param {Object} options - 验证选项
   */
  static validateString(value, fieldName, options = {}) {
    const { minLength = 0, maxLength = Infinity, pattern = null } = options

    if (typeof value !== 'string') {
      throw new Error(`${fieldName}必须是字符串`)
    }

    if (value.length < minLength) {
      throw new Error(`${fieldName}长度不能小于${minLength}字符`)
    }

    if (value.length > maxLength) {
      throw new Error(`${fieldName}长度不能超过${maxLength}字符`)
    }

    if (pattern && !pattern.test(value)) {
      throw new Error(`${fieldName}格式不正确`)
    }
  }

  /**
   * 验证数组参数
   * @param {Array} value - 待验证值
   * @param {string} fieldName - 字段名
   * @param {Object} options - 验证选项
   */
  static validateArray(value, fieldName, options = {}) {
    const { minLength = 0, maxLength = Infinity, itemValidator = null } = options

    if (!Array.isArray(value)) {
      throw new Error(`${fieldName}必须是数组`)
    }

    if (value.length < minLength) {
      throw new Error(`${fieldName}数组长度不能小于${minLength}`)
    }

    if (value.length > maxLength) {
      throw new Error(`${fieldName}数组长度不能超过${maxLength}`)
    }

    if (itemValidator) {
      value.forEach((item, index) => {
        try {
          itemValidator(item)
        } catch (error) {
          throw new Error(`${fieldName}[${index}]: ${error.message}`)
        }
      })
    }
  }

  /**
   * 验证图片ID
   * @param {string} imageId - 图片ID
   */
  static validateImageId(imageId) {
    if (typeof imageId !== 'string' || imageId.length === 0) {
      throw new Error('图片ID不能为空')
    }

    // 基本格式验证
    if (!/^[a-zA-Z0-9_-]+$/.test(imageId)) {
      throw new Error('图片ID格式不正确')
    }
  }

  /**
   * 验证图片数据
   * @param {Object} imageData - 图片数据
   */
  static validateImageData(imageData) {
    if (!imageData) {
      throw new Error('图片数据不能为空')
    }

    // 检查是否有有效的图片数据
    const hasBuffer = Buffer.isBuffer(imageData) || Buffer.isBuffer(imageData.buffer)
    const hasBase64 = imageData.base64 || (imageData.url && imageData.url.startsWith('data:image/'))

    if (!hasBuffer && !hasBase64) {
      throw new Error('图片数据格式无效：需要buffer或base64数据')
    }

    // 验证base64格式
    if (imageData.url && imageData.url.startsWith('data:image/')) {
      const matches = imageData.url.match(/^data:image\/([^;]+);base64,(.+)$/)
      if (!matches) {
        throw new Error('base64图片数据格式无效')
      }
    }
  }

  /**
   * 验证AI模型参数
   * @param {Object} parameters - AI参数
   */
  static validateAIParameters(parameters) {
    if (!parameters || typeof parameters !== 'object') {
      throw new Error('AI参数必须是对象')
    }

    // 验证图片数量
    if (parameters.count && (typeof parameters.count !== 'number' || parameters.count < 1 || parameters.count > 10)) {
      throw new Error('生成图片数量必须在1-10之间')
    }

    // 验证图片尺寸
    if (parameters.width && (typeof parameters.width !== 'number' || parameters.width < 256 || parameters.width > 4096)) {
      throw new Error('图片宽度必须在256-4096之间')
    }

    if (parameters.height && (typeof parameters.height !== 'number' || parameters.height < 256 || parameters.height > 4096)) {
      throw new Error('图片高度必须在256-4096之间')
    }

    // 验证质量参数
    if (parameters.quality && (typeof parameters.quality !== 'number' || parameters.quality < 0.1 || parameters.quality > 1)) {
      throw new Error('图片质量必须在0.1-1之间')
    }
  }

  /**
   * 验证水印参数
   * @param {Object} options - 水印选项
   */
  static validateWatermarkOptions(options) {
    if (!options || typeof options !== 'object') {
      return // 水印参数是可选的
    }

    if (options.text) {
      this.validateString(options.text, '水印文字', { maxLength: 50 })
    }

    if (options.position) {
      const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'top-center', 'bottom-center']
      if (!validPositions.includes(options.position)) {
        throw new Error(`无效的水印位置: ${options.position}`)
      }
    }

    if (options.fontSize && (typeof options.fontSize !== 'number' || options.fontSize < 8 || options.fontSize > 128)) {
      throw new Error('水印字体大小必须在8-128之间')
    }

    if (options.padding && (typeof options.padding !== 'number' || options.padding < 0 || options.padding > 100)) {
      throw new Error('水印边距必须在0-100之间')
    }

    if (options.quality && (typeof options.quality !== 'number' || options.quality < 50 || options.quality > 100)) {
      throw new Error('水印质量必须在50-100之间')
    }
  }

  /**
   * 验证任务配置
   * @param {Object} task - 任务配置
   */
  static validateTask(task) {
    // 验证必需字段
    this.validateRequired(task, ['taskId', 'prompt', 'type'])

    // 验证任务ID
    this.validateString(task.taskId, '任务ID', { minLength: 1, maxLength: 100 })

    // 验证提示词
    this.validateString(task.prompt, '提示词', { minLength: 1, maxLength: 2000 })

    // 验证类型
    const validTypes = ['photography', 'fitting', 'text-to-image']
    if (!validTypes.includes(task.type)) {
      throw new Error(`无效的任务类型: ${task.type}`)
    }

    // 验证图片ID数组（可选）
    if (task.imageIds) {
      this.validateArray(task.imageIds, '图片ID列表', {
        maxLength: 10,
        itemValidator: this.validateImageId
      })
    }

    // 验证AI参数（可选）
    if (task.parameters) {
      this.validateAIParameters(task.parameters)
    }
  }

  /**
   * 验证文件ID
   * @param {string} fileId - 文件ID
   */
  static validateFileId(fileId) {
    if (typeof fileId !== 'string' || fileId.length === 0) {
      throw new Error('文件ID不能为空')
    }

    // 微信云存储文件ID基本格式验证
    if (fileId.length < 10 || fileId.length > 200) {
      throw new Error('文件ID长度不正确')
    }
  }

  /**
   * 验证上传配置
   * @param {Object} config - 上传配置
   */
  static validateUploadConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('上传配置不能为空')
    }

    if (config.taskId) {
      this.validateString(config.taskId, '任务ID')
    }

    if (config.type) {
      this.validateString(config.type, '文件类型')
    }

    if (config.maxConcurrency && (typeof config.maxConcurrency !== 'number' || config.maxConcurrency < 1 || config.maxConcurrency > 10)) {
      throw new Error('最大并发数必须在1-10之间')
    }
  }

  /**
   * 安全验证：检查潜在的安全问题
   * @param {string} text - 待检查文本
   */
  static validateSecurity(text) {
    if (typeof text !== 'string') {
      return
    }

    // 检查恶意脚本
    const scriptPatterns = [
      /<script[\s\S]*?>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /function\s*\(/i
    ]

    for (const pattern of scriptPatterns) {
      if (pattern.test(text)) {
        throw new Error('检测到潜在的安全风险内容')
      }
    }

    // 检查路径遍历
    if (text.includes('../') || text.includes('..\\')) {
      throw new Error('检测到路径遍历风险')
    }

    // 检查SQL注入基本模式
    const sqlPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /delete\s+from/i,
      /insert\s+into/i,
      /update\s+set/i
    ]

    for (const pattern of sqlPatterns) {
      if (pattern.test(text)) {
        throw new Error('检测到潜在的SQL注入风险')
      }
    }
  }

  /**
   * 批量验证
   * @param {Array} validations - 验证函数数组
   */
  static validateBatch(validations) {
    const errors = []

    for (const validation of validations) {
      try {
        validation()
      } catch (error) {
        errors.push(error.message)
      }
    }

    if (errors.length > 0) {
      throw new Error(`验证失败: ${errors.join('; ')}`)
    }
  }
}

module.exports = Validator