// 作品管理服务
const worksRepository = require('../repositories/worksRepository')
const taskRepository = require('../repositories/taskRepository')
const dateUtils = require('../utils/dateUtils')

class WorksService {
  
  /**
   * 获取用户作品列表
   */
  async getUserWorks({ userId, tab, onlyCompleted, pageSize, lastId, lastCreatedAt }) {
    try {
      // 构建查询条件
      const queryOptions = {
        userId,
        tab,
        onlyCompleted,
        pageSize,
        lastId,
        lastCreatedAt
      }

      const works = await worksRepository.getUserWorks(queryOptions)

      // 处理返回数据
      const processedWorks = works.map(work => this.processWorkData(work))

      return processedWorks

    } catch (error) {
      throw error
    }
  }
  
  /**
   * 获取作品详情
   */
  async getWorkDetail(workId, userId) {
    try {
      const work = await worksRepository.getWorkById(workId, userId)
      
      if (!work) {
        return null
      }
      
      return this.processWorkData(work)
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 删除作品
   */
  async deleteWork(workId, userId) {
    try {
      const result = await worksRepository.deleteWork(workId, userId)
      
      // 如果作品还在处理中，也要取消相关任务
      if (result) {
        await this.cancelRelatedTask(workId, userId)
      }
      
      return result
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 切换收藏状态
   */
  async toggleFavorite(workId, userId) {
    try {
      const work = await worksRepository.getWorkById(workId, userId)
      
      if (!work) {
        return null
      }
      
      const newFavoriteStatus = !work.is_favorite
      
      const result = await worksRepository.updateWork(workId, {
        is_favorite: newFavoriteStatus
      })
      
      return result ? newFavoriteStatus : null
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 取消任务
   */
  async cancelTask(taskId, userId) {
    try {
      // 查找相关作品
      const work = await worksRepository.getWorkByTaskId(taskId, userId)
      
      if (!work) {
        return false
      }
      
      // 更新任务状态
      await taskRepository.updateTaskStatus(taskId, 'cancelled')
      
      // 更新作品状态
      await worksRepository.updateWork(work._id, {
        status: 'cancelled'
      })
      
      // TODO: 这里可以调用外部API取消任务并退款
      
      return true
      
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 处理作品数据
   */
  processWorkData(work) {
    // 安全处理作品数据，防止 undefined 导致的 toString 错误
    if (!work) {
      return null
    }
    
    // 添加封面图片 - 安全处理
    let cover_url = null
    try {
      if (work.images && Array.isArray(work.images) && work.images.length > 0) {
        const firstImage = work.images[0]
        if (typeof firstImage === 'string') {
          cover_url = firstImage
        } else if (firstImage && firstImage.url) {
          cover_url = String(firstImage.url)
        }
      }
    } catch (error) {
      console.warn('处理封面图片失败:', error)
      cover_url = null
    }
      
    // 格式化时间 - 安全处理
    let created_time = null
    let display_time = null
    try {
      created_time = work.created_at || (work._id && work._id.getTimestamp ? work._id.getTimestamp() : new Date())
      display_time = dateUtils.formatDisplayTime(created_time)
    } catch (error) {
      console.warn('处理时间格式失败:', error)
      created_time = new Date()
      display_time = dateUtils.formatDisplayTime(created_time)
    }
    
    return {
      ...work,
      cover_url,
      created_time,
      display_time
    }
  }
  
  /**
   * 取消相关任务
   */
  async cancelRelatedTask(workId, userId) {
    try {
      const work = await worksRepository.getWorkById(workId, userId)
      
      if (work && work.task_id && work.status === 'processing') {
        await taskRepository.updateTaskStatus(work.task_id, 'cancelled')
      }
      
    } catch (error) {
      console.error('取消相关任务失败:', error)
      // 不抛出错误，避免影响主流程
    }
  }
}

module.exports = new WorksService()