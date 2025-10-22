// AI模型管理页面（管理员专用）

Page({
  data: {
    models: [],
    loading: false,
    isAdmin: false,
    showAddModal: false,
    currentStep: 1, // 当前步骤：1=基本信息, 2=API配置, 3=高级设置
    showPassword: false, // 是否显示密码
    newModel: {
      name: '',
      provider: '',
      model_type: 'text-to-image',
      endpoint: '',
      api_key: '',
      priority: 'medium',
      weight: 'medium',
      is_active: true
    },
    // 验证错误信息
    errors: {
      name: '',
      provider: '',
      endpoint: '',
      api_key: ''
    },
    // 常用提供商列表
    commonProviders: ['openai', 'anthropic', 'google', 'stability', 'midjourney', 'custom'],
    // 优先级选项
    priorityOptions: [
      { label: '高', value: 'high', number: 8 },
      { label: '中', value: 'medium', number: 5 },
      { label: '低', value: 'low', number: 2 }
    ],
    // 权重选项
    weightOptions: [
      { label: '高', value: 'high', number: 8 },
      { label: '中', value: 'medium', number: 5 },
      { label: '低', value: 'low', number: 2 }
    ]
  },

  onLoad() {
    this.checkAdminStatus()
    this.loadAIModels()
  },

  /**
   * 检查管理员状态
   */
  async checkAdminStatus() {
    try {
      const app = getApp()
      const userInfo = app.globalData.userInfo
      
      if (!userInfo || !userInfo.openid) {
        wx.showModal({
          title: '访问被拒绝',
          content: '请先登录',
          showCancel: false,
          success: () => {
            wx.switchTab({ url: '/pages/index/index' })
          }
        })
        return
      }
      
      // 通过后端验证管理员权限
      const api = require('../../utils/api.js')
      const result = await api.callCloudFunction('aimodels', {
        action: 'checkAdminPermission'
      })
      
      if (result.success && result.data.isAdmin) {
        this.setData({
          isAdmin: true
        })
      } else {
        // 非管理员，禁止访问
        wx.showModal({
          title: '访问被拒绝',
          content: '您没有管理员权限',
          showCancel: false,
          success: () => {
            wx.switchTab({ url: '/pages/index/index' })
          }
        })
      }
    } catch (error) {
      console.error('检查管理员状态失败:', error)
      wx.showModal({
        title: '验证失败',
        content: '权限验证失败，请重试',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/index/index' })
        }
      })
    }
  },

  /**
   * 加载AI模型列表
   */
  async loadAIModels() {
    if (!this.data.isAdmin) {
      wx.showToast({
        title: '权限不足',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true })

    try {
      const api = require('../../utils/api.js')
      const result = await api.getAIModels()

      if (result.success) {
        this.setData({
          models: result.data
        })
      } else {
        wx.showToast({
          title: result.message || '加载失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('加载AI模型失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 切换模型状态
   */
  async toggleModelStatus(e) {
    const { modelId, currentStatus } = e.currentTarget.dataset
    const newStatus = !currentStatus

    try {
      const api = require('../../utils/api.js')
      const result = await api.toggleAIModelStatus(modelId, newStatus)

      if (result.success) {
        wx.showToast({
          title: result.message,
          icon: 'success'
        })
        this.loadAIModels() // 重新加载列表
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('切换模型状态失败:', error)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  /**
   * 删除模型
   */
  async deleteModel(e) {
    const { modelId, modelName } = e.currentTarget.dataset

    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: `确定要删除模型"${modelName}"吗？此操作不可恢复。`,
        success: resolve
      })
    })

    if (!result.confirm) return

    try {
      const api = require('../../utils/api.js')
      const deleteResult = await api.deleteAIModel(modelId)

      if (deleteResult.success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        })
        this.loadAIModels() // 重新加载列表
      } else {
        wx.showToast({
          title: deleteResult.message || '删除失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('删除模型失败:', error)
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      })
    }
  },

  /**
   * 显示添加模型弹窗
   */
  showAddModel() {
    this.setData({ showAddModal: true })
  },

  /**
   * 隐藏添加模型弹窗
   */
  hideAddModal() {
    this.setData({
      showAddModal: false,
      currentStep: 1,
      showPassword: false,
      newModel: {
        name: '',
        provider: '',
        model_type: 'text-to-image',
        endpoint: '',
        api_key: '',
        priority: 'medium',
        weight: 'medium',
        is_active: true
      },
      errors: {
        name: '',
        provider: '',
        endpoint: '',
        api_key: ''
      }
    })
  },

  /**
   * 下一步
   */
  nextStep() {
    // 验证当前步骤
    if (this.data.currentStep === 1) {
      if (!this.validateStep1()) return
    } else if (this.data.currentStep === 2) {
      if (!this.validateStep2()) return
    }

    this.setData({
      currentStep: this.data.currentStep + 1
    })
  },

  /**
   * 上一步
   */
  prevStep() {
    this.setData({
      currentStep: this.data.currentStep - 1
    })
  },

  /**
   * 验证步骤1（基本信息）
   */
  validateStep1() {
    const { name, provider } = this.data.newModel
    const errors = {}
    let isValid = true

    if (!name || name.trim() === '') {
      errors.name = '请输入模型名称'
      isValid = false
    }

    if (!provider || provider.trim() === '') {
      errors.provider = '请选择提供商'
      isValid = false
    }

    this.setData({ errors })

    if (!isValid) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      })
    }

    return isValid
  },

  /**
   * 验证步骤2（API配置）
   */
  validateStep2() {
    const { endpoint } = this.data.newModel
    const errors = {}
    let isValid = true

    if (!endpoint || endpoint.trim() === '') {
      errors.endpoint = '请输入API端点'
      isValid = false
    } else if (!this.isValidUrl(endpoint)) {
      errors.endpoint = 'API端点格式不正确'
      isValid = false
    }

    this.setData({ errors })

    if (!isValid) {
      wx.showToast({
        title: '请检查API配置',
        icon: 'none'
      })
    }

    return isValid
  },

  /**
   * 验证URL格式
   */
  isValidUrl(url) {
    const pattern = /^https?:\/\/.+/
    return pattern.test(url)
  },

  /**
   * 切换密码显示
   */
  togglePasswordVisibility() {
    this.setData({
      showPassword: !this.data.showPassword
    })
  },

  /**
   * 选择提供商
   */
  selectProvider(e) {
    const { provider } = e.currentTarget.dataset
    this.setData({
      'newModel.provider': provider,
      'errors.provider': ''
    })
  },

  /**
   * 选择优先级
   */
  selectPriority(e) {
    const { value } = e.currentTarget.dataset
    this.setData({
      'newModel.priority': value
    })
  },

  /**
   * 选择权重
   */
  selectWeight(e) {
    const { value } = e.currentTarget.dataset
    this.setData({
      'newModel.weight': value
    })
  },

  /**
   * 选择模型类型
   */
  selectModelType(e) {
    const { type } = e.currentTarget.dataset
    this.setData({
      'newModel.model_type': type
    })
  },

  /**
   * 输入框变化
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail

    this.setData({
      [`newModel.${field}`]: value,
      [`errors.${field}`]: '' // 清除错误信息
    })

    // 实时验证
    if (field === 'endpoint' && value) {
      if (!this.isValidUrl(value)) {
        this.setData({
          'errors.endpoint': '请输入有效的URL（以http://或https://开头）'
        })
      }
    }
  },

  /**
   * 开关变化
   */
  onSwitchChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail
    
    this.setData({
      [`newModel.${field}`]: value
    })
  },

  /**
   * 添加新模型
   */
  async addNewModel() {
    const { newModel } = this.data

    // 最终验证
    if (!this.validateStep1() || !this.validateStep2()) {
      return
    }

    try {
      const api = require('../../utils/api.js')

      // 转换优先级和权重为数字
      const priorityMap = { high: 8, medium: 5, low: 2 }
      const weightMap = { high: 8, medium: 5, low: 2 }

      const modelData = {
        name: newModel.name,
        provider: newModel.provider,
        model_type: newModel.model_type,
        capabilities: ['text-to-image'], // 默认能力
        api_config: {
          endpoint: newModel.endpoint,
          headers: {
            'Authorization': `Bearer ${newModel.api_key}`,
            'Content-Type': 'application/json'
          },
          request_format: 'json',
          method: 'POST'
        },
        parameters: {
          default: {
            width: 1024,
            height: 1024,
            steps: 30
          }
        },
        pricing: {
          cost_per_image: 0.02,
          currency: 'USD'
        },
        is_active: newModel.is_active,
        priority: priorityMap[newModel.priority] || 5,
        weight: weightMap[newModel.weight] || 5
      }

      const result = await api.addAIModel(modelData)

      if (result.success) {
        wx.showToast({
          title: '添加成功',
          icon: 'success'
        })
        this.hideAddModal()
        this.loadAIModels() // 重新加载列表
      } else {
        wx.showToast({
          title: result.message || '添加失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('添加模型失败:', error)
      wx.showToast({
        title: '添加失败',
        icon: 'none'
      })
    }
  },

  /**
   * 测试模型
   */
  async testModel(e) {
    const { modelId } = e.currentTarget.dataset

    wx.showLoading({
      title: '测试中...'
    })

    try {
      const api = require('../../utils/api.js')
      
      // 使用简单的测试提示词
      const testResult = await api.callCloudFunction('aimodels', {
        action: 'callAIModel',
        model_id: modelId,
        prompt: 'A beautiful sunset landscape',
        parameters: {
          count: 1,
          width: 512,
          height: 512
        }
      })

      wx.hideLoading()

      if (testResult.success) {
        wx.showToast({
          title: '模型测试成功',
          icon: 'success'
        })
      } else {
        wx.showToast({
          title: '模型测试失败',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('测试模型失败:', error)
      wx.showToast({
        title: '测试失败',
        icon: 'none'
      })
    }
  }
})