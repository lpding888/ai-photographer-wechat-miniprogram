// API调用工具类 - 修复版本
// 解决循环依赖和存储API问题

class ApiService {
  constructor() {
    this.baseUrl = '' // 云函数不需要baseUrl
    this._cloudReadyPromise = null // 内部缓存，避免重复获取
    this._appInstance = null // 缓存app实例，避免重复获取

    // 性能优化相关
    this._requestCache = new Map() // 请求缓存
    this._pendingRequests = new Map() // 防止重复请求
    this._debounceTimers = new Map() // 防抖定时器
    this._throttleTimers = new Map() // 节流定时器
  }

  /**
   * 获取app实例（缓存版本）
   */
  _getApp() {
    if (!this._appInstance) {
      try {
        this._appInstance = getApp()
      } catch (error) {
        console.error('ApiService: 获取app实例失败', error)
        return null
      }
    }
    return this._appInstance
  }

  /**
   * 智能等待app初始化完成（优化版）
   */
  async _waitForAppInitialization(maxWaitTime = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      
      const checkApp = () => {
        try {
          const app = this._getApp()
          if (app && app.globalData) {
            resolve(app)
          } else if (Date.now() - startTime > maxWaitTime) {
            reject(new Error('app初始化超时'))
          } else {
            setTimeout(checkApp, 100)
          }
        } catch (error) {
          reject(error)
        }
      }
      
      checkApp()
    })
  }

  /**
   * 确保云开发初始化完成（修复版）
   */
  async _ensureAppCloudReady() {
    try {
      // 1. 检查基础库支持
      if (!wx.cloud) {
        throw new Error('请使用 2.2.3 或以上的基础库以使用云能力')
      }
      
      // 2. 等待app初始化完成
      const app = await this._waitForAppInitialization()
      if (!app) {
        throw new Error('app初始化失败')
      }
      
      // 3. 检查云开发初始化状态
      if (app.globalData.cloudReadyPromise) {
        this._cloudReadyPromise = app.globalData.cloudReadyPromise
        return await this._cloudReadyPromise
      }
      
      // 4. 如果没有Promise，直接检查wx.cloud状态
      return !!wx.cloud
      
    } catch (error) {
      console.error('ApiService: 云开发就绪检查失败', error)
      return false
    }
  }

  /**
   * 智能重试机制（指数退避算法 - 2024年最佳实践）
   */
  async retryWithExponentialBackoff(fn, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      backoffFactor = 2,
      jitterFactor = 0.1
    } = options

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          console.error(`🔄 重试失败，已达到最大重试次数 ${maxRetries}:`, error)
          throw error
        }

        // 计算指数退避延迟
        const exponentialDelay = Math.min(
          baseDelay * Math.pow(backoffFactor, attempt),
          maxDelay
        )

        // 添加随机抖动，避免惊群效应
        const jitter = exponentialDelay * jitterFactor * Math.random()
        const delay = exponentialDelay + jitter

        console.warn(`🔄 第 ${attempt + 1} 次重试失败，${delay.toFixed(0)}ms 后重试:`, error.message)

        // 等待指定时间后重试
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  /**
   * 通用云函数调用方法（修复版 + 智能重试）
   */
  async callCloudFunction(functionName, data = {}) {
    try {
      // 生成请求唯一标识
      const requestKey = `${functionName}_${JSON.stringify(data)}`

      // 检查是否有相同的请求正在进行
      if (this._pendingRequests.has(requestKey)) {
        console.log(`api.js callCloudFunction: 发现重复请求，返回已有Promise ${functionName}`)
        return await this._pendingRequests.get(requestKey)
      }

      console.log(`api.js callCloudFunction: 开始调用云函数 ${functionName}`)

      // 确保云开发已初始化
      if (!wx.cloud) {
        throw new Error('云开发未初始化，请检查基础库版本')
      }

      // 等待云开发初始化完成
      const isCloudReady = await this._ensureAppCloudReady()
      
      if (!isCloudReady) {
        throw new Error('云开发初始化失败，请检查配置')
      }

      const noLoading = !!(data && data.__noLoading)

      // 创建请求Promise并缓存，使用智能重试机制
      const requestPromise = this.retryWithExponentialBackoff(
        () => this._executeCloudFunction(functionName, data, noLoading),
        {
          maxRetries: 2, // 云函数重试次数少一些，避免timeout
          baseDelay: 500, // 更短的基础延迟
          maxDelay: 5000 // 最大5秒延迟
        }
      )
      this._pendingRequests.set(requestKey, requestPromise)

      try {
        const result = await requestPromise
        return result
      } finally {
        // 请求完成后清理缓存
        this._pendingRequests.delete(requestKey)
      }
    } catch (error) {
      console.error(`api.js callCloudFunction: 云函数调用失败 ${functionName}`, error)
      throw error
    }
  }

  /**
   * 执行云函数调用的内部方法
   */
  async _executeCloudFunction(functionName, data, noLoading) {
    try {
      // 显示加载提示（增加错误处理）
      if (!noLoading) {
        try {
          wx.showLoading({
            title: '处理中...',
            mask: true
          })
        } catch (error) {
          console.warn('显示loading失败，继续执行', error)
        }
      }

      const res = await wx.cloud.callFunction({
        name: functionName,
        data
      })

      // 隐藏加载提示（增加错误处理）
      if (!noLoading) {
        try {
          wx.hideLoading()
        } catch (error) {
          console.warn('隐藏loading失败，继续执行', error)
        }
      }

      if (res.result && res.result.success) {
        return {
          success: true,
          data: res.result.data,
          message: res.result.message
        }
      } else {
        const errorMsg = res.result?.message || '请求失败'
        
        // 显示错误提示（增加错误处理）
        try {
          wx.showToast({
            title: errorMsg,
            icon: 'none',
            duration: 2000
          })
        } catch (error) {
          console.warn('显示错误提示失败', error)
        }
        
        return {
          success: false,
          message: errorMsg
        }
      }
    } catch (error) {
      const noLoading = !!(data && data.__noLoading)
      
      // 隐藏加载提示（增加错误处理）
      if (!noLoading) {
        try {
          wx.hideLoading()
        } catch (hideError) {
          console.warn('隐藏loading失败', hideError)
        }
      }
      
      console.error(`云函数${functionName}调用失败:`, error)
      
      let errorMsg = error.message || '网络错误，请稍后重试'
      
      // 特殊错误处理
      if (error.message && String(error.message).indexOf('Cloud API isn\'t enabled') >= 0) {
        errorMsg = '云服务初始化中，请稍后重试'
      }
      
      // 显示错误提示（增加错误处理）
      try {
        wx.showToast({
          title: errorMsg,
          icon: 'none',
          duration: 2000
        })
      } catch (toastError) {
        console.warn('显示错误提示失败', toastError)
      }
      
      return {
        success: false,
        message: errorMsg
      }
    }
  }

  // ==================== 用户相关 ====================
  
  /**
   * 用户注册
   */
  async registerUser(userInfo, inviteCode = '') {
    return await this.callCloudFunction('user', {
      action: 'register',
      nickname: userInfo.nickName,
      avatar_url: userInfo.avatarUrl,
      invite_code: inviteCode
    })
  }

  /**
   * 获取用户信息
   */
  async getUserInfo() {
    // 用户信息启用缓存，减少重复请求
    return await this.callCloudFunctionWithCache('user', {
      action: 'getUserInfo'
    }, {
      cache: true,
      cacheTTL: 300000 // 5分钟缓存
    })
  }

  /**
   * 更新用户信息
   */
  async updateUserInfo(userInfo) {
    return await this.callCloudFunction('user', {
      action: 'updateUserInfo',
      nickname: userInfo.nickName,
      avatar_url: userInfo.avatarUrl
    })
  }

  // ==================== 提示词相关 ====================
  
  /**
   * 生成AI提示词
   */
  async generatePrompt(type, parameters, sceneInfo) {
    return await this.callCloudFunction('prompt', {
      action: 'generatePrompt',
      type: type, // 'photography' | 'fitting'
      parameters: parameters,
      sceneInfo: sceneInfo
    })
  }

  /**
   * 获取提示词模板列表
   */
  async getPromptTemplates(type, category) {
    return await this.callCloudFunction('prompt', {
      action: 'getTemplates',
      type: type,
      category: category
    })
  }

  /**
   * 添加提示词模板（管理员功能）
   */
  async addPromptTemplate(templateData) {
    return await this.callCloudFunction('prompt', {
      action: 'addTemplate',
      template_data: templateData
    })
  }

  /**
   * 更新提示词模板（管理员功能）
   */
  async updatePromptTemplate(templateId, updates) {
    return await this.callCloudFunction('prompt', {
      action: 'updateTemplate',
      templateId: templateId,
      updates: updates
    })
  }

  /**
   * 删除提示词模板（管理员功能）
   */
  async deletePromptTemplate(templateId) {
    return await this.callCloudFunction('prompt', {
      action: 'deleteTemplate',
      template_id: templateId
    })
  }

  // ==================== AI模型管理 ====================
  
  /**
   * 获取可用AI模型列表
   */
  async getAIModels(modelType, provider, isActive) {
    return await this.callCloudFunction('aimodels', {
      action: 'listModels',
      model_type: modelType,
      provider: provider,
      is_active: isActive
    })
  }

  /**
   * 获取AI模型详情
   */
  async getAIModel(modelId) {
    return await this.callCloudFunction('aimodels', {
      action: 'getModel',
      model_id: modelId
    })
  }

  /**
   * 添加新AI模型（管理员功能）
   */
  async addAIModel(modelData) {
    return await this.callCloudFunction('aimodels', {
      action: 'addModel',
      model_data: modelData
    })
  }

  /**
   * 更新AI模型配置（管理员功能）
   */
  async updateAIModel(modelId, updates) {
    return await this.callCloudFunction('aimodels', {
      action: 'updateModel',
      model_id: modelId,
      updates: updates
    })
  }

  /**
   * 删除AI模型（管理员功能）
   */
  async deleteAIModel(modelId) {
    return await this.callCloudFunction('aimodels', {
      action: 'deleteModel',
      model_id: modelId
    })
  }

  /**
   * 切换AI模型启用状态（管理员功能）
   */
  async toggleAIModelStatus(modelId, isActive) {
    return await this.callCloudFunction('aimodels', {
      action: 'toggleModelStatus',
      model_id: modelId,
      is_active: isActive
    })
  }

  /**
   * 选择最佳AI模型
   */
  async selectBestAIModel(modelType, capabilities, maxCost, preferredProviders) {
    return await this.callCloudFunction('aimodels', {
      action: 'selectBestModel',
      model_type: modelType,
      capabilities: capabilities,
      max_cost: maxCost,
      preferred_providers: preferredProviders
    })
  }

  // ==================== 场景相关 ====================
  
  /**
   * 获取场景列表
   */
  async getScenes(category = 'all') {
    return await this.callCloudFunction('scene', {
      action: 'getScenes',
      category
    })
  }

  /**
   * 添加新场景（管理员功能）
   */
  async addScene(sceneData) {
    return await this.callCloudFunction('scene', {
      action: 'addScene',
      scene_data: sceneData
    })
  }

  /**
   * 更新场景（管理员功能）
   */
  async updateScene(sceneId, updates) {
    return await this.callCloudFunction('scene', {
      action: 'updateScene',
      sceneId: sceneId,
      updates: updates
    })
  }

  /**
   * 删除场景（管理员功能）
   */
  async deleteScene(sceneId) {
    return await this.callCloudFunction('scene', {
      action: 'deleteScene',
      sceneId: sceneId
    })
  }

  /**
   * 切换场景状态（管理员功能）
   */
  async toggleSceneStatus(sceneId, enabled) {
    return await this.callCloudFunction('scene', {
      action: 'toggleSceneStatus',
      sceneId: sceneId,
      enabled: enabled
    })
  }

  // ==================== 场景调试工具 ====================
  
  /**
   * 检查场景数据
   */
  async checkScenesData() {
    return await this.callCloudFunction('debug-scenes', {
      action: 'checkScenesData'
    })
  }

  /**
   * 修复场景数据
   */
  async repairScenesData() {
    return await this.callCloudFunction('debug-scenes', {
      action: 'repairScenesData'
    })
  }

  /**
   * 添加测试场景
   */
  async addTestScenes() {
    return await this.callCloudFunction('debug-scenes', {
      action: 'addTestScenes'
    })
  }

  // ==================== AI模型调试工具 ====================
  
  /**
   * 检查AI模型数据
   */
  async checkAIModelsData() {
    return await this.callCloudFunction('debug-scenes', {
      action: 'checkAIModelsData'
    })
  }

  /**
   * 添加测试AI模型
   */
  async addTestAIModels() {
    return await this.callCloudFunction('debug-scenes', {
      action: 'addTestAIModels'
    })
  }

  // ==================== 提示词模板调试工具 ====================
  
  /**
   * 检查提示词模板数据
   */
  async checkPromptTemplatesData() {
    return await this.callCloudFunction('debug-scenes', {
      action: 'checkPromptTemplatesData'
    })
  }

  /**
   * 添加测试提示词模板
   */
  async addTestPromptTemplates() {
    return await this.callCloudFunction('debug-scenes', {
      action: 'addTestPromptTemplates'
    })
  }

  // ==================== 统一调试工具 ====================

  /**
   * 检查所有集合数据
   */
  async checkAllCollections() {
    return await this.callCloudFunction('debug-scenes', {
      action: 'checkAllCollections'
    })
  }

  // ==================== 用户管理和统计相关 ====================

  /**
   * 获取用户列表（管理员功能）
   */
  async getUsers(filter = {}) {
    return await this.callCloudFunction('api', {
      action: 'getUsers',
      filter: filter
    })
  }

  /**
   * 更新用户状态（管理员功能）
   */
  async updateUserStatus(userId, status) {
    return await this.callCloudFunction('api', {
      action: 'updateUserStatus',
      userId: userId,
      status: status
    })
  }

  /**
   * 获取统计数据（管理员功能）
   */
  async getStatistics() {
    return await this.callCloudFunction('api', {
      action: 'getStatistics'
    })
  }

  /**
   * 导出数据（管理员功能）
   */
  async exportData(type) {
    return await this.callCloudFunction('api', {
      action: 'exportData',
      type: type
    })
  }

  // ==================== 作品相关 ====================
  
  /**
   * 获取作品列表
   */
  async getWorksList(params = {}) {
    return await this.callCloudFunction('api', {
      action: 'getWorkList',
      type: params.type || 'all',
      is_favorite: params.isFavorite,
      page: params.page || 1,
      limit: params.limit || 20
    })
  }

  /**
   * 轻量分页获取作品列表
   */
  async listWorks({ tab = 'all', onlyCompleted = false, pageSize = 6, last_id = null, last_created_at = null } = {}) {
    // 首次加载启用缓存，加载更多不缓存
    const useCache = !last_id && !last_created_at

    return await this.callCloudFunctionWithCache('api', {
      action: 'listWorks',
      tab,
      onlyCompleted,
      pageSize,
      last_id,
      last_created_at,
      __noLoading: true
    }, {
      cache: useCache,
      cacheTTL: 60000 // 1分钟缓存
    })
  }

  /**
   * 获取作品详情
   */
  async getWorkDetail(workId) {
    return await this.callCloudFunction('api', {
      action: 'getWorkDetail',
      workId: workId
    })
  }

  /**
   * 删除作品
   */
  async deleteWork(workId) {
    const result = await this.callCloudFunction('api', {
      action: 'deleteWork',
      workId: workId
    })

    // 清除作品列表缓存
    if (result.success) {
      this.invalidateCache('listWorks')
    }

    return result
  }

  /**
   * 切换收藏状态
   */
  async toggleFavorite(workId) {
    const result = await this.callCloudFunction('api', {
      action: 'toggleFavorite',
      workId: workId
    })

    // 清除作品列表缓存（因为收藏状态改变了）
    if (result.success) {
      this.invalidateCache('listWorks')
    }

    return result
  }

  /**
   * 更新作品标题
   */
  async updateWorkTitle(workId, title) {
    return await this.callCloudFunction('api', {
      action: 'updateWorkTitle',
      workId: workId,
      title: title
    })
  }

  /**
   * 更新作品数据（通用方法）
   */
  async updateWork(workId, updates) {
    return await this.callCloudFunction('api', {
      action: 'updateWork',
      workId: workId,
      updates: updates
    })
  }

  // ==================== 摄影相关 ====================
  
  /**
   * 生成摄影作品
   */
  async generatePhotography(params) {
    const callData = {
      action: 'generate',
      count: params.count || 1
    }

    // 🎭 姿势裂变模式
    if (params.mode === 'pose_variation') {
      callData.mode = params.mode
      callData.referenceWorkId = params.referenceWorkId
      if (params.posePresetId) {
        callData.posePresetId = params.posePresetId
      }
      if (params.poseDescription) {
        callData.poseDescription = params.poseDescription
      }
    } else {
      // 普通生成模式
      callData.images = params.images
      callData.parameters = params.parameters
      callData.sceneId = params.sceneId
    }

    return await this.callCloudFunction('photography', callData)
  }

  /**
   * 获取摄影任务进度
   */
  async getPhotographyProgress(taskId) {
    return await this.callCloudFunction('photography', {
      action: 'getProgress',
      task_id: taskId,
      __noLoading: true
    })
  }

  // ==================== 试衣相关 ====================
  
  /**
   * 生成试衣作品
   */
  async generateFitting(params) {
    const callData = {
      action: 'generate',
      count: params.count || 1
    }

    // 🎭 姿势裂变模式
    if (params.mode === 'pose_variation') {
      callData.mode = params.mode
      callData.referenceWorkId = params.referenceWorkId
      if (params.posePresetId) {
        callData.posePresetId = params.posePresetId
      }
      if (params.poseDescription) {
        callData.poseDescription = params.poseDescription
      }
    } else {
      // 普通生成模式
      let sceneId = params.sceneId
      try {
        if (!sceneId && params && params.parameters && params.parameters.location) {
          const scenesRes = await this.getScenes('all')
          if (scenesRes && scenesRes.success && Array.isArray(scenesRes.data)) {
            const loc = params.parameters.location
            const match = scenesRes.data.find(s => s && (s.name === loc || s.title === loc))
            if (match && (match._id || match.id)) {
              sceneId = match._id || match.id
            }
          }
        }
      } catch (e) {
        console.warn('generateFitting: 场景自动匹配失败(忽略继续):', e && e.message)
      }

      callData.model_image = params.modelImage
      callData.clothing_images = params.clothingImages
      callData.parameters = params.parameters
      callData.sceneId = sceneId
    }

    return await this.callCloudFunction('fitting', callData)
  }

  /**
   * 获取试衣任务进度
   */
  async getFittingProgress(taskId) {
    return await this.callCloudFunction('fitting', {
      action: 'getProgress',
      task_id: taskId,
      __noLoading: true
    })
  }

  /**
   * 获取个人功能任务进度（个人试衣、全球旅行）
   */
  async getPersonalProgress(taskId) {
    return await this.callCloudFunction('personal', {
      action: 'getProgress',
      taskId: taskId,
      __noLoading: true
    })
  }

  // ==================== 支付相关 ====================
  
  /**
   * 获取充值套餐
   */
  async getPackages() {
    return await this.callCloudFunction('payment', {
      action: 'getPackages'
    })
  }

  /**
   * 每日签到
   */
  async dailyCheckin() {
    return await this.callCloudFunction('payment', {
      action: 'dailyCheckin'
    })
  }

  /**
   * 获取签到状态
   */
  async getSignInState() {
    return await this.callCloudFunction('payment', {
      action: 'getSignInState',
      __noLoading: true
    })
  }

  /**
   * 分享奖励
   */
  async shareReward() {
    return await this.callCloudFunction('payment', {
      action: 'shareReward'
    })
  }

  /**
   * 创建充值订单
   */
  async createRechargeOrder({ packageId }) {
    return await this.callCloudFunction('payment', {
      action: 'createOrder',
      packageId: packageId
    })
  }

  /**
   * 获取充值记录
   */
  async getRechargeRecords() {
    return await this.callCloudFunction('payment', {
      action: 'listRechargeRecords',
      __noLoading: true
    })
  }

  /**
   * 获取积分消费记录
   */
  async getConsumeRecords() {
    return await this.callCloudFunction('payment', {
      action: 'listConsumeRecords',
      __noLoading: true
    })
  }

  /**
   * 获取积分统计摘要
   */
  async getCreditSummary() {
    return await this.callCloudFunction('payment', {
      action: 'getCreditSummary',
      __noLoading: true
    })
  }

  /**
   * 获取积分明细记录
   */
  async getCreditRecords(filter = 'all', pageSize = 20, lastId = null) {
    return await this.callCloudFunction('payment', {
      action: 'getCreditRecords',
      filter: filter,
      pageSize: pageSize,
      lastId: lastId,
      __noLoading: true
    })
  }

  // ==================== 文件上传相关 ====================
  
  /**
   * 上传文件到云存储
   */
  async uploadFile(filePath, cloudPath) {
    try {
      try {
        wx.showLoading({
          title: '上传中...',
          mask: true
        })
      } catch (error) {
        console.warn('显示上传loading失败', error)
      }

      const res = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      })

      try {
        wx.hideLoading()
      } catch (error) {
        console.warn('隐藏上传loading失败', error)
      }

      if (res.fileID) {
        return {
          success: true,
          data: {
            file_id: res.fileID,
            cloud_path: cloudPath
          }
        }
      } else {
        throw new Error('上传失败')
      }
    } catch (error) {
      try {
        wx.hideLoading()
      } catch (hideError) {
        console.warn('隐藏上传loading失败', hideError)
      }
      
      console.error('文件上传失败:', error)
      
      try {
        wx.showToast({
          title: '上传失败',
          icon: 'none'
        })
      } catch (toastError) {
        console.warn('显示上传错误提示失败', toastError)
      }
      
      return {
        success: false,
        message: error.message || '上传失败'
      }
    }
  }

  // ==================== 性能优化方法 ====================

  /**
   * 生成请求缓存键
   */
  _generateCacheKey(functionName, data) {
    return `${functionName}_${JSON.stringify(data || {})}`
  }

  /**
   * 缓存请求结果
   */
  _cacheRequest(cacheKey, result, ttl = 300000) { // 默认5分钟
    const expireTime = Date.now() + ttl
    this._requestCache.set(cacheKey, {
      result,
      expireTime
    })

    // 定期清理过期缓存
    setTimeout(() => {
      const cached = this._requestCache.get(cacheKey)
      if (cached && Date.now() > cached.expireTime) {
        this._requestCache.delete(cacheKey)
      }
    }, ttl)
  }

  /**
   * 获取缓存的请求结果
   */
  _getCachedRequest(cacheKey) {
    const cached = this._requestCache.get(cacheKey)
    if (cached && Date.now() < cached.expireTime) {
      console.log(`📦 命中缓存: ${cacheKey.substring(0, 20)}...`)
      return cached.result
    }
    this._requestCache.delete(cacheKey)
    return null
  }

  /**
   * 清除特定的缓存
   */
  invalidateCache(pattern) {
    let cleared = 0
    for (const [key] of this._requestCache) {
      if (key.includes(pattern)) {
        this._requestCache.delete(key)
        cleared++
      }
    }
    console.log(`🗑️ 清除了 ${cleared} 个缓存项（pattern: ${pattern}）`)
  }

  /**
   * 带缓存的云函数调用
   */
  async callCloudFunctionWithCache(functionName, data = {}, options = {}) {
    const { cache = false, cacheTTL = 300000, skipCache = false } = options

    if (cache && !skipCache) {
      const cacheKey = this._generateCacheKey(functionName, data)
      const cachedResult = this._getCachedRequest(cacheKey)
      if (cachedResult) {
        console.log(`使用缓存结果: ${functionName}`)
        return cachedResult
      }
    }

    const result = await this.callCloudFunction(functionName, data)

    if (cache && result.success) {
      const cacheKey = this._generateCacheKey(functionName, data)
      this._cacheRequest(cacheKey, result, cacheTTL)
    }

    return result
  }

  /**
   * 防抖请求
   */
  debounceRequest(key, func, delay = 300) {
    return (...args) => {
      const timer = this._debounceTimers.get(key)
      if (timer) {
        clearTimeout(timer)
      }

      const newTimer = setTimeout(() => {
        func.apply(this, args)
        this._debounceTimers.delete(key)
      }, delay)

      this._debounceTimers.set(key, newTimer)
    }
  }

  /**
   * 节流请求
   */
  throttleRequest(key, func, delay = 1000) {
    return (...args) => {
      if (this._throttleTimers.has(key)) {
        return
      }

      func.apply(this, args)
      const timer = setTimeout(() => {
        this._throttleTimers.delete(key)
      }, delay)

      this._throttleTimers.set(key, timer)
    }
  }

  /**
   * 批量请求（并发控制）
   */
  async batchRequest(requests, concurrency = 3) {
    const results = []
    const executing = []

    for (const request of requests) {
      const promise = this.callCloudFunction(request.functionName, request.data)
        .then(result => ({ ...result, requestId: request.id }))

      results.push(promise)

      if (requests.length >= concurrency) {
        executing.push(promise)

        if (executing.length >= concurrency) {
          await Promise.race(executing)
          executing.splice(executing.findIndex(p => p === promise), 1)
        }
      }
    }

    return await Promise.all(results)
  }

  /**
   * 请求重试机制
   */
  async requestWithRetry(functionName, data, options = {}) {
    const { maxRetries = 3, retryDelay = 1000, exponentialBackoff = true } = options

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.callCloudFunction(functionName, data)
        if (result.success) {
          return result
        }

        if (attempt === maxRetries) {
          return result
        }

        // 计算重试延迟
        const delay = exponentialBackoff
          ? retryDelay * Math.pow(2, attempt - 1)
          : retryDelay

        await new Promise(resolve => setTimeout(resolve, delay))

      } catch (error) {
        if (attempt === maxRetries) {
          return {
            success: false,
            message: error.message || '请求失败'
          }
        }

        const delay = exponentialBackoff
          ? retryDelay * Math.pow(2, attempt - 1)
          : retryDelay

        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  /**
   * 清理缓存
   */
  clearCache(pattern) {
    if (pattern) {
      // 清理匹配模式的缓存
      for (const [key] of this._requestCache) {
        if (key.includes(pattern)) {
          this._requestCache.delete(key)
        }
      }
    } else {
      // 清理所有缓存
      this._requestCache.clear()
    }
  }

  /**
   * 预加载数据
   */
  async preloadData(functionName, data, cacheTTL = 600000) {
    try {
      await this.callCloudFunctionWithCache(functionName, data, {
        cache: true,
        cacheTTL
      })
      console.log(`预加载成功: ${functionName}`)
    } catch (error) {
      console.warn(`预加载失败: ${functionName}`, error)
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats() {
    return {
      cacheSize: this._requestCache.size,
      pendingRequests: this._pendingRequests.size,
      debounceTimers: this._debounceTimers.size,
      throttleTimers: this._throttleTimers.size
    }
  }
}

// 创建单例实例
const apiService = new ApiService()

module.exports = apiService