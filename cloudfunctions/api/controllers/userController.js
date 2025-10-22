// 用户管理控制器
const cloud = require('wx-server-sdk')
const userService = require('../services/userService')
const response = require('../utils/response')

class UserController {
  
  /**
   * 获取用户统计信息
   */
  async getUserStats(event, context) {
    try {
      // 安全获取微信上下文
      let OPENID = null
      try {
        const wxContext = cloud.getWXContext()
        OPENID = wxContext ? wxContext.OPENID : null
      } catch (e) {
        console.error('Failed to get WX context in getUserStats:', e)
        return response.error('用户身份验证失败，请重新登录', 401)
      }
      
      if (!OPENID) {
        return response.error('用户未登录', 401)
      }
      
      const result = await userService.getUserStats(OPENID)
      
      return response.success(result, '获取用户统计成功')
      
    } catch (error) {
      console.error('获取用户统计失败:', error)
      return response.error('获取用户统计失败', 500)
    }
  }
  
  /**
   * 更新用户偏好设置
   */
  async updateUserPreferences(event, context) {
    try {
      const { preferences } = event
      
      // 安全获取微信上下文
      let OPENID = null
      try {
        const wxContext = cloud.getWXContext()
        OPENID = wxContext ? wxContext.OPENID : null
      } catch (e) {
        console.error('Failed to get WX context in updateUserPreferences:', e)
        return response.error('用户身份验证失败，请重新登录', 401)
      }
      
      if (!OPENID) {
        return response.error('用户未登录', 401)
      }
      
      if (!preferences || typeof preferences !== 'object') {
        return response.error('偏好设置参数无效', 400)
      }
      
      const result = await userService.updateUserPreferences(OPENID, preferences)
      
      return response.success(result, '更新偏好设置成功')
      
    } catch (error) {
      console.error('更新用户偏好失败:', error)
      return response.error('更新偏好设置失败', 500)
    }
  }
}

module.exports = new UserController()