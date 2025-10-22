// 试衣间页面
const apiService = require('../../utils/api.js')
const uploadService = require('../../utils/upload.js')
const imageHandler = require('../../utils/image-handler.js')

Page({
  data: {
    // 个人照片
    modelImage: null,

    // 用户积分（可为空表示未知）
    userCredits: null,

    // 服装配饰图片
    clothingImages: {
      top: null,      // 上衣
      bottom: null,   // 裤子/裙子
      shoes: null,    // 鞋子
      accessory: null // 配饰
    },

    // 参数设置
    parameters: {
      overall_clothing_material: '',
      pose_adjustment: '',
      additional_outfit_description: '',
      mood_and_atmosphere: '',
      lighting_style: ''
    },

    // 场景相关
    scenes: [],
    selectedScene: null,
    selectedSceneId: null,
    // 用户自定义场景（若填写则优先使用）
    customSceneText: '',

    // 高级选项
    showAdvanced: false,

    // 使用指南弹窗
    showGuide: false,

    // 页面加载骨架
    loading: true,
    
    // 生成状态
    isGenerating: false,
    currentTaskId: null,
    
    // 服装类型标签
    clothingTypes: [
      { key: 'top', label: '上衣', required: false },
      { key: 'bottom', label: '裤子/裙子', required: false },
      { key: 'shoes', label: '鞋子', required: false },
      { key: 'accessory', label: '配饰', required: false }
    ],

    // 预设管理
    showPresetModal: false,
    presets: [],
    newPresetName: ''
  },

  async onLoad(options) {
    try {
      await Promise.all([this.loadScenes(), this.loadCredits()])
      this.loadPresets()

      // 检查是否需要显示使用指南
      this.checkShowGuide()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 检查是否显示使用指南
   */
  checkShowGuide() {
    try {
      const hasSeenGuide = wx.getStorageSync('fitting_guide_seen')
      if (!hasSeenGuide) {
        this.setData({ showGuide: true })
      }
    } catch (e) {
      console.error('检查使用指南失败:', e)
    }
  },

  /**
   * 关闭使用指南
   */
  closeGuide() {
    this.setData({ showGuide: false })
  },

  /**
   * 关闭使用指南并不再提示
   */
  closeGuideForever() {
    try {
      wx.setStorageSync('fitting_guide_seen', true)
      this.setData({ showGuide: false })
      wx.showToast({
        title: '已记住，下次不再提示',
        icon: 'success'
      })
    } catch (e) {
      console.error('保存使用指南状态失败:', e)
      this.setData({ showGuide: false })
    }
  },

  /**
   * 加载场景列表
   */
  async loadScenes() {
    console.log('fitting.js loadScenes: 开始加载场景')
    try {
      const res = await apiService.getScenes()
      console.log('fitting.js loadScenes: 场景加载结果', res)
      if (res.success) {
        console.log('fitting.js loadScenes: 场景数据:', res.data)

        // 优化场景图片URL，使用CDN加速和缩略图
        const optimizedScenes = res.data.map(scene => ({
          ...scene,
          thumbnail_url: imageHandler.getThumbnailUrl(scene.thumbnail_url, 'medium')
        }))

        this.setData({
          scenes: optimizedScenes,
          selectedScene: null,
          selectedSceneId: null
        })
        console.log('fitting.js loadScenes: 场景设置完成', this.data.scenes.length, '个场景')
        // 尝试应用最近一次预设
        this.applyLastUsedPreset()
      } else {
        console.error('fitting.js loadScenes: 场景加载失败', res.message)
        wx.showToast({
          title: '场景数据加载失败，请检查网络',
          icon: 'none',
          duration: 3000
        })
        this.setData({
          scenes: [],
          selectedScene: null,
          selectedSceneId: null
        })
        this.applyLastUsedPreset()
      }
    } catch (error) {
      console.error('fitting.js loadScenes: 加载场景异常:', error)
      wx.showToast({
        title: '场景数据加载失败，请检查网络',
        icon: 'none',
        duration: 3000
      })
      this.setData({
        scenes: [],
        selectedScene: null,
        selectedSceneId: null
      })
      // 即便失败也尝试应用（若有默认场景）
      this.applyLastUsedPreset()
    }
  },

  /**
   * 选择个人照片
   */
  async chooseModelImage() {
    try {
      const res = await uploadService.chooseAndUploadImage({
        count: 1,
        fileType: 'model',
        convertToJpeg: true
      })

      if (res.success && res.data.uploaded.length > 0) {
        const uploadedImage = res.data.uploaded[0]
        this.setData({
          modelImage: {
            fileId: uploadedImage.fileId,
            url: uploadedImage.fileId
          }
        })

        wx.showToast({
          title: '上传成功',
          icon: 'success'
        })
      }
    } catch (error) {
      console.error('选择个人照片失败:', error)
    }
  },

  /**
   * 选择服装图片
   */
  async chooseClothingImage(e) {
    const type = e.currentTarget.dataset.type
    
    try {
      const res = await uploadService.chooseAndUploadImage({
        count: 1,
        fileType: type,
        convertToJpeg: true
      })

      if (res.success && res.data.uploaded.length > 0) {
        const uploadedImage = res.data.uploaded[0]
        this.setData({
          [`clothingImages.${type}`]: {
            fileId: uploadedImage.fileId,
            url: uploadedImage.fileId
          }
        })

        wx.showToast({
          title: '上传成功',
          icon: 'success'
        })
      }
    } catch (error) {
      console.error('选择服装图片失败:', error)
    }
  },

  /**
   * 删除图片
   */
  deleteImage(e) {
    const type = e.currentTarget.dataset.type
    
    if (type === 'model') {
      this.setData({
        modelImage: null
      })
    } else {
      this.setData({
        [`clothingImages.${type}`]: null
      })
    }
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      urls: [url],
      current: url
    })
  },

  /**
   * 自定义场景输入
   */
  onCustomSceneInput(e) {
    const val = (e.detail && e.detail.value) ? e.detail.value.trim() : ''
    this.setData({
      customSceneText: val,
      'parameters.location': val
    })
  },

  /**
   * 文本输入处理
   */
  onTextInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`parameters.${field}`]: value
    })
  },

  /**
   * 切换高级选项
   */
  toggleAdvanced() {
    this.setData({
      showAdvanced: !this.data.showAdvanced
    })
  },

  /**
   * 选择场景
   */
  selectScene(e) {
    const index = e.currentTarget.dataset.index
    const scene = this.data.scenes[index]
    this.setData({
      selectedScene: scene,
      selectedSceneId: scene ? (scene._id || scene.id) : null
    })
  },

  /**
   * 预览场景大图（长按）
   */
  previewScene(e) {
    try {
      const current = e.currentTarget.dataset.url
      const urls = (this.data.scenes || []).map(s => s && (s.thumbnail_url || s.cover || s.url)).filter(Boolean)
      if (urls && urls.length) {
        wx.previewImage({ urls, current })
      }
    } catch (err) {
      console.warn('预览场景失败', err)
    }
  },



  /**
   * 开始生成 - 支持游客提示登录
   */
  async startGenerate() {
    // 检查用户是否登录
    const app = getApp()
    if (!app.globalData.userInfo) {
      // 游客体验时，友好提示登录
      wx.showModal({
        title: '开始试衣',
        content: '请先登录体验AI试衣功能，免费生成您的专属试衣效果',
        confirmText: '立即登录',
        cancelText: '再看看',
        success: (res) => {
          if (res.confirm) {
            // 跳转到首页登录
            wx.switchTab({
              url: '/pages/index/index'
            })
          }
        }
      })
      return
    }

    // 验证必需参数
    if (!this.data.modelImage) {
      wx.showToast({
        title: '请上传个人照片',
        icon: 'none'
      })
      return
    }
    // 生成前保存最近一次预设（不含图片）
    this.saveLastUsedPreset()

    // 检查是否至少上传了一件服装
    const hasClothing = Object.values(this.data.clothingImages).some(img => img !== null)
    if (!hasClothing) {
      wx.showToast({
        title: '请至少上传一件服装',
        icon: 'none'
      })
      return
    }

    if (!this.data.selectedScene && !this.data.customSceneText) {
      wx.showToast({
        title: '请选择拍摄场景或输入自定义场景',
        icon: 'none'
      })
      return
    }

    // 积分校验（若已知余额且不足则拦截）
    const need = 1 // 固定消耗1积分
    const credits = this.data.userCredits
    if (typeof credits === 'number' && credits < need) {
      wx.showModal({
        title: '积分不足',
        content: `本次预计消耗 ${need} 张，当前剩余 ${credits} 张。是否前往充值？`,
        confirmText: '去充值',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/profile/profile' })
          }
        }
      })
      return
    }
    // 尝试订阅消息授权（若有配置）
    await this.requestSubscribeIfAvailable()

    this.setData({
      isGenerating: true
    })

    try {
      // 准备服装图片数据
      const clothingImages = {}
      Object.keys(this.data.clothingImages).forEach(key => {
        const img = this.data.clothingImages[key]
        if (img) {
          clothingImages[key] = img.fileId
        }
      })

      // 准备参数（修复 sceneId 与补齐 location，优先使用自定义场景）
      const params = {
        modelImage: this.data.modelImage.fileId,
        clothingImages,
        parameters: {
          ...this.data.parameters,
          // 修复地址映射：优先使用自定义场景，否则使用选中场景的名称
          location: this.data.customSceneText ||
                   (this.data.selectedScene ? this.data.selectedScene.name : '') ||
                   this.data.parameters.location || ''
        },
        sceneId: this.data.customSceneText
          ? null
          : (this.data.selectedScene ? (this.data.selectedScene.id || this.data.selectedScene._id) : null),
        count: 1 // 固定生成1张
      }

      // 调用生成接口
      const res = await apiService.generateFitting(params)
      
      if (res.success) {
        this.setData({
          currentTaskId: res.data.task_id
        })
        // 写入多任务队列 pendingTasks（去重）并保留 legacy pendingTask 兼容
        try {
          const now = Date.now()
          const arr = (wx.getStorageSync('pendingTasks') || []).filter(it => it && it.taskId)
          const exists = arr.some(it => it.taskId === res.data.task_id)
          const next = exists ? arr : [...arr, { taskId: res.data.task_id, type: 'fitting', createdAt: now }]
          wx.setStorageSync('pendingTasks', next)
          // 兼容旧版逻辑，作品页会自动迁移
          wx.setStorageSync('pendingTask', { taskId: res.data.task_id, type: 'fitting', createdAt: now })
        } catch (e) {
          console.warn('写入 pendingTasks 失败', e)
        }
        // 切到作品页（tabBar页面）
        wx.switchTab({
          url: '/pages/works/works'
        })
      } else {
        this.setData({
          isGenerating: false
        })
      }
    } catch (error) {
      console.error('生成失败:', error)
      this.setData({
        isGenerating: false
      })
    }
  },

  /**
   * 重置表单
   */
  resetForm() {
    this.setData({
      modelImage: null,
      customSceneText: '',
      clothingImages: {
        top: null,
        bottom: null,
        shoes: null,
        accessory: null
      },
      parameters: {
        overall_clothing_material: '',
        pose_adjustment: '',
        additional_outfit_description: '',
        mood_and_atmosphere: '',
        lighting_style: ''
      },
      selectedScene: null,
      selectedSceneId: null,
      showAdvanced: false
    })
  },

  /**
   * 保存最近一次预设（仅参数/场景/数量，不含图片）
   */
  saveLastUsedPreset() {
    try {
      const data = {
        parameters: this.data.parameters,
        sceneId: this.data.selectedScene ? (this.data.selectedScene.id || this.data.selectedScene._id) : null,
        savedAt: Date.now()
      }
      wx.setStorageSync('last_used_fitting', data)
    } catch (e) {
      console.warn('保存 last_used_fitting 失败', e)
    }
  },

  /**
   * 应用最近一次预设（若存在）
   */
  applyLastUsedPreset() {
    try {
      const preset = wx.getStorageSync('last_used_fitting')
      if (!preset) return
      const mergedParams = { ...this.data.parameters, ...(preset.parameters || {}) }
      // 匹配场景
      let scene = this.data.selectedScene
      if (preset.sceneId && Array.isArray(this.data.scenes) && this.data.scenes.length) {
        scene = this.data.scenes.find(s => (s._id === preset.sceneId) || (s.id === preset.sceneId)) || scene
      }
      this.setData({
        parameters: mergedParams
      })
      console.log('已应用最近一次预设 fitting')
    } catch (e) {
      console.warn('应用 last_used_fitting 失败', e)
    }
  },

  /**
   * 加载用户积分（优先本地缓存；若存在 apiService.getUserCredits 则调用）
   */
  async loadCredits() {
    try {
      const cached = wx.getStorageSync('userCredits')
      if (typeof cached === 'number') {
        this.setData({ userCredits: cached })
      }
      if (typeof apiService.getUserCredits === 'function') {
        const res = await apiService.getUserCredits()
        if (res && res.success && typeof res.data?.credits === 'number') {
          this.setData({ userCredits: res.data.credits })
          try { wx.setStorageSync('userCredits', res.data.credits) } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('加载积分失败（忽略，不阻塞）', e)
    }
  },

  /**
   * 订阅消息授权（若全局配置了模板ID）
   */
  async requestSubscribeIfAvailable() {
    try {
      const app = getApp()
      const tplIds = (app && app.globalData && app.globalData.subscribeTplIds) || wx.getStorageSync('subscribeTplIds') || []
      if (Array.isArray(tplIds) && tplIds.length > 0 && wx.requestSubscribeMessage) {
        await wx.requestSubscribeMessage({ tmplIds: tplIds })
      }
    } catch (e) {
      console.warn('订阅消息授权失败（忽略）', e)
    }
  },

  /**
   * 加载预设列表
   */
  loadPresets() {
    try {
      const presets = wx.getStorageSync('fitting_presets') || []
      this.setData({ presets })
    } catch (e) {
      console.error('加载预设失败:', e)
      this.setData({ presets: [] })
    }
  },

  /**
   * 打开预设管理弹窗
   */
  openPresetModal() {
    this.loadPresets()
    this.setData({
      showPresetModal: true,
      newPresetName: ''
    })
  },

  /**
   * 关闭预设管理弹窗
   */
  closePresetModal() {
    this.setData({ showPresetModal: false })
  },

  /**
   * 预设名称输入
   */
  onPresetNameInput(e) {
    this.setData({ newPresetName: e.detail.value })
  },

  /**
   * 保存当前配置为预设
   */
  saveCurrentPreset() {
    const name = this.data.newPresetName.trim()
    if (!name) {
      wx.showToast({
        title: '请输入预设名称',
        icon: 'none'
      })
      return
    }

    try {
      const preset = {
        id: Date.now(),
        name: name,
        parameters: JSON.parse(JSON.stringify(this.data.parameters)),
        customSceneText: this.data.customSceneText,
        sceneId: this.data.selectedScene ? (this.data.selectedScene.id || this.data.selectedScene._id) : null,
        sceneName: this.data.selectedScene ? this.data.selectedScene.name : '',
        createdAt: Date.now()
      }

      const presets = wx.getStorageSync('fitting_presets') || []
      presets.unshift(preset)
      wx.setStorageSync('fitting_presets', presets)

      this.setData({
        presets: presets,
        newPresetName: ''
      })

      wx.showToast({
        title: '预设保存成功',
        icon: 'success'
      })
    } catch (e) {
      console.error('保存预设失败:', e)
      wx.showToast({
        title: '保存预设失败',
        icon: 'none'
      })
    }
  },

  /**
   * 加载预设
   */
  loadPreset(e) {
    const index = e.currentTarget.dataset.index
    const preset = this.data.presets[index]

    if (!preset) return

    try {
      // 应用参数
      this.setData({
        parameters: JSON.parse(JSON.stringify(preset.parameters)),
        customSceneText: preset.customSceneText || ''
      })

      // 匹配场景
      if (preset.sceneId && this.data.scenes.length > 0) {
        const scene = this.data.scenes.find(s =>
          (s._id === preset.sceneId) || (s.id === preset.sceneId)
        )
        if (scene) {
          this.setData({
            selectedScene: scene,
            selectedSceneId: scene._id || scene.id
          })
        }
      }

      this.setData({ showPresetModal: false })

      wx.showToast({
        title: '预设加载成功',
        icon: 'success'
      })
    } catch (e) {
      console.error('加载预设失败:', e)
      wx.showToast({
        title: '加载预设失败',
        icon: 'none'
      })
    }
  },

  /**
   * 删除预设
   */
  deletePreset(e) {
    const index = e.currentTarget.dataset.index
    const preset = this.data.presets[index]

    if (!preset) return

    wx.showModal({
      title: '确认删除',
      content: `确定要删除预设"${preset.name}"吗？`,
      success: (res) => {
        if (res.confirm) {
          try {
            const presets = [...this.data.presets]
            presets.splice(index, 1)
            wx.setStorageSync('fitting_presets', presets)
            this.setData({ presets })

            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })
          } catch (e) {
            console.error('删除预设失败:', e)
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})