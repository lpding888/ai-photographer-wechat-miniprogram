/**
 * AI模型管理模块
 * 负责：模型CRUD操作、权限管理、状态切换
 */

const cloud = require('wx-server-sdk')
const Logger = require('../utils/logger')
const Validator = require('../utils/validator')

class ModelManager {
  constructor() {
    this.db = cloud.database()
    this.logger = new Logger('ModelManager')
  }

  /**
   * 获取可用AI模型列表
   */
  async listModels(event) {
    try {
      const { model_type, provider, status } = event

      let query = {}

      if (model_type) {
        query.type = model_type
      }

      if (provider) {
        query.provider = provider
      }

      if (status !== undefined) {
        query.status = status
      }

      const result = await this.db.collection('api_configs')
        .where(query)
        .orderBy('priority', 'desc')
        .orderBy('weight', 'desc')
        .get()

      this.logger.info('获取AI模型列表成功', { count: result.data.length, query })

      return {
        success: true,
        data: result.data,
        message: '获取AI模型列表成功'
      }

    } catch (error) {
      this.logger.error('获取AI模型列表失败', { error: error.message })
      return {
        success: false,
        message: '获取AI模型列表失败'
      }
    }
  }

  /**
   * 获取单个AI模型详情
   */
  async getModel(event) {
    try {
      const { model_id } = event

      if (!model_id) {
        return {
          success: false,
          message: '模型ID不能为空'
        }
      }

      const result = await this.db.collection('api_configs')
        .doc(model_id)
        .get()

      if (!result.data) {
        return {
          success: false,
          message: '模型不存在'
        }
      }

      this.logger.info('获取模型详情成功', { model_id, name: result.data.name })

      return {
        success: true,
        data: result.data,
        message: '获取模型详情成功'
      }

    } catch (error) {
      this.logger.error('获取模型详情失败', { model_id: event.model_id, error: error.message })
      return {
        success: false,
        message: '获取模型详情失败'
      }
    }
  }

  /**
   * 添加新AI模型
   */
  async addModel(event) {
    try {
      const { model_data } = event

      if (!model_data) {
        return {
          success: false,
          message: '模型数据不能为空'
        }
      }

      // 验证必需字段
      const requiredFields = ['name', 'provider', 'model_type', 'api_format', 'api_url', 'api_key']
      for (const field of requiredFields) {
        if (!model_data[field]) {
          return {
            success: false,
            message: `缺少必需字段: ${field}`
          }
        }
      }

      // 验证数据格式
      Validator.validateString(model_data.name, '模型名称', { maxLength: 100 })
      Validator.validateString(model_data.provider, '提供商', { maxLength: 50 })
      Validator.validateString(model_data.api_url, 'API地址', { maxLength: 500 })

      const newModel = {
        name: model_data.name,
        provider: model_data.provider,
        model_type: model_data.model_type,
        api_format: model_data.api_format || 'google_official',
        api_url: model_data.api_url,
        api_key: model_data.api_key,
        model_name: model_data.model_name || model_data.name,
        capabilities: model_data.capabilities || ['text-to-image'],
        status: 'active',
        is_active: true,
        priority: model_data.priority || 5,
        weight: model_data.weight || 5,
        cost_per_request: model_data.cost_per_request || 0.01,
        max_requests_per_minute: model_data.max_requests_per_minute || 60,
        timeout: model_data.timeout || 60000,
        parameters: model_data.parameters || {
          default: {
            width: 1024,
            height: 1024,
            quality: 'standard'
          }
        },
        headers: model_data.headers || {},
        created_at: new Date(),
        updated_at: new Date()
      }

      const result = await this.db.collection('api_configs').add({
        data: newModel
      })

      this.logger.info('AI模型添加成功', {
        model_id: result._id,
        name: newModel.name,
        provider: newModel.provider
      })

      return {
        success: true,
        data: { model_id: result._id, model: newModel },
        message: 'AI模型添加成功'
      }

    } catch (error) {
      this.logger.error('添加AI模型失败', { error: error.message })
      return {
        success: false,
        message: '添加AI模型失败: ' + error.message
      }
    }
  }

  /**
   * 更新AI模型配置
   */
  async updateModel(event) {
    try {
      const { model_id, updates } = event

      if (!model_id || !updates) {
        return {
          success: false,
          message: '参数不完整'
        }
      }

      // 验证更新数据
      if (updates.name) {
        Validator.validateString(updates.name, '模型名称', { maxLength: 100 })
      }
      if (updates.api_url) {
        Validator.validateString(updates.api_url, 'API地址', { maxLength: 500 })
      }

      const updateData = {
        ...updates,
        updated_at: new Date()
      }

      const result = await this.db.collection('api_configs')
        .doc(model_id)
        .update({
          data: updateData
        })

      this.logger.info('AI模型更新成功', {
        model_id,
        updated_fields: Object.keys(updates)
      })

      return {
        success: true,
        data: result,
        message: 'AI模型更新成功'
      }

    } catch (error) {
      this.logger.error('更新AI模型失败', { model_id: event.model_id, error: error.message })
      return {
        success: false,
        message: '更新AI模型失败'
      }
    }
  }

  /**
   * 删除AI模型
   */
  async deleteModel(event) {
    try {
      const { model_id } = event

      if (!model_id) {
        return {
          success: false,
          message: '模型ID不能为空'
        }
      }

      // 先获取模型信息用于日志
      const modelInfo = await this.db.collection('api_configs').doc(model_id).get()

      const result = await this.db.collection('api_configs')
        .doc(model_id)
        .remove()

      this.logger.info('AI模型删除成功', {
        model_id,
        name: modelInfo.data?.name || 'unknown'
      })

      return {
        success: true,
        data: result,
        message: 'AI模型删除成功'
      }

    } catch (error) {
      this.logger.error('删除AI模型失败', { model_id: event.model_id, error: error.message })
      return {
        success: false,
        message: '删除AI模型失败'
      }
    }
  }

  /**
   * 切换模型启用状态
   */
  async toggleModelStatus(event) {
    try {
      const { model_id, is_active } = event

      if (!model_id || is_active === undefined) {
        return {
          success: false,
          message: '参数不完整'
        }
      }

      const result = await this.db.collection('api_configs')
        .doc(model_id)
        .update({
          data: {
            is_active: is_active,
            status: is_active ? 'active' : 'inactive',
            updated_at: new Date()
          }
        })

      this.logger.info('模型状态切换成功', {
        model_id,
        is_active,
        status: is_active ? 'active' : 'inactive'
      })

      return {
        success: true,
        data: result,
        message: `模型已${is_active ? '启用' : '禁用'}`
      }

    } catch (error) {
      this.logger.error('切换模型状态失败', {
        model_id: event.model_id,
        is_active: event.is_active,
        error: error.message
      })
      return {
        success: false,
        message: '切换模型状态失败'
      }
    }
  }

  /**
   * 检查管理员权限
   */
  async checkAdminPermission(event = {}) {
    try {
      // 优先使用传入的userOpenid，如果没有则使用当前云函数的WXContext
      let targetOpenid = event.userOpenid
      if (!targetOpenid) {
        const { OPENID } = cloud.getWXContext()
        targetOpenid = OPENID
      }

      if (!targetOpenid) {
        return {
          success: false,
          data: { isAdmin: false },
          message: '用户未登录'
        }
      }

      this.logger.debug('检查管理员权限', {
        targetOpenid,
        source: event.userOpenid ? 'API传递' : 'WXContext'
      })

      // 1. 首先检查环境变量中的管理员列表
      const adminOpenids = process.env.ADMIN_OPENIDS || ''
      if (adminOpenids) {
        const adminList = adminOpenids.split(',').map(id => id.trim()).filter(id => id)
        if (adminList.includes(targetOpenid)) {
          this.logger.info('管理员权限验证通过（环境变量）', { targetOpenid })
          return {
            success: true,
            data: {
              isAdmin: true,
              userId: targetOpenid,
              adminInfo: { source: 'environment_variable' }
            },
            message: '管理员权限验证通过（环境变量）'
          }
        }
      }

      // 2. 检查数据库中的管理员列表
      const adminResult = await this.db.collection('admin_users')
        .where({
          $or: [
            { _openid: targetOpenid, is_active: true },
            { openid: targetOpenid, is_active: true }
          ]
        })
        .get()

      const isAdmin = adminResult.data && adminResult.data.length > 0

      this.logger.info('管理员权限检查完成', {
        targetOpenid,
        isAdmin,
        adminCount: adminResult.data.length
      })

      return {
        success: true,
        data: {
          isAdmin: isAdmin,
          userId: targetOpenid,
          adminInfo: isAdmin ? adminResult.data[0] : null
        },
        message: isAdmin ? '管理员权限验证通过' : '非管理员用户'
      }

    } catch (error) {
      this.logger.error('检查管理员权限失败', {
        userOpenid: event.userOpenid,
        error: error.message
      })
      return {
        success: false,
        data: { isAdmin: false },
        message: '权限检查失败: ' + error.message
      }
    }
  }

  /**
   * 批量更新模型优先级
   */
  async batchUpdatePriority(event) {
    try {
      const { updates } = event // [{ model_id, priority }, ...]

      if (!Array.isArray(updates) || updates.length === 0) {
        return {
          success: false,
          message: '更新列表不能为空'
        }
      }

      const updatePromises = updates.map(async ({ model_id, priority }) => {
        if (!model_id || typeof priority !== 'number') {
          throw new Error(`无效的更新参数: model_id=${model_id}, priority=${priority}`)
        }

        return await this.db.collection('api_configs')
          .doc(model_id)
          .update({
            data: {
              priority: priority,
              updated_at: new Date()
            }
          })
      })

      await Promise.all(updatePromises)

      this.logger.info('批量更新模型优先级成功', { count: updates.length })

      return {
        success: true,
        data: { updated_count: updates.length },
        message: '批量更新优先级成功'
      }

    } catch (error) {
      this.logger.error('批量更新模型优先级失败', { error: error.message })
      return {
        success: false,
        message: '批量更新优先级失败: ' + error.message
      }
    }
  }

  /**
   * 获取模型使用统计
   */
  async getModelStats(event) {
    try {
      const { time_range = '7d' } = event

      // 计算时间范围
      const now = new Date()
      let startTime = new Date()

      switch (time_range) {
        case '1d':
          startTime.setDate(now.getDate() - 1)
          break
        case '7d':
          startTime.setDate(now.getDate() - 7)
          break
        case '30d':
          startTime.setDate(now.getDate() - 30)
          break
        default:
          startTime.setDate(now.getDate() - 7)
      }

      // 获取所有模型
      const modelsResult = await this.db.collection('api_configs').get()

      // 这里可以添加使用统计查询逻辑
      // 目前返回基础统计信息
      const stats = modelsResult.data.map(model => ({
        model_id: model._id,
        name: model.name,
        provider: model.provider,
        status: model.status,
        is_active: model.is_active,
        priority: model.priority,
        // TODO: 添加实际使用统计
        usage_count: 0,
        success_rate: 0,
        avg_response_time: 0
      }))

      this.logger.info('获取模型统计成功', {
        time_range,
        model_count: stats.length
      })

      return {
        success: true,
        data: {
          time_range,
          stats,
          summary: {
            total_models: stats.length,
            active_models: stats.filter(s => s.is_active).length,
            inactive_models: stats.filter(s => !s.is_active).length
          }
        },
        message: '获取模型统计成功'
      }

    } catch (error) {
      this.logger.error('获取模型统计失败', { error: error.message })
      return {
        success: false,
        message: '获取模型统计失败: ' + error.message
      }
    }
  }
}

module.exports = ModelManager