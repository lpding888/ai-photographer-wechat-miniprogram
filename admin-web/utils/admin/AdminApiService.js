/**
 * 管理后台API服务
 * 提供AI模型配置管理的所有API接口
 *
 * @author 老王
 * @version 1.0.0
 */

class AdminApiService {
  constructor() {
    this.cloudFunctionName = 'admin-api'
    this.baseConfig = {
      timeout: 30000,
      retry: 3,
      retryDelay: 1000
    }
  }

  /**
   * 通用API调用方法
   */
  async callApi(action, params = {}) {
    const maxRetries = this.baseConfig.retry
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔧 API调用: ${action} (尝试 ${attempt}/${maxRetries})`)

        const response = await wx.cloud.callFunction({
          name: this.cloudFunctionName,
          data: {
            action,
            ...params
          }
        })

        const result = response.result

        if (!result.success) {
          throw new Error(result.error?.message || 'API调用失败')
        }

        console.log(`✅ API调用成功: ${action}`)
        return result

      } catch (error) {
        lastError = error
        console.error(`❌ API调用失败: ${action} (尝试 ${attempt}/${maxRetries})`, error)

        if (attempt < maxRetries) {
          await this.delay(this.baseConfig.retryDelay * attempt)
        }
      }
    }

    throw lastError
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ========== 模型配置管理 ==========

  /**
   * 获取所有模型信息
   */
  async getModels() {
    return await this.callApi('get_models')
  }

  /**
   * 获取指定模型配置
   */
  async getModelConfig(modelType) {
    return await this.callApi('get_model_config', { modelType })
  }

  /**
   * 更新模型配置
   */
  async updateModelConfig(modelType, config) {
    return await this.callApi('update_model_config', { modelType, config })
  }

  /**
   * 测试模型配置
   */
  async testModelConfig(modelType, config) {
    return await this.callApi('test_model_config', { modelType, config })
  }

  // ========== 提示词模板管理 ==========

  /**
   * 获取提示词模板列表
   */
  async getPromptTemplates(modelType = null) {
    return await this.callApi('get_prompt_templates', { modelType })
  }

  /**
   * 获取指定提示词模板
   */
  async getPromptTemplate(modelType, templateId) {
    return await this.callApi('get_prompt_template', { modelType, templateId })
  }

  /**
   * 创建提示词模板
   */
  async createPromptTemplate(modelType, template) {
    return await this.callApi('create_prompt_template', { modelType, template })
  }

  /**
   * 更新提示词模板
   */
  async updatePromptTemplate(modelType, templateId, template) {
    return await this.callApi('update_prompt_template', { modelType, templateId, template })
  }

  /**
   * 删除提示词模板
   */
  async deletePromptTemplate(modelType, templateId) {
    return await this.callApi('delete_prompt_template', { modelType, templateId })
  }

  // ========== 适配器和状态管理 ==========

  /**
   * 获取适配器状态
   */
  async getAdaptersStatus() {
    return await this.callApi('get_adapters_status')
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    return await this.callApi('health_check')
  }

  /**
   * 重新加载适配器
   */
  async reloadAdapter(modelType) {
    return await this.callApi('reload_adapter', { modelType })
  }

  /**
   * 清理缓存
   */
  async clearCache(modelType = null) {
    return await this.callApi('clear_cache', { modelType })
  }

  // ========== 批量操作 ==========

  /**
   * 批量更新配置
   */
  async batchUpdateConfigs(configs) {
    return await this.callApi('batch_update_configs', { configs })
  }

  /**
   * 导出配置
   */
  async exportConfigs() {
    return await this.callApi('export_configs')
  }

  /**
   * 导入配置
   */
  async importConfigs(configData) {
    return await this.callApi('import_configs', { configData })
  }

  // ========== 工具方法 ==========

  /**
   * 格式化API错误信息
   */
  formatApiError(error) {
    if (error.result && error.result.error) {
      return error.result.error.message || error.result.error.code || '未知错误'
    }
    return error.message || 'API调用失败'
  }

  /**
   * 验证模型配置
   */
  validateModelConfig(config) {
    const requiredFields = ['type', 'name']
    const missingFields = requiredFields.filter(field => !config[field])

    if (missingFields.length > 0) {
      throw new Error(`配置缺少必需字段: ${missingFields.join(', ')}`)
    }

    if (typeof config.type !== 'string') {
      throw new Error('type字段必须是字符串')
    }

    if (typeof config.name !== 'string') {
      throw new Error('name字段必须是字符串')
    }

    return true
  }

  /**
   * 验证提示词模板
   */
  validatePromptTemplate(template) {
    const requiredFields = ['name', 'category', 'content']
    const missingFields = requiredFields.filter(field => !template[field])

    if (missingFields.length > 0) {
      throw new Error(`模板缺少必需字段: ${missingFields.join(', ')}`)
    }

    if (typeof template.content !== 'string') {
      throw new Error('content字段必须是字符串')
    }

    if (template.content.length > 10000) {
      throw new Error('模板内容过长，最多支持10000字符')
    }

    return true
  }

  /**
   * 生成配置备份名称
   */
  generateBackupName(modelType) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `${modelType}-backup-${timestamp}`
  }

  /**
   * 解析模板变量
   */
  parseTemplateVariables(content) {
    const variableRegex = /\{#(\w+)#\}/g
    const variables = []
    let match

    while ((match = variableRegex.exec(content)) !== null) {
      variables.push(match[1])
    }

    return [...new Set(variables)]
  }

  /**
   * 替换模板变量
   */
  replaceTemplateVariables(content, variables) {
    let result = content

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{#${key}\\#\\}`, 'g')
      result = result.replace(regex, value || '')
    }

    return result
  }

  /**
   * 获取默认模型配置
   */
  getDefaultModelConfig(modelType) {
    const defaultConfigs = {
      hunyuan: {
        type: 'hunyuan',
        name: '混元大模型',
        version: '1.0.0',
        useCloudBase: true,
        region: 'ap-beijing',
        defaultModel: 'hunyuan-vision',
        defaultParams: {
          temperature: 0.3,
          maxTokens: 2000,
          timeout: 30000
        }
      },
      doubao: {
        type: 'doubao',
        name: '豆包Seedream 4.0',
        version: '4.0.0',
        apiEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
        defaultModel: 'doubao-Seedream-4-0-250828',
        defaultParams: {
          size: '2K',
          quality: 'standard',
          maxImages: 4,
          timeout: 300000
        }
      }
    }

    return defaultConfigs[modelType] || null
  }

  /**
   * 获取默认提示词模板
   */
  getDefaultPromptTemplate(modelType, category) {
    const defaultTemplates = {
      hunyuan: {
        image_analysis: {
          name: '标准图像分析',
          category: 'image_analysis',
          content: '请分析这些图片中的人物特征、服装信息、姿势动作和整体风格，用JSON格式返回结果。'
        }
      },
      doubao: {
        image_generation: {
          name: '标准图像生成',
          category: 'image_generation',
          content: '根据描述生成高质量图像，要求细节丰富，色彩真实。'
        },
        pose_variation: {
          name: '姿势裂变',
          category: 'pose_variation',
          content: '保持人物和服装特征不变，生成不同姿势的图像。'
        }
      }
    }

    return defaultTemplates[modelType]?.[category] || null
  }

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * 格式化时间差
   */
  formatTimeDiff(timestamp) {
    if (!timestamp) return '未知'

    const now = new Date()
    const time = new Date(timestamp)
    const diff = now - time

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`

    return time.toLocaleDateString('zh-CN')
  }

  /**
   * 检查网络状态
   */
  async checkNetworkStatus() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          resolve({
            isConnected: res.networkType !== 'none',
            networkType: res.networkType
          })
        },
        fail: () => {
          resolve({
            isConnected: false,
            networkType: 'unknown'
          })
        }
      })
    })
  }

  /**
   * 显示加载提示
   */
  showLoading(title = '加载中...') {
    wx.showLoading({
      title,
      mask: true
    })
  }

  /**
   * 隐藏加载提示
   */
  hideLoading() {
    wx.hideLoading()
  }

  /**
   * 显示成功提示
   */
  showSuccess(title) {
    wx.showToast({
      title,
      icon: 'success',
      duration: 2000
    })
  }

  /**
   * 显示错误提示
   */
  showError(title) {
    wx.showToast({
      title,
      icon: 'error',
      duration: 3000
    })
  }

  /**
   * 显示普通提示
   */
  showToast(title, icon = 'none') {
    wx.showToast({
      title,
      icon,
      duration: 2000
    })
  }

  /**
   * 显示确认对话框
   */
  showConfirm(options) {
    const { title, content, confirmText = '确定', cancelText = '取消' } = options

    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        confirmText,
        cancelText,
        success: (res) => {
          resolve(res.confirm)
        },
        fail: () => {
          resolve(false)
        }
      })
    })
  }
}

// 创建全局实例
const adminApiService = new AdminApiService()

module.exports = {
  AdminApiService,
  adminApiService
}