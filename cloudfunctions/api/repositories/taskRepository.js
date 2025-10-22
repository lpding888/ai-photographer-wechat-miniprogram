// 任务数据访问层
const BaseRepository = require('./baseRepository')

class TaskRepository extends BaseRepository {
  constructor() {
    super('task_queue')
  }
  
  /**
   * 创建任务
   */
  async createTask(taskData) {
    try {
      const result = await this.collection.add({
        data: {
          ...taskData,
          status: 'pending',
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
   * 更新任务状态
   */
  async updateTaskStatus(taskId, status, result = null) {
    try {
      const updateData = {
        status: status,
        updated_at: new Date()
      }
      
      if (result) {
        updateData.result = result
      }
      
      const updateResult = await this.collection
        .doc(taskId)
        .update({
          data: updateData
        })
      
      return updateResult.stats.updated > 0
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 根据任务ID获取任务
   */
  async getTaskById(taskId) {
    try {
      const result = await this.collection.doc(taskId).get()
      return result.data
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 获取用户的待处理任务
   */
  async getUserPendingTasks(userId) {
    try {
      const db = require('wx-server-sdk').database()
      const _ = db.command
      
      const result = await this.collection
        .where({
          user_openid: userId,
          status: _.in(['pending', 'processing'])
        })
        .orderBy('created_at', 'desc')
        .get()
      
      return result.data
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 获取需要处理的任务
   */
  async getTasksToProcess(limit = 10) {
    try {
      const result = await this.collection
        .where({
          status: 'pending'
        })
        .orderBy('created_at', 'asc')
        .limit(limit)
        .get()
      
      return result.data
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 清理过期任务
   */
  async cleanupExpiredTasks(expireHours = 24) {
    try {
      const db = require('wx-server-sdk').database()
      const _ = db.command
      
      const expireTime = new Date(Date.now() - expireHours * 60 * 60 * 1000)
      
      const result = await this.collection
        .where({
          status: _.in(['pending', 'processing']),
          created_at: _.lt(expireTime)
        })
        .update({
          data: {
            status: 'expired',
            updated_at: new Date()
          }
        })
      
      return result.stats.updated
      
    } catch (error) {
      throw error
    }
  }
}

module.exports = new TaskRepository()