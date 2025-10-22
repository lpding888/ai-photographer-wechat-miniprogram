// 统一响应工具
class Response {
  
  /**
   * 成功响应
   */
  success(data = null, message = '操作成功', code = 200) {
    return {
      success: true,
      data: data,
      message: message,
      code: code,
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * 错误响应
   */
  error(message = '操作失败', code = 500, data = null) {
    return {
      success: false,
      message: message,
      code: code,
      data: data,
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * 分页响应
   */
  paginated(data, pagination, message = '获取成功') {
    return {
      success: true,
      data: data,
      pagination: pagination,
      message: message,
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * 验证错误响应
   */
  validationError(errors, message = '参数验证失败') {
    return {
      success: false,
      message: message,
      errors: errors,
      code: 400,
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * 未授权响应
   */
  unauthorized(message = '未授权访问') {
    return {
      success: false,
      message: message,
      code: 401,
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * 未找到响应
   */
  notFound(message = '资源不存在') {
    return {
      success: false,
      message: message,
      code: 404,
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * 服务器错误响应
   */
  serverError(message = '服务器内部错误') {
    return {
      success: false,
      message: message,
      code: 500,
      timestamp: new Date().toISOString()
    }
  }
}

module.exports = new Response()