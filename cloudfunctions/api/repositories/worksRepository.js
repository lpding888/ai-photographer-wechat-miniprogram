// 作品数据访问层
const cloud = require('wx-server-sdk')
const BaseRepository = require('./baseRepository')

class WorksRepository extends BaseRepository {
  constructor() {
    super('works')
  }
  
  /**
   * 获取用户作品列表
   */
  async getUserWorks({ userId, tab, onlyCompleted, pageSize, lastId, lastCreatedAt }) {
    try {
      const db = cloud.database()
      const _ = db.command

      // 构建查询条件
      let query = { user_openid: userId }

      // 按类型筛选
      if (tab === 'photography') {
        query.type = 'photography'
      } else if (tab === 'fitting') {
        query.type = 'fitting'
      } else if (tab === 'favorite') {
        query.is_favorite = true
      }

      // 只显示已完成的作品
      if (onlyCompleted) {
        query.status = 'completed'
      }

      // 分页查询：优先使用 created_at 时间戳分页，兜底使用 _id 分页
      if (lastCreatedAt) {
        query.created_at = _.lt(new Date(lastCreatedAt))
      } else if (lastId) {
        // 兼容旧版分页方式
        query._id = _.lt(lastId)
      }

      const result = await this.collection
        .where(query)
        .orderBy('created_at', 'desc')
        .limit(pageSize)
        .get()

      return result.data

    } catch (error) {
      throw error
    }
  }
  
  /**
   * 根据ID获取作品
   */
  async getWorkById(workId, userId) {
    try {
      const result = await this.collection
        .where({
          _id: workId,
          user_openid: userId
        })
        .get()
      
      return result.data.length > 0 ? result.data[0] : null
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 根据任务ID获取作品
   */
  async getWorkByTaskId(taskId, userId) {
    try {
      const result = await this.collection
        .where({
          task_id: taskId,
          user_openid: userId
        })
        .get()
      
      return result.data.length > 0 ? result.data[0] : null
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 删除作品
   */
  async deleteWork(workId, userId) {
    try {
      const result = await this.collection
        .where({
          _id: workId,
          user_openid: userId
        })
        .remove()
      
      return result.stats.removed > 0
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 更新作品
   */
  async updateWork(workId, updateData) {
    try {
      const result = await this.collection
        .doc(workId)
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
   * 获取用户作品统计
   */
  async getUserWorkStats(userId) {
    try {
      const db = cloud.database()
      
      // 总作品数
      const totalResult = await this.collection
        .where({ user_openid: userId })
        .count()
      
      // 摄影作品数
      const photographyResult = await this.collection
        .where({ 
          user_openid: userId,
          type: 'photography'
        })
        .count()
      
      // 试衣作品数
      const fittingResult = await this.collection
        .where({ 
          user_openid: userId,
          type: 'fitting'
        })
        .count()
      
      // 收藏作品数
      const favoriteResult = await this.collection
        .where({ 
          user_openid: userId,
          is_favorite: true
        })
        .count()
      
      // 已完成作品数
      const completedResult = await this.collection
        .where({ 
          user_openid: userId,
          status: 'completed'
        })
        .count()
      
      // 处理中作品数
      const processingResult = await this.collection
        .where({ 
          user_openid: userId,
          status: 'processing'
        })
        .count()
      
      return {
        total: totalResult.total,
        photography: photographyResult.total,
        fitting: fittingResult.total,
        favorites: favoriteResult.total,
        completed: completedResult.total,
        processing: processingResult.total
      }
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 创建作品
   */
  async createWork(workData) {
    try {
      const result = await this.collection.add({
        data: {
          ...workData,
          created_at: new Date(),
          updated_at: new Date()
        }
      })
      
      return result._id
      
    } catch (error) {
      throw error
    }
  }
}

module.exports = new WorksRepository()