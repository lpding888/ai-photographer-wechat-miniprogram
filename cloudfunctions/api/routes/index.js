// 路由入口文件
const worksController = require('../controllers/worksController')
const userController = require('../controllers/userController')
const response = require('../utils/response')

class Router {
  async handle(event, context) {
    const { action } = event
    
    try {
      switch (action) {
        // 作品相关路由
        case 'listWorks':
          return await worksController.listWorks(event, context)
        case 'getWorkDetail':
          return await worksController.getWorkDetail(event, context)
        case 'deleteWork':
          return await worksController.deleteWork(event, context)
        case 'toggleFavorite':
          return await worksController.toggleFavorite(event, context)
        case 'cancelTask':
          return await worksController.cancelTask(event, context)
          
        // 用户相关路由
        case 'getUserStats':
          return await userController.getUserStats(event, context)
        case 'updateUserPreferences':
          return await userController.updateUserPreferences(event, context)
          
        default:
          return response.error(`未知操作: ${action}`, 400)
      }
    } catch (error) {
      throw error
    }
  }
}

module.exports = new Router()