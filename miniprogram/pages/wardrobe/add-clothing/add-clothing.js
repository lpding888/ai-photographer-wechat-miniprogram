// 添加衣物页面
const tencentCI = require('../../../utils/tencent-ci.js')
const dataManager = require('../../../utils/data-manager.js')

Page({
  data: {
    currentStep: 1, // 1=选择图片, 2=AI处理, 3=补充信息

    // 图片
    selectedImage: '',
    processedImage: '',

    // AI处理状态
    processing: false,
    processMessage: 'AI正在打理您的衣物...',

    // 衣物信息
    clothingName: '',
    selectedCategory: '',
    suggestedTags: [],

    // 分类选项
    categories: [
      { key: 'top', label: '上装', icon: '👕' },
      { key: 'bottom', label: '下装', icon: '👖' },
      { key: 'dress', label: '连衣裙', icon: '👗' },
      { key: 'shoes', label: '鞋子', icon: '👟' },
      { key: 'accessory', label: '配饰', icon: '🎒' },
      { key: 'other', label: '其他', icon: '📦' }
    ],

    // 成功状态
    showSuccess: false
  },

  // 定时器引用，用于页面卸载时清理
  timers: [],

  onLoad(options) {
    console.log('add-clothing.js onLoad')
    this.initSuggestedTags()
  },

  onUnload() {
    // 清理所有定时器，防止内存泄漏
    this.timers.forEach(timer => clearTimeout(timer))
    this.timers = []
  },

  /**
   * 初始化智能标签
   */
  initSuggestedTags() {
    const tags = [
      { name: '休闲', selected: false },
      { name: '正式', selected: false },
      { name: '运动', selected: false },
      { name: '时尚', selected: false },
      { name: '简约', selected: false },
      { name: '经典', selected: false },
      { name: '舒适', selected: false },
      { name: '百搭', selected: false }
    ]
    this.setData({ suggestedTags: tags })
  },

  /**
   * 拍照
   */
  onTakePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      sizeType: ['compressed'], // 压缩图片
      maxDuration: 60,
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          const tempFilePath = res.tempFiles[0].tempFilePath
          this.handleImageSelected(tempFilePath)
        }
      },
      fail: (err) => {
        console.log('选择图片失败:', err)
        if (err.errMsg !== 'chooseMedia:fail cancel') {
          wx.showToast({ title: '选择图片失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 从相册选择
   */
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'], // 压缩图片
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          const tempFilePath = res.tempFiles[0].tempFilePath
          this.handleImageSelected(tempFilePath)
        }
      },
      fail: (err) => {
        console.log('选择图片失败:', err)
        if (err.errMsg !== 'chooseMedia:fail cancel') {
          wx.showToast({ title: '选择图片失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 处理选中的图片
   */
  async handleImageSelected(tempFilePath) {
    try {
      // 上传到云存储
      wx.showLoading({ title: '上传中...' })

      const cloudPath = `wardrobe/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFilePath
      })

      wx.hideLoading()

      if (uploadRes.fileID) {
        this.setData({
          selectedImage: uploadRes.fileID,
          currentStep: 2
        })

        // 开始AI抠图处理
        this.startMattingProcess(uploadRes.fileID)
      }
    } catch (error) {
      wx.hideLoading()
      console.error('上传图片失败:', error)
      wx.showToast({ title: '上传失败，请检查网络后重试', icon: 'none' })
    }
  },

  /**
   * 开始AI抠图处理
   */
  async startMattingProcess(imageUrl) {
    this.setData({
      processing: true,
      processMessage: 'AI正在打理您的衣物...'
    })

    try {
      // 使用模拟抠图（开发阶段）
      // 实际部署时替换为：const result = await tencentCI.mattingImage(imageUrl)
      const result = await tencentCI.mockMattingImage(imageUrl)

      if (result.success) {
        // 模拟处理过程的消息变化，保存定时器引用
        const timer1 = setTimeout(() => {
          this.setData({ processMessage: '正在移除背景...' })
        }, 500)
        this.timers.push(timer1)

        const timer2 = setTimeout(() => {
          this.setData({ processMessage: '正在优化细节...' })
        }, 1000)
        this.timers.push(timer2)

        const timer3 = setTimeout(() => {
          this.setData({
            processing: false,
            processedImage: result.processedImageUrl,
            processMessage: '处理完成！'
          })
        }, 1500)
        this.timers.push(timer3)
      } else {
        throw new Error(result.error || '抠图失败')
      }
    } catch (error) {
      console.error('AI抠图失败:', error)
      this.setData({
        processing: false,
        processMessage: '处理失败，将使用原图'
      })

      wx.showModal({
        title: '提示',
        content: '抠图处理失败，是否继续使用原图？',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              processedImage: this.data.selectedImage
            })
          } else {
            this.onReselect()
          }
        }
      })
    }
  },

  /**
   * 重新选择图片
   */
  onReselect() {
    this.setData({
      currentStep: 1,
      selectedImage: '',
      processedImage: '',
      processing: false
    })
  },

  /**
   * 下一步（进入信息补充）
   */
  onNextStep() {
    if (!this.data.processedImage) {
      wx.showToast({ title: '请等待处理完成', icon: 'none' })
      return
    }

    this.setData({ currentStep: 3 })
    this.analyzeImageTags() // AI分析标签
  },

  /**
   * AI分析图片生成智能标签（模拟）
   */
  analyzeImageTags() {
    // 实际应该调用图像识别API
    // 这里模拟返回一些标签
    const randomTags = ['休闲', '简约', '百搭']
    const tags = this.data.suggestedTags.map(tag => {
      return {
        ...tag,
        selected: randomTags.includes(tag.name)
      }
    })
    this.setData({ suggestedTags: tags })
  },

  /**
   * 名称输入
   */
  onNameInput(e) {
    this.setData({ clothingName: e.detail.value })
  },

  /**
   * 选择分类
   */
  onSelectCategory(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ selectedCategory: key })
  },

  /**
   * 切换标签选中状态
   */
  onToggleTag(e) {
    const index = e.currentTarget.dataset.index
    const tags = [...this.data.suggestedTags]
    tags[index].selected = !tags[index].selected
    this.setData({ suggestedTags: tags })
  },

  /**
   * 保存衣物
   */
  async onSaveClothing() {
    // 验证必填项
    if (!this.data.clothingName.trim()) {
      wx.showToast({ title: '请输入衣物名称', icon: 'none' })
      return
    }

    if (!this.data.selectedCategory) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
      return
    }

    if (!this.data.processedImage) {
      wx.showToast({ title: '图片处理未完成', icon: 'none' })
      return
    }

    try {
      // 获取选中的标签
      const selectedTags = this.data.suggestedTags
        .filter(tag => tag.selected)
        .map(tag => tag.name)

      // 构建衣物对象
      // 生成唯一ID：时间戳 + 随机数，避免快速操作时的ID冲突
      const uniqueId = Date.now() + Math.floor(Math.random() * 10000)
      const clothing = {
        id: uniqueId,
        name: this.data.clothingName.trim(),
        category: this.data.selectedCategory,
        tags: selectedTags,
        url: this.data.selectedImage,
        processedImage: this.data.processedImage,
        useCount: 0,
        isFavorite: false,
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString()
      }

      // 使用数据管理器保存
      const result = dataManager.addWardrobeItem(clothing)

      if (result.success) {
        // 显示成功动画
        this.setData({ showSuccess: true })

        // 2秒后返回衣柜页面
        setTimeout(() => {
          wx.navigateBack()
        }, 2000)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('保存衣物失败:', error)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  }
})
