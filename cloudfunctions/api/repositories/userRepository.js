// 用户数据访问层
const BaseRepository = require('./baseRepository')

class UserRepository extends BaseRepository {
  constructor() {
    super('users')
  }
  
  /**
   * 根据用户ID获取用户信息
   */
  async getUserById(userId) {
    try {
      const result = await this.collection
        .where({ openid: userId })
        .get()
      
      return result.data.length > 0 ? result.data[0] : null
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 创建用户
   */
  async createUser(userData) {
    try {
      const result = await this.collection.add({
        data: {
          ...userData,
          credits: userData.credits || 0,
          total_earned_credits: 0,
          total_consumed_credits: 0,
          preferences: {},
          created_at: new Date(),
          updated_at: new Date()
        }
      })
      
      return result._id
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 更新用户信息
   */
  async updateUser(userId, updateData) {
    try {
      const result = await this.collection
        .where({ openid: userId })
        .update({
          data: {
            ...updateData,
            updated_at: new Date()
          }
        })
      
      return result.stats.updated > 0
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 更新用户偏好设置
   */
  async updateUserPreferences(userId, preferences) {
    try {
      const result = await this.collection
        .where({ openid: userId })
        .update({
          data: {
            preferences: preferences,
            updated_at: new Date()
          }
        })
      
      return result.stats.updated > 0
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 更新用户积分
   */
  async updateUserCredits(userId, creditChange, operation = 'consume') {
    try {
      const user = await this.getUserById(userId)
      
      if (!user) {
        throw new Error('用户不存在')
      }
      
      const newCredits = Math.max(0, user.credits + creditChange)
      
      const updateData = {
        credits: newCredits,
        updated_at: new Date()
      }
      
      // 更新累计统计
      if (operation === 'earn' && creditChange > 0) {
        updateData.total_earned_credits = (user.total_earned_credits || 0) + creditChange
      } else if (operation === 'consume' && creditChange < 0) {
        updateData.total_consumed_credits = (user.total_consumed_credits || 0) + Math.abs(creditChange)
      }
      
      const result = await this.collection
        .where({ openid: userId })
        .update({
          data: updateData
        })
      
      return result.stats.updated > 0
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 检查用户积分是否足够
   */
  async checkUserCredits(userId, requiredCredits) {
    try {
      const user = await this.getUserById(userId)
      
      if (!user) {
        return false
      }
      
      return user.credits >= requiredCredits
      
    } catch (error) {
      throw error
    }
  }
}

module.exports = new UserRepository()