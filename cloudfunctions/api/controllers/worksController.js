// 作品管理控制器
const cloud = require('wx-server-sdk')
const worksService = require('../services/worksService')
const response = require('../utils/response')
const validator = require('../utils/validator')

class WorksController {
  
  /**
   * 分页获取作品列表
   */
  async listWorks(event, context) {
    try {
      const {
        tab = 'all',
        onlyCompleted = false,
        pageSize = 12,
        last_id = null,
        last_created_at = null
      } = event

      // 安全获取微信上下文
      let OPENID = null
      try {
        const wxContext = cloud.getWXContext()
        OPENID = wxContext ? wxContext.OPENID : null
      } catch (e) {
        console.error('Failed to get WX context in listWorks:', e)
        return response.error('用户身份验证失败，请重新登录', 401)
      }

      if (!OPENID) {
        return response.error('用户未登录', 401)
      }

      // 参数验证
      const validationResult = validator.validateListWorks({ tab, pageSize })
      if (!validationResult.isValid) {
        return response.error(validationResult.message, 400)
      }

      const result = await worksService.getUserWorks({
        userId: OPENID,
        tab,
        onlyCompleted,
        pageSize,
        lastId: last_id,
        lastCreatedAt: last_created_at
      })

      return response.success(result, '获取作品列表成功')

    } catch (error) {
      console.error('获取作品列表失败:', error)
      return response.error('获取作品列表失败', 500)
    }
  }
  
  /**
   * 获取作品详情
   */
  async getWorkDetail(event, context) {
    try {
      const { workId } = event
      
      // 安全获取微信上下文
      let OPENID = null
      try {
        const wxContext = cloud.getWXContext()
        OPENID = wxContext ? wxContext.OPENID : null
      } catch (e) {
        console.error('Failed to get WX context in getWorkDetail:', e)
        return response.error('用户身份验证失败，请重新登录', 401)
      }
      
      if (!OPENID) {
        return response.error('用户未登录', 401)
      }
      
      if (!workId) {
        return response.error('作品ID不能为空', 400)
      }
      
      const result = await worksService.getWorkDetail(workId, OPENID)
      
      if (!result) {
        return response.error('作品不存在或无权限访问', 404)
      }
      
      return response.success(result, '获取作品详情成功')
      
    } catch (error) {
      console.error('获取作品详情失败:', error)
      return response.error('获取作品详情失败', 500)
    }
  }
  
  /**
   * 删除作品
   */
  async deleteWork(event, context) {
    try {
      const { workId } = event
      
      // 安全获取微信上下文
      let OPENID = null
      try {
        const wxContext = cloud.getWXContext()
        OPENID = wxContext ? wxContext.OPENID : null
      } catch (e) {
        console.error('Failed to get WX context in deleteWork:', e)
        return response.error('用户身份验证失败，请重新登录', 401)
      }
      
      if (!OPENID) {
        return response.error('用户未登录', 401)
      }
      
      if (!workId) {
        return response.error('作品ID不能为空', 400)
      }
      
      const result = await worksService.deleteWork(workId, OPENID)
      
      if (!result) {
        return response.error('作品不存在或无权限删除', 404)
      }
      
      return response.success(null, '删除作品成功')
      
    } catch (error) {
      console.error('删除作品失败:', error)
      return response.error('删除作品失败', 500)
    }
  }
  
  /**
   * 切换收藏状态
   */
  async toggleFavorite(event, context) {
    try {
      const { workId } = event
      
      // 安全获取微信上下文
      let OPENID = null
      try {
        const wxContext = cloud.getWXContext()
        OPENID = wxContext ? wxContext.OPENID : null
      } catch (e) {
        console.error('Failed to get WX context in toggleFavorite:', e)
        return response.error('用户身份验证失败，请重新登录', 401)
      }
      
      if (!OPENID) {
        return response.error('用户未登录', 401)
      }
      
      if (!workId) {
        return response.error('作品ID不能为空', 400)
      }
      
      const result = await worksService.toggleFavorite(workId, OPENID)
      
      if (result === null) {
        return response.error('作品不存在或无权限操作', 404)
      }
      
      const message = result ? '已添加到收藏' : '已取消收藏'
      return response.success({ is_favorite: result }, message)
      
    } catch (error) {
      console.error('切换收藏状态失败:', error)
      return response.error('操作失败', 500)
    }
  }
  
  /**
   * 取消任务
   */
  async cancelTask(event, context) {
    try {
      const { task_id } = event
      
      // 安全获取微信上下文
      let OPENID = null
      try {
        const wxContext = cloud.getWXContext()
        OPENID = wxContext ? wxContext.OPENID : null
      } catch (e) {
        console.error('Failed to get WX context in cancelTask:', e)
        return response.error('用户身份验证失败，请重新登录', 401)
      }
      
      if (!OPENID) {
        return response.error('用户未登录', 401)
      }
      
      if (!task_id) {
        return response.error('任务ID不能为空', 400)
      }
      
      const result = await worksService.cancelTask(task_id, OPENID)
      
      if (!result) {
        return response.error('任务不存在或无权限取消', 404)
      }
      
      return response.success(null, '任务已取消')
      
    } catch (error) {
      console.error('取消任务失败:', error)
      return response.error('取消任务失败', 500)
    }
  }
}

module.exports = new WorksController()