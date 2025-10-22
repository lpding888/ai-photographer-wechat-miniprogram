// 用户反馈页面
const apiService = require('../../../../utils/api.js')
const performanceMonitor = require('../../../../utils/performance.js')

Page({
  data: {
    // 反馈类型
    feedbackTypes: [
      { id: 'bug', label: '问题报告', icon: '🐛', description: '功能异常、崩溃等问题' },
      { id: 'feature', label: '功能建议', icon: '💡', description: '新功能需求或改进建议' },
      { id: 'performance', label: '性能问题', icon: '⚡', description: '加载慢、卡顿等性能问题' },
      { id: 'ui', label: '界面优化', icon: '🎨', description: '界面设计、交互体验建议' },
      { id: 'content', label: '内容质量', icon: '📸', description: 'AI生成效果、内容质量问题' },
      { id: 'other', label: '其他问题', icon: '💬', description: '其他类型的反馈' }
    ],

    // 选中的反馈类型
    selectedType: '',

    // 反馈内容
    feedbackContent: '',
    contactInfo: '',

    // 附件
    attachments: [],
    maxAttachments: 3,

    // 提交状态
    submitting: false,

    // 是否包含性能数据
    includePerformanceData: false,

    // 历史反馈
    feedbackHistory: [],
    showHistory: false
  },

  onLoad(options) {
    this.loadFeedbackHistory()

    // 处理从作品详情页传来的参数
    if (options.workInfo) {
      try {
        const workInfo = JSON.parse(decodeURIComponent(options.workInfo))
        this.setData({
          selectedType: 'content',
          feedbackContent: `关于作品"${workInfo.title}"的反馈：\n\n`
        })
        console.log('从作品页面获取到信息:', workInfo)
      } catch (error) {
        console.error('解析作品信息失败:', error)
      }
    }
  },

  /**
   * 选择反馈类型
   */
  selectFeedbackType(e) {
    const { type } = e.currentTarget.dataset
    this.setData({ selectedType: type })
  },

  /**
   * 输入反馈内容
   */
  onFeedbackInput(e) {
    this.setData({ feedbackContent: e.detail.value })
  },

  /**
   * 输入联系方式
   */
  onContactInput(e) {
    this.setData({ contactInfo: e.detail.value })
  },

  /**
   * 切换性能数据包含状态
   */
  togglePerformanceData(e) {
    this.setData({ includePerformanceData: e.detail.value })
  },

  /**
   * 添加附件
   */
  addAttachment() {
    const { attachments, maxAttachments } = this.data

    if (attachments.length >= maxAttachments) {
      wx.showToast({
        title: `最多只能添加${maxAttachments}个附件`,
        icon: 'none'
      })
      return
    }

    wx.showActionSheet({
      itemList: ['拍照', '从相册选择', '录制视频'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.captureImage()
        } else if (res.tapIndex === 1) {
          this.chooseImage()
        } else if (res.tapIndex === 2) {
          this.captureVideo()
        }
      }
    })
  },

  /**
   * 拍照
   */
  captureImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        const media = res.tempFiles[0]
        this.addAttachmentFile({
          type: 'image',
          path: media.tempFilePath,
          size: media.size
        })
      }
    })
  },

  /**
   * 从相册选择图片
   */
  chooseImage() {
    wx.chooseMedia({
      count: this.data.maxAttachments - this.data.attachments.length,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        res.tempFiles.forEach(media => {
          this.addAttachmentFile({
            type: 'image',
            path: media.tempFilePath,
            size: media.size
          })
        })
      }
    })
  },

  /**
   * 录制视频
   */
  captureVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['camera'],
      maxDuration: 30, // 最长30秒
      success: (res) => {
        const media = res.tempFiles[0]
        this.addAttachmentFile({
          type: 'video',
          path: media.tempFilePath,
          size: media.size,
          duration: media.duration
        })
      }
    })
  },

  /**
   * 添加附件文件
   */
  addAttachmentFile(file) {
    const attachments = [...this.data.attachments]
    attachments.push({
      id: Date.now() + Math.random(),
      ...file
    })
    this.setData({ attachments })
  },

  /**
   * 移除附件
   */
  removeAttachment(e) {
    const { index } = e.currentTarget.dataset
    const attachments = [...this.data.attachments]
    attachments.splice(index, 1)
    this.setData({ attachments })
  },

  /**
   * 预览附件
   */
  previewAttachment(e) {
    const { index } = e.currentTarget.dataset
    const attachment = this.data.attachments[index]

    if (attachment.type === 'image') {
      wx.previewImage({
        urls: [attachment.path],
        current: attachment.path
      })
    } else if (attachment.type === 'video') {
      wx.previewMedia({
        sources: [{
          url: attachment.path,
          type: 'video'
        }]
      })
    }
  },

  /**
   * 提交反馈
   */
  async submitFeedback() {
    if (!this.validateForm()) {
      return
    }

    if (this.data.submitting) {
      return
    }

    this.setData({ submitting: true })

    try {
      // 上传附件
      const attachmentUrls = await this.uploadAttachments()

      // 收集系统信息
      const systemInfo = await this.getSystemInfo()

      // 收集性能数据
      let performanceData = null
      if (this.data.includePerformanceData) {
        performanceData = performanceMonitor.exportReport()
      }

      // 准备反馈数据
      const feedbackData = {
        type: this.data.selectedType,
        content: this.data.feedbackContent,
        contactInfo: this.data.contactInfo,
        attachments: attachmentUrls,
        systemInfo,
        performanceData,
        timestamp: Date.now()
      }

      // 提交反馈
      const result = await apiService.callCloudFunction('feedback', {
        action: 'submitFeedback',
        feedback: feedbackData
      })

      if (result.success) {
        wx.showToast({
          title: '反馈提交成功',
          icon: 'success'
        })

        // 清空表单
        this.resetForm()

        // 重新加载历史记录
        this.loadFeedbackHistory()

        // 延迟返回
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        wx.showToast({
          title: result.message || '提交失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('提交反馈失败:', error)
      wx.showToast({
        title: '提交失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 验证表单
   */
  validateForm() {
    const { selectedType, feedbackContent } = this.data

    if (!selectedType) {
      wx.showToast({
        title: '请选择反馈类型',
        icon: 'none'
      })
      return false
    }

    if (!feedbackContent.trim()) {
      wx.showToast({
        title: '请填写反馈内容',
        icon: 'none'
      })
      return false
    }

    if (feedbackContent.length < 10) {
      wx.showToast({
        title: '反馈内容至少10个字符',
        icon: 'none'
      })
      return false
    }

    return true
  },

  /**
   * 上传附件
   */
  async uploadAttachments() {
    const { attachments } = this.data
    const uploadPromises = []

    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i]
      const cloudPath = `feedback/${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`

      const uploadPromise = apiService.uploadFile(attachment.path, cloudPath)
        .then(result => ({
          ...attachment,
          url: result.success ? result.data.file_id : null
        }))

      uploadPromises.push(uploadPromise)
    }

    const results = await Promise.all(uploadPromises)
    return results.filter(result => result.url)
  },

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    return new Promise((resolve) => {
      try {
        // 使用新的 API 来替代已废弃的 getSystemInfo
        const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {}
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {}
        const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {}
        const systemSetting = wx.getSystemSetting ? wx.getSystemSetting() : {}
        const appAuthSetting = wx.getAppAuthorizeSetting ? wx.getAppAuthorizeSetting() : {}

        resolve({
          // 设备信息
          platform: deviceInfo.platform,
          system: deviceInfo.system,
          brand: deviceInfo.brand,
          model: deviceInfo.model,
          pixelRatio: deviceInfo.pixelRatio,

          // 窗口信息
          screenWidth: windowInfo.screenWidth,
          screenHeight: windowInfo.screenHeight,
          windowWidth: windowInfo.windowWidth,
          windowHeight: windowInfo.windowHeight,
          statusBarHeight: windowInfo.statusBarHeight,

          // 应用信息
          version: appBaseInfo.version,
          SDKVersion: appBaseInfo.SDKVersion,
          language: appBaseInfo.language,

          // 系统设置
          bluetoothEnabled: systemSetting.bluetoothEnabled,
          locationEnabled: systemSetting.locationEnabled,
          wifiEnabled: systemSetting.wifiEnabled,

          // 授权设置
          albumAuthorized: appAuthSetting.albumAuthorized,
          cameraAuthorized: appAuthSetting.cameraAuthorized,
          locationAuthorized: appAuthSetting.locationAuthorized,
          microphoneAuthorized: appAuthSetting.microphoneAuthorized,
          notificationAuthorized: appAuthSetting.notificationAuthorized
        })
      } catch (error) {
        // 如果新 API 不可用，回退到旧 API
        wx.getSystemInfo({
          success: (res) => {
            resolve({
              platform: res.platform,
              system: res.system,
              version: res.version,
              SDKVersion: res.SDKVersion,
              brand: res.brand,
              model: res.model,
              pixelRatio: res.pixelRatio,
              screenWidth: res.screenWidth,
              screenHeight: res.screenHeight,
              windowWidth: res.windowWidth,
              windowHeight: res.windowHeight,
              statusBarHeight: res.statusBarHeight,
              language: res.language,
              fontSizeSetting: res.fontSizeSetting,
              albumAuthorized: res.albumAuthorized,
              cameraAuthorized: res.cameraAuthorized,
              locationAuthorized: res.locationAuthorized,
              microphoneAuthorized: res.microphoneAuthorized,
              notificationAuthorized: res.notificationAuthorized,
              bluetoothEnabled: res.bluetoothEnabled,
              locationEnabled: res.locationEnabled,
              wifiEnabled: res.wifiEnabled
            })
          },
          fail: () => {
            resolve({})
          }
        })
      }
    })
  },

  /**
   * 重置表单
   */
  resetForm() {
    this.setData({
      selectedType: '',
      feedbackContent: '',
      contactInfo: '',
      attachments: [],
      includePerformanceData: false
    })
  },

  /**
   * 加载反馈历史
   */
  async loadFeedbackHistory() {
    try {
      const result = await apiService.callCloudFunction('feedback', {
        action: 'getFeedbackHistory'
      })

      if (result.success) {
        this.setData({ feedbackHistory: result.data || [] })
      }
    } catch (error) {
      console.error('加载反馈历史失败:', error)
    }
  },

  /**
   * 显示/隐藏历史记录
   */
  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory })
  },

  /**
   * 查看历史反馈详情
   */
  viewHistoryDetail(e) {
    const { index } = e.currentTarget.dataset
    const feedback = this.data.feedbackHistory[index]

    wx.showModal({
      title: '反馈详情',
      content: `类型: ${feedback.type}\n内容: ${feedback.content}\n状态: ${feedback.status || '处理中'}`,
      showCancel: false
    })
  },

  /**
   * 获取反馈类型信息
   */
  getFeedbackTypeInfo(typeId) {
    return this.data.feedbackTypes.find(type => type.id === typeId) || {}
  },

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
})