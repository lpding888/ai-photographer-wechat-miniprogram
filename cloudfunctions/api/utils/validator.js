// 参数验证工具
class Validator {
  
  /**
   * 验证作品列表参数
   */
  validateListWorks(params) {
    // 安全处理参数
    const safeParams = params || {}
    const { tab, pageSize } = safeParams
    const errors = []
    
    // 验证tab参数
    const validTabs = ['all', 'photography', 'fitting', 'favorite']
    if (tab && !validTabs.includes(String(tab))) {
      errors.push('tab参数无效，必须是: ' + validTabs.join(', '))
    }
    
    // 验证pageSize参数
    const numPageSize = Number(pageSize)
    if (pageSize !== undefined && (isNaN(numPageSize) || numPageSize <= 0 || numPageSize > 50)) {
      errors.push('pageSize必须是1-50之间的数字')
    }
    
    return {
      isValid: errors.length === 0,
      message: errors.join('; ')
    }
  }
  
  /**
   * 验证用户ID
   */
  validateUserId(userId) {
    const safeUserId = userId !== undefined && userId !== null ? String(userId) : ''
    if (!safeUserId || safeUserId.trim() === '') {
      return {
        isValid: false,
        message: '用户ID不能为空'
      }
    }
    
    return {
      isValid: true,
      message: ''
    }
  }
  
  /**
   * 验证作品ID
   */
  validateWorkId(workId) {
    const safeWorkId = workId !== undefined && workId !== null ? String(workId) : ''
    if (!safeWorkId || safeWorkId.trim() === '') {
      return {
        isValid: false,
        message: '作品ID不能为空'
      }
    }
    
    return {
      isValid: true,
      message: ''
    }
  }
  
  /**
   * 验证任务ID
   */
  validateTaskId(taskId) {
    const safeTaskId = taskId !== undefined && taskId !== null ? String(taskId) : ''
    if (!safeTaskId || safeTaskId.trim() === '') {
      return {
        isValid: false,
        message: '任务ID不能为空'
      }
    }
    
    return {
      isValid: true,
      message: ''
    }
  }
  
  /**
   * 验证邮箱格式
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    
    if (!email) {
      return {
        isValid: false,
        message: '邮箱不能为空'
      }
    }
    
    if (!emailRegex.test(email)) {
      return {
        isValid: false,
        message: '邮箱格式不正确'
      }
    }
    
    return {
      isValid: true,
      message: ''
    }
  }
  
  /**
   * 验证手机号格式
   */
  validatePhone(phone) {
    const phoneRegex = /^1[3-9]\d{9}$/
    
    if (!phone) {
      return {
        isValid: false,
        message: '手机号不能为空'
      }
    }
    
    if (!phoneRegex.test(phone)) {
      return {
        isValid: false,
        message: '手机号格式不正确'
      }
    }
    
    return {
      isValid: true,
      message: ''
    }
  }
  
  /**
   * 验证必填字段
   */
  validateRequired(value, fieldName) {
    const safeFieldName = String(fieldName || '字段')
    if (value === undefined || value === null || value === '') {
      return {
        isValid: false,
        message: `${safeFieldName}不能为空`
      }
    }
    
    return {
      isValid: true,
      message: ''
    }
  }
  
  /**
   * 验证字符串长度
   */
  validateStringLength(value, min, max, fieldName) {
    const safeFieldName = String(fieldName || '字段')
    const safeMin = Number(min) || 0
    const safeMax = Number(max) || 0
    
    if (typeof value !== 'string') {
      return {
        isValid: false,
        message: `${safeFieldName}必须是字符串`
      }
    }
    
    if (value.length < safeMin || value.length > safeMax) {
      return {
        isValid: false,
        message: `${safeFieldName}长度必须在${safeMin}-${safeMax}之间`
      }
    }
    
    return {
      isValid: true,
      message: ''
    }
  }
  
  /**
   * 验证数字范围
   */
  validateNumberRange(value, min, max, fieldName) {
    const safeFieldName = String(fieldName || '字段')
    const safeMin = Number(min) || 0
    const safeMax = Number(max) || 0
    
    if (typeof value !== 'number' || isNaN(value)) {
      return {
        isValid: false,
        message: `${safeFieldName}必须是数字`
      }
    }
    
    if (value < safeMin || value > safeMax) {
      return {
        isValid: false,
        message: `${safeFieldName}必须在${safeMin}-${safeMax}之间`
      }
    }
    
    return {
      isValid: true,
      message: ''
    }
  }
}

module.exports = new Validator()