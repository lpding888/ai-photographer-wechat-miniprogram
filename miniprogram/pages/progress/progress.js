// 拍摄进度页面
const apiService = require('../../utils/api.js')
const app = getApp()

Page({
  data: {
    taskId: '',
    workId: '',
    type: '', // photography 或 fitting
    mode: '', // 'pose_variation' 或其他
    status: 'pending', // pending, processing, retry, completed, failed, timeout
    progress: 0,
    message: '摄影师准备中...',
    result: null,
    error_message: '',

    // 轮询相关
    pollTimer: null,
    pollInterval: 3000, // 3秒轮询一次
    maxPollCount: 19, // ⏰ 改为19次（56秒超时：19 × 3秒 = 57秒）
    currentPollCount: 0,
    _polling: false, // 并发保护

    // 页面状态
    canGoBack: false,

    // 🔄 重试相关
    canRetry: false,
    retryParams: null, // 保存重试所需的参数
    isRetrying: false
  },

  // 页面路径（用于全局轮询管理）
  pagePath: 'pages/progress/progress',

  onLoad(options) {
    const { taskId, workId, type, mode, referenceWorkId, posePresetId, poseDescription } = options

    if (!taskId || !type) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    // 保存参数用于重试
    const retryParams = {
      taskId,
      workId,
      type,
      mode,
      referenceWorkId: referenceWorkId || null,
      posePresetId: posePresetId || null,
      poseDescription: poseDescription || null
    }

    this.setData({
      taskId,
      workId: workId || '',
      type,
      mode: mode || '',
      retryParams,
      // 姿势裂变模式可以重试
      canRetry: mode === 'pose_variation'
    })

    // 🔄 注册全局轮询（防止重复）
    const registered = app.registerPolling(taskId, this.pagePath)

    if (registered) {
      // 开始轮询进度
      this.startPolling()
    } else {
      // 已被其他页面轮询，提示用户并返回
      wx.showToast({
        title: '任务正在作品页跟踪',
        icon: 'none',
        duration: 2000
      })
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/works/works'
        })
      }, 2000)
    }
  },

  onUnload() {
    // 页面卸载时清除定时器
    this.stopPolling()

    // 🔄 注销全局轮询
    if (this.data.taskId) {
      app.unregisterPolling(this.data.taskId, this.pagePath)
    }
  },

  /**
   * 开始轮询进度
   */
  startPolling() {
    if (this.data._polling) return
    this.setData({ _polling: true })
    this.checkProgress()
    this.data.pollTimer = setInterval(() => {
      this.data.currentPollCount++
      if (this.data.currentPollCount >= this.data.maxPollCount) {
        this.handleTimeout()
        return
      }
      this.checkProgress()
    }, this.data.pollInterval)
  },

  /**
   * 停止轮询
   */
  stopPolling() {
    if (this.data.pollTimer) {
      clearInterval(this.data.pollTimer)
      this.setData({
        pollTimer: null
      })
    }
    if (this.data._polling) {
      this.setData({ _polling: false })
    }
  },

  /**
   * 检查进度
   */
  async checkProgress() {
    try {
      let res
      if (this.data.type === 'photography') {
        res = await apiService.getPhotographyProgress(this.data.taskId)
      } else if (this.data.type === 'fitting') {
        res = await apiService.getFittingProgress(this.data.taskId)
      } else if (this.data.type === 'fitting-personal' || this.data.type === 'travel') {
        // 个人试衣和全球旅行使用统一的 personal 云函数
        res = await apiService.getPersonalProgress(this.data.taskId)
      } else {
        // 其他类型默认使用 photography 接口
        res = await apiService.getPhotographyProgress(this.data.taskId)
      }

      if (res && res.success) {
        const { status, progress, message, result, error_message } = res.data || {}
        const st = status || 'processing'
        const msg = (message || error_message || this.getDefaultMessage(st))

        this.setData({
          status: st,
          progress: Math.round(progress || 0),
          message: msg,
          error_message: error_message || ''
        })

        // 根据状态处理
        if (st === 'completed') {
          this.handleCompleted(result)
        } else if (st === 'failed') {
          this.handleFailed(error_message || message)
        }
      } else if (res && res.message) {
        // 接口本身错误信息
        this.setData({
          message: res.message
        })
      }
    } catch (error) {
      console.error('检查进度失败:', error)
    }
  },

  /**
   * 获取默认状态消息
   */
  getDefaultMessage(status) {
    const messages = {
      pending: '摄影师准备中...',
      processing: '摄影师正在拍摄中...',
      retry: '拍摄失败后重试中...',
      completed: '拍摄完成！',
      failed: '拍摄失败',
      timeout: '处理超时，请稍后查看'
    }
    return messages[status] || '处理中...'
  },

  /**
   * 处理完成状态
   */
  handleCompleted(result) {
    this.stopPolling()
    
    this.setData({
      result,
      canGoBack: true
    })

    // 显示完成提示
    wx.showToast({
      title: '拍摄完成！',
      icon: 'success',
      duration: 2000
    })

    // 2秒后自动跳转到作品页面
    setTimeout(() => {
      this.goToWorks()
    }, 2000)
  },

  /**
   * 处理失败状态
   */
  handleFailed(message) {
    this.stopPolling()
    const content = (message && String(message).trim()) || (this.data.error_message || '拍摄过程中出现错误，请稍后重试')
    this.setData({
      canGoBack: true,
      message: content
    })
    wx.showModal({
      title: '拍摄失败',
      content,
      showCancel: false,
      confirmText: '确定',
      success: () => {
        wx.navigateBack()
      }
    })
  },

  /**
   * 处理超时
   */
  handleTimeout() {
    this.stopPolling()

    this.setData({
      status: 'timeout',
      message: '⏰ 处理超时（超过56秒），建议点击重试',
      canGoBack: true
    })

    // 如果支持重试，显示重试选项
    if (this.data.canRetry) {
      wx.showModal({
        title: '⏰ 处理超时',
        content: '本次拍摄时间较长，这可能是服务器繁忙导致。\n\n建议：\n1. 点击"重试"重新拍摄\n2. 或稍后在作品列表查看结果',
        confirmText: '重试',
        cancelText: '稍后查看',
        success: (res) => {
          if (res.confirm) {
            this.retryGeneration()
          } else {
            wx.navigateBack()
          }
        }
      })
    } else {
      wx.showModal({
        title: '处理超时',
        content: '拍摄时间较长，请稍后在作品记录中查看结果',
        showCancel: false,
        confirmText: '确定',
        success: () => {
          wx.navigateBack()
        }
      })
    }
  },

  /**
   * 跳转到作品页面
   */
  goToWorks() {
    // 根据type设置默认tab
    const app = getApp()
    if (this.data.type === 'fitting-personal') {
      app.globalData.worksDefaultTab = 3 // 个人试衣tab的索引
    } else if (this.data.type === 'travel') {
      app.globalData.worksDefaultTab = 4 // 全球旅行tab的索引
    } else if (this.data.type === 'fitting') {
      app.globalData.worksDefaultTab = 2 // 模特换装tab的索引
    } else if (this.data.type === 'photography') {
      app.globalData.worksDefaultTab = 1 // 服装摄影tab的索引
    }

    wx.switchTab({
      url: '/pages/works/works'
    })
  },

  /**
   * 返回上一页
   */
  goBack() {
    if (this.data.canGoBack) {
      wx.navigateBack()
    }
  },

  /**
   * 取消任务（调用后端取消并退款）
   */
  cancelTask() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消本次拍摄吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          // 停止轮询，避免并发
          this.stopPolling()
          wx.showLoading({ title: '正在取消...', mask: true })
          const result = await require('../../utils/api.js').callCloudFunction('api', {
            action: 'cancelTask',
            task_id: this.data.taskId,
            __noLoading: true
          })
          wx.hideLoading()
          if (result && result.success) {
            wx.showToast({
              title: result.message || '已取消',
              icon: 'none',
              duration: 1800
            })
            setTimeout(() => {
              wx.navigateBack()
            }, 800)
          } else {
            wx.showToast({
              title: (result && result.message) ? String(result.message) : '取消失败',
              icon: 'none'
            })
            // 失败则恢复轮询（可选）
            this.startPolling()
          }
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '取消失败，请稍后重试', icon: 'none' })
          this.startPolling()
        }
      }
    })
  },

  /**
   * 🔄 重试生成
   */
  async retryGeneration() {
    if (this.data.isRetrying) {
      console.log('⚠️ 正在重试中，忽略重复请求')
      return
    }

    const { retryParams } = this.data

    if (!retryParams) {
      wx.showToast({
        title: '重试参数缺失',
        icon: 'none'
      })
      return
    }

    this.setData({ isRetrying: true })

    wx.showLoading({ title: '正在重新安排...', mask: true })

    try {
      let result = null

      // 根据类型调用不同的云函数
      if (retryParams.type === 'photography' && retryParams.mode === 'pose_variation') {
        console.log('🔄 重试姿势裂变:', retryParams)
        result = await apiService.generatePhotography({
          action: 'generate',
          mode: 'pose_variation',
          referenceWorkId: retryParams.referenceWorkId,
          posePresetId: retryParams.posePresetId,
          poseDescription: retryParams.poseDescription,
          count: 1
        })
      } else if (retryParams.type === 'fitting' && retryParams.mode === 'pose_variation') {
        result = await apiService.generateFitting({
          action: 'generate',
          mode: 'pose_variation',
          referenceWorkId: retryParams.referenceWorkId,
          posePresetId: retryParams.posePresetId,
          poseDescription: retryParams.poseDescription,
          count: 1
        })
      } else {
        wx.hideLoading()
        wx.showToast({
          title: '不支持重试此类型',
          icon: 'none'
        })
        this.setData({ isRetrying: false })
        return
      }

      wx.hideLoading()

      if (result && result.success) {
        const newTaskId = result.data.task_id
        const newWorkId = result.data.work_id

        console.log('✅ 重试成功，新任务ID:', newTaskId)

        // 重置状态
        this.setData({
          taskId: newTaskId,
          workId: newWorkId,
          status: 'pending',
          progress: 0,
          message: '摄影师正在重新拍摄...',
          currentPollCount: 0,
          isRetrying: false
        })

        // 更新重试参数中的taskId和workId
        this.setData({
          'retryParams.taskId': newTaskId,
          'retryParams.workId': newWorkId
        })

        // 重新开始轮询
        this.startPolling()

        wx.showToast({
          title: '已重新提交',
          icon: 'success',
          duration: 2000
        })
      } else {
        this.setData({ isRetrying: false })
        wx.showToast({
          title: result.message || '重试失败',
          icon: 'none',
          duration: 3000
        })
      }
    } catch (error) {
      wx.hideLoading()
      this.setData({ isRetrying: false })
      console.error('🔄 重试失败:', error)
      wx.showToast({
        title: '重试失败: ' + error.message,
        icon: 'none',
        duration: 3000
      })
    }
  }
})