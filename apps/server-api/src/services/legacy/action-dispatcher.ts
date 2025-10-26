/**
 * Action Dispatcher - 遗留系统动作分发器
 * 用于处理微信小程序的云函数请求
 */

export interface ActionContext {
  OPENID: string
  APPID?: string
  UNIONID?: string
  environment?: string
  userID?: string
  [key: string]: any
}

export interface ActionResult<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
  code?: string
}

/**
 * 动作分发器基类
 */
export abstract class BaseActionDispatcher {
  protected context: ActionContext

  constructor(context: ActionContext) {
    this.context = context
  }

  abstract dispatch(action: string, data: any): Promise<ActionResult>
}

/**
 * 遗留云函数分发器
 * 兼容微信小程序云函数的请求格式
 */
export class LegacyActionDispatcher extends BaseActionDispatcher {
  async dispatch(action: string, data: any): Promise<ActionResult> {
    try {
      console.log(`[LegacyActionDispatcher] Dispatching action: ${action}`, {
        OPENID: this.context.OPENID,
        data
      })

      // 根据action分发到不同的处理函数
      switch (action) {
        case 'getUserInfo':
          return await this.getUserInfo(data)
        case 'updateUserProfile':
          return await this.updateUserProfile(data)
        case 'getWorks':
          return await this.getWorks(data)
        case 'createWork':
          return await this.createWork(data)
        case 'deleteWork':
          return await this.deleteWork(data)
        default:
          return {
            success: false,
            error: `Unknown action: ${action}`,
            code: 'UNKNOWN_ACTION'
          }
      }
    } catch (error: any) {
      console.error(`[LegacyActionDispatcher] Error in action ${action}:`, error)
      return {
        success: false,
        error: error.message || 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    }
  }

  private async getUserInfo(data: any): Promise<ActionResult> {
    // 模拟获取用户信息
    return {
      success: true,
      data: {
        openid: this.context.OPENID,
        nickname: '测试用户',
        avatarUrl: 'https://via.placeholder.com/100',
        credits: 100,
        status: 'active'
      }
    }
  }

  private async updateUserProfile(data: any): Promise<ActionResult> {
    // 模拟更新用户信息
    return {
      success: true,
      data: {
        ...data,
        updatedAt: new Date().toISOString()
      }
    }
  }

  private async getWorks(data: any): Promise<ActionResult> {
    // 模拟获取作品列表
    return {
      success: true,
      data: {
        works: [],
        total: 0,
        page: data.page || 1,
        limit: data.limit || 20
      }
    }
  }

  private async createWork(data: any): Promise<ActionResult> {
    // 模拟创建作品
    return {
      success: true,
      data: {
        id: `work_${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString()
      }
    }
  }

  private async deleteWork(data: any): Promise<ActionResult> {
    // 模拟删除作品
    return {
      success: true,
      data: {
        deleted: true,
        workId: data.workId
      }
    }
  }
}

/**
 * 创建动作分发器实例
 */
export function createActionDispatcher(context: ActionContext): BaseActionDispatcher {
  return new LegacyActionDispatcher(context)
}

/**
 * 派发遗留动作的便捷函数
 */
export async function dispatchLegacyAction(
  action: string,
  data: any,
  context: ActionContext
): Promise<ActionResult> {
  const dispatcher = createActionDispatcher(context)
  return await dispatcher.dispatch(action, data)
}

/**
 * 微信云函数入口包装器
 */
export function wrapCloudFunction(handler: (action: string, data: any, context: ActionContext) => Promise<ActionResult>) {
  return async (event: any, context: any) => {
    const { action, ...data } = event
    const wxContext = {
      OPENID: context.OPENID || 'demo_openid',
      APPID: context.APPID || 'demo_appid',
      UNIONID: context.UNIONID,
      environment: context.environment || 'development',
      userID: context.userID,
      ...context
    }

    try {
      const result = await handler(action, data, wxContext)
      return {
        errCode: result.success ? 0 : -1,
        errMsg: result.message || (result.success ? 'success' : result.error),
        ...result.data ? { data: result.data } : {}
      }
    } catch (error: any) {
      console.error('Cloud function error:', error)
      return {
        errCode: -1,
        errMsg: error.message || 'Internal server error'
      }
    }
  }
}