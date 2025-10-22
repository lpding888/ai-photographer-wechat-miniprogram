// 场景数据调试页面
const apiService = require('../../../utils/api.js')

Page({
  data: {
    scenesData: null,
    aiModelsData: null,
    promptTemplatesData: null,
    allCollectionsData: null,
    loading: false,
    logs: []
  },

  onLoad() {
    this.addLog('页面加载完成 - 数据库统一调试工具')
  },

  /**
   * 添加日志
   */
  addLog(message) {
    const logs = [...this.data.logs]
    logs.unshift(`${new Date().toLocaleTimeString()}: ${message}`)
    if (logs.length > 50) logs.pop()
    this.setData({ logs })
    console.log('场景调试:', message)
  },

  /**
   * 检查场景数据
   */
  async checkScenes() {
    this.setData({ loading: true })
    this.addLog('开始检查场景数据...')
    
    try {
      const res = await apiService.checkScenesData()
      this.addLog(`检查结果: ${res.success ? '成功' : '失败'}`)
      
      if (res.success) {
        this.setData({ scenesData: res.data })
        this.addLog(`发现${res.data.count}个场景，活跃${res.data.activeCount}个`)
        
        if (res.data.scenes && res.data.scenes.length > 0) {
          res.data.scenes.forEach(scene => {
            this.addLog(`场景: ${scene.name} (${scene.category}) - ${scene.is_active ? '活跃' : '非活跃'}`)
          })
        }
      } else {
        this.addLog(`检查失败: ${res.error}`)
      }
    } catch (error) {
      this.addLog(`检查异常: ${error.message}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 修复场景数据
   */
  async repairScenes() {
    this.setData({ loading: true })
    this.addLog('开始修复场景数据...')
    
    try {
      const res = await apiService.repairScenesData()
      this.addLog(`修复结果: ${res.success ? '成功' : '失败'}`)
      
      if (res.success) {
        this.addLog(`修复了${res.data.repaired}个场景`)
        if (res.data.repairs && res.data.repairs.length > 0) {
          res.data.repairs.forEach(repair => {
            this.addLog(`修复: ${repair.name} - ${repair.updates.join(', ')}`)
          })
        }
        // 重新检查数据
        await this.checkScenes()
      } else {
        this.addLog(`修复失败: ${res.error}`)
      }
    } catch (error) {
      this.addLog(`修复异常: ${error.message}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 添加测试场景
   */
  async addTestScenes() {
    this.setData({ loading: true })
    this.addLog('开始添加测试场景...')
    
    try {
      const res = await apiService.addTestScenes()
      this.addLog(`添加结果: ${res.success ? '成功' : '失败'}`)
      
      if (res.success) {
        this.addLog(`添加了${res.data.added}个测试场景`)
        if (res.data.scenes && res.data.scenes.length > 0) {
          res.data.scenes.forEach(scene => {
            this.addLog(`新增: ${scene.name} (${scene.category})`)
          })
        }
        // 重新检查数据
        await this.checkScenes()
      } else {
        this.addLog(`添加失败: ${res.error}`)
      }
    } catch (error) {
      this.addLog(`添加异常: ${error.message}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 测试场景API
   */
  async testScenesAPI() {
    this.setData({ loading: true })
    this.addLog('测试场景API...')
    
    try {
      const res = await apiService.getScenes()
      this.addLog(`API测试结果: ${res.success ? '成功' : '失败'}`)
      
      if (res.success) {
        this.addLog(`API返回${res.data.length}个场景`)
        res.data.forEach(scene => {
          this.addLog(`API场景: ${scene.name} - ${scene._id}`)
        })
      } else {
        this.addLog(`API失败: ${res.message}`)
      }
    } catch (error) {
      this.addLog(`API异常: ${error.message}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== AI模型相关方法 ====================
  
  /**
   * 检查AI模型数据
   */
  async checkAIModels() {
    this.setData({ loading: true })
    this.addLog('开始检查AI模型数据...')
    
    try {
      const res = await apiService.checkAIModelsData()
      this.addLog(`检查结果: ${res.success ? '成功' : '失败'}`)
      
      if (res.success) {
        this.setData({ aiModelsData: res.data })
        this.addLog(`发现${res.data.count}个AI模型，活跃${res.data.activeCount}个`)
        
        if (res.data.models && res.data.models.length > 0) {
          res.data.models.forEach(model => {
            this.addLog(`AI模型: ${model.name} (${model.provider}) - ${model.is_active ? '活跃' : '非活跃'}`)
          })
        }
      } else {
        this.addLog(`检查失败: ${res.error}`)
      }
    } catch (error) {
      this.addLog(`检查异常: ${error.message}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 添加测试AI模型
   */
  async addTestAIModels() {
    this.setData({ loading: true })
    this.addLog('开始添加测试AI模型...')
    
    try {
      const res = await apiService.addTestAIModels()
      this.addLog(`添加结果: ${res.success ? '成功' : '失败'}`)
      
      if (res.success) {
        this.addLog(`添加了${res.data.added}个测试AI模型`)
        if (res.data.models && res.data.models.length > 0) {
          res.data.models.forEach(model => {
            this.addLog(`新增: ${model.name} (${model.provider})`)
          })
        }
        // 重新检查数据
        await this.checkAIModels()
      } else {
        this.addLog(`添加失败: ${res.error}`)
      }
    } catch (error) {
      this.addLog(`添加异常: ${error.message}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== 提示词模板相关方法 ====================
  
  /**
   * 检查提示词模板数据
   */
  async checkPromptTemplates() {
    this.setData({ loading: true })
    this.addLog('开始检查提示词模板数据...')
    
    try {
      const res = await apiService.checkPromptTemplatesData()
      this.addLog(`检查结果: ${res.success ? '成功' : '失败'}`)
      
      if (res.success) {
        this.setData({ promptTemplatesData: res.data })
        this.addLog(`发现${res.data.count}个提示词模板，活跃${res.data.activeCount}个`)
        
        if (res.data.templates && res.data.templates.length > 0) {
          res.data.templates.forEach(template => {
            this.addLog(`模板: ${template.type}/${template.category} - ${template.is_active ? '活跃' : '非活跃'}`)
          })
        }
      } else {
        this.addLog(`检查失败: ${res.error}`)
      }
    } catch (error) {
      this.addLog(`检查异常: ${error.message}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 添加测试提示词模板
   */
  async addTestPromptTemplates() {
    this.setData({ loading: true })
    this.addLog('开始添加测试提示词模板...')
    
    try {
      const res = await apiService.addTestPromptTemplates()
      this.addLog(`添加结果: ${res.success ? '成功' : '失败'}`)
      
      if (res.success) {
        this.addLog(`添加了${res.data.added}个测试提示词模板`)
        if (res.data.templates && res.data.templates.length > 0) {
          res.data.templates.forEach(template => {
            this.addLog(`新增: ${template.name} (${template.type}/${template.category})`)
          })
        }
        // 重新检查数据
        await this.checkPromptTemplates()
      } else {
        this.addLog(`添加失败: ${res.error}`)
      }
    } catch (error) {
      this.addLog(`添加异常: ${error.message}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== 统一检查方法 ====================
  
  /**
   * 检查所有集合数据
   */
  async checkAllCollections() {
    this.setData({ loading: true })
    this.addLog('开始检查所有集合数据...')
    
    try {
      const res = await apiService.checkAllCollections()
      this.addLog(`检查结果: ${res.success ? '成功' : '失败'}`)
      
      if (res.success) {
        this.setData({ allCollectionsData: res.data })
        const summary = res.data.summary
        this.addLog(`总结: ${summary.existingCollections}/${summary.totalCollections}个集合存在`)
        this.addLog(`共${summary.totalRecords}条记录，${summary.activeRecords}条活跃`)
        
        // 更新各个集合的数据
        this.setData({
          scenesData: res.data.details.scenes.data,
          aiModelsData: res.data.details.aiModels.data,
          promptTemplatesData: res.data.details.promptTemplates.data
        })
        
        // 输出详细信息
        Object.keys(res.data.details).forEach(key => {
          const detail = res.data.details[key]
          if (detail.success && detail.data.hasCollection) {
            this.addLog(`${key}: ${detail.data.count}条记录 (活跃: ${detail.data.activeCount})`)
          } else {
            this.addLog(`${key}: 集合不存在或无数据`)
          }
        })
      } else {
        this.addLog(`检查失败: ${res.error}`)
      }
    } catch (error) {
      this.addLog(`检查异常: ${error.message}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 清空日志
   */
  clearLogs() {
    this.setData({ logs: [] })
  },

  /**
   * 复制日志
   */
  copyLogs() {
    const logText = this.data.logs.join('\n')
    wx.setClipboardData({
      data: logText,
      success: () => {
        wx.showToast({ title: '日志已复制', icon: 'success' })
      }
    })
  }
})