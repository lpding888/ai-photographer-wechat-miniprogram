// 用户管理服务
const userRepository = require('../repositories/userRepository')
const worksRepository = require('../repositories/worksRepository')

class UserService {
  
  /**
   * 获取用户统计信息
   */
  async getUserStats(userId) {
    try {
      // 获取用户基本信息
      const user = await userRepository.getUserById(userId)
      
      if (!user) {
        throw new Error('用户不存在')
      }
      
      // 获取作品统计
      const workStats = await this.getWorkStats(userId)
      
      // 获取积分统计
      const creditStats = await this.getCreditStats(userId)
      
      return {
        user_info: {
          _id: user._id || null,
          openid: user.openid || null,
          nickname: user.nickname || null,
          avatar_url: user.avatar_url || null,
          credits: user.credits || 0,
          total_credits: user.total_credits || 0,
          register_time: user.register_time || null,
          last_login_time: user.last_login_time || null,
          last_checkin_date: user.last_checkin_date || "",
          invite_code: user.invite_code || null,
          invited_by: user.invited_by || null,
          status: user.status || null,
          total_consumed_credits: user.total_consumed_credits || 0,
          updated_at: user.updated_at || null
        },
        work_stats: workStats,
        credit_stats: creditStats
      }
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 更新用户偏好设置
   */
  async updateUserPreferences(userId, preferences) {
    try {
      // 验证偏好设置格式
      const validPreferences = this.validatePreferences(preferences)
      
      const result = await userRepository.updateUserPreferences(userId, validPreferences)
      
      return result
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 获取作品统计
   */
  async getWorkStats(userId) {
    try {
      const stats = await worksRepository.getUserWorkStats(userId)
      
      return {
        total_works: stats.total || 0,
        photography_works: stats.photography || 0,
        fitting_works: stats.fitting || 0,
        favorite_works: stats.favorites || 0,
        completed_works: stats.completed || 0,
        processing_works: stats.processing || 0
      }
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 获取积分统计
   */
  async getCreditStats(userId) {
    try {
      // 这里可以扩展更详细的积分统计
      const user = await userRepository.getUserById(userId)
      
      return {
        current_credits: user.credits || 0,
        total_earned: user.total_earned_credits || 0,
        total_consumed: user.total_consumed_credits || 0
      }
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 验证偏好设置
   */
  validatePreferences(preferences) {
    const allowedKeys = [
      'default_gender',
      'default_age',
      'default_height',
      'default_nationality',
      'default_skin_tone',
      'auto_save_params',
      'notification_enabled'
    ]
    
    const validPreferences = {}
    
    for (const [key, value] of Object.entries(preferences)) {
      if (allowedKeys.includes(key)) {
        validPreferences[key] = value
      }
    }
    
    return validPreferences
  }
}

module.exports = new UserService()