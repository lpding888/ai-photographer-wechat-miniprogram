// 服装摄影页面
const apiService = require('../../utils/api.js')
const uploadService = require('../../utils/upload.js')
const imageHandler = require('../../utils/image-handler.js')
const aiAssistant = require('../../utils/aiAssistant.js')

Page({
  data: {
    // 上传的服装图片
    clothingImages: [],
    maxClothingImages: 3,
    // 用户积分（可为空表示未知）
    userCredits: null,

    // 页面加载骨架
    loading: true,

    // 使用指南弹窗
    showGuide: false,
    
    // 模特参数
    parameters: {
      gender: 'female',
      height: 170,
      age: 25,
      nationality: 'asian', // 新增：国籍
      skin_tone: 'medium', // 新增：肤色
      clothing_material: '',
      pose_type: '',
      outfit_description: '',
      accessories_style: '',
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
    
    
    // 性别选项
    genderOptions: [
      { value: 'female', label: '女性' },
      { value: 'male', label: '男性' }
    ],
    selectedGenderIndex: 0,
    
    // 国籍选项
    nationalityOptions: [
      { value: 'asian', label: '亚洲' },
      { value: 'european', label: '欧洲' },
      { value: 'african', label: '非洲' },
      { value: 'american', label: '美洲' },
      { value: 'mixed', label: '混血' }
    ],
    selectedNationalityIndex: 0,
    
    // 肤色选项
    skinToneOptions: [
      { value: 'fair', label: '白皙' },
      { value: 'light', label: '浅色' },
      { value: 'medium', label: '中等' },
      { value: 'olive', label: '橄榄色' },
      { value: 'tan', label: '小麦色' },
      { value: 'dark', label: '深色' }
    ],
    selectedSkinToneIndex: 2,
    
    
    // 生成状态
    isGenerating: false,
    currentTaskId: null,

    // 预设管理
    showPresetModal: false,
    presets: [],
    newPresetName: '',

    // AI助手相关
    showAIHelper: false,
    activeAITab: 'pose', // pose | prompt | scene
    aiLoading: false,
    aiGeneratedPoses: [],
    aiPoseVariations: [],
    userPromptInput: '',
    optimizedPrompt: '',
    aiSceneRecommendations: [],
    selectedAIPose: '',
    poseStyleOptions: ['自然随性', '优雅知性', '活力阳光', '高冷气质', '商务专业'],
    selectedPoseStyle: '自然随性'
  },

  async onLoad(options) {
    console.log('photography.js onLoad: 页面加载')
    try {
      await Promise.all([this.loadScenes(), this.loadCredits()])
      this.applyLastUsedPreset()
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
      const hasSeenGuide = wx.getStorageSync('photography_guide_seen')
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
      wx.setStorageSync('photography_guide_seen', true)
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
    console.log('photography.js loadScenes: 开始加载场景')
    try {
      const res = await apiService.getScenes()
      console.log('photography.js loadScenes: 场景加载结果', res)
      if (res.success) {
        console.log('photography.js loadScenes: 场景数据:', res.data)

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
        console.log('photography.js loadScenes: 场景设置完成', this.data.scenes.length, '个场景')
        // 尝试应用最近一次使用的预设
        // this.applyLastUsedPreset()
      } else {
        console.error('photography.js loadScenes: 场景加载失败', res.message)
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
        // this.applyLastUsedPreset()
      }
    } catch (error) {
      console.error('photography.js loadScenes: 加载场景异常:', error)
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
      // this.applyLastUsedPreset()
    }
  },

  /**
   * 选择服装图片
   */
  async chooseClothingImages() {
    const remainingCount = this.data.maxClothingImages - this.data.clothingImages.length
    if (remainingCount <= 0) {
      wx.showToast({
        title: '最多上传3张服装图片',
        icon: 'none'
      })
      return
    }

    try {
      const res = await uploadService.chooseAndUploadImage({
        count: remainingCount,
        fileType: 'clothing',
        convertToJpeg: true
      })

      if (res.success) {
        // 获取上传文件的临时URL用于显示
        const fileIds = res.data.uploaded.map(item => item.fileId);
        const tempUrlRes = await uploadService.getTempFileURL(fileIds);
        
        const newImages = res.data.uploaded.map(item => ({
          fileId: item.fileId,
          url: tempUrlRes.success ? (tempUrlRes.data[item.fileId] || item.fileId) : item.fileId,
          localPath: ''
        }))

        this.setData({
          clothingImages: [...this.data.clothingImages, ...newImages]
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
   * 删除服装图片
   */
  deleteClothingImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.clothingImages]
    images.splice(index, 1)
    
    this.setData({
      clothingImages: images
    })
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const index = e.currentTarget.dataset.index
    const urls = this.data.clothingImages.map(img => img.url).filter(url => url && url !== '')
    
    if (urls.length === 0) {
      wx.showToast({
        title: '没有可预览的图片',
        icon: 'none'
      })
      return
    }
    
    wx.previewImage({
      urls,
      current: urls[index] || urls[0]
    })
  },

  /**
   * 性别选择
   */
  onGenderChange(e) {
    const index = parseInt(e.detail.value)
    this.setData({
      selectedGenderIndex: index,
      'parameters.gender': this.data.genderOptions[index].value
    })
  },

  /**
   * 国籍选择
   */
  onNationalityChange(e) {
    const index = parseInt(e.detail.value)
    this.setData({
      selectedNationalityIndex: index,
      'parameters.nationality': this.data.nationalityOptions[index].value
    })
  },

  /**
   * 肤色选择
   */
  onSkinToneChange(e) {
    const index = parseInt(e.detail.value)
    this.setData({
      selectedSkinToneIndex: index,
      'parameters.skin_tone': this.data.skinToneOptions[index].value
    })
  },

  // 性别分段按钮
  onGenderSegmentTap(e) {
    const val = e.currentTarget.dataset.val || 'female'
    this.setData({
      'parameters.gender': val,
      selectedGenderIndex: val === 'female' ? 0 : 1
    })
  },

  // 快捷chips：国籍/肤色
  onQuickPickTap(e) {
    const field = e.currentTarget.dataset.field
    const value = e.currentTarget.dataset.value
    if (!field) return
    const updates = { [`parameters.${field}`]: value }
    if (field === 'nationality') {
      const idx = this.data.nationalityOptions.findIndex(o => o && o.value === value)
      if (idx >= 0) updates.selectedNationalityIndex = idx
    }
    if (field === 'skin_tone') {
      const idx = this.data.skinToneOptions.findIndex(o => o && o.value === value)
      if (idx >= 0) updates.selectedSkinToneIndex = idx
    }
    this.setData(updates)
  },

  // 数字步进器：减
  onStepDec(e) {
    const field = e.currentTarget.dataset.field
    const step = parseInt(e.currentTarget.dataset.step) || 1
    if (!field) return
    let v = Number(this.data.parameters[field]) || 0
    v -= step
    if (field === 'age') v = Math.max(0, Math.min(60, v))
    if (field === 'height') v = Math.max(80, Math.min(200, v))
    this.setData({ [`parameters.${field}`]: v })
  },

  // 数字步进器：加
  onStepInc(e) {
    const field = e.currentTarget.dataset.field
    const step = parseInt(e.currentTarget.dataset.step) || 1
    if (!field) return
    let v = Number(this.data.parameters[field]) || 0
    v += step
    if (field === 'age') v = Math.max(0, Math.min(60, v))
    if (field === 'height') v = Math.max(80, Math.min(200, v))
    this.setData({ [`parameters.${field}`]: v })
  },

  // 数字输入失焦校验回弹
  onNumberBlur(e) {
    const field = e.currentTarget.dataset.field
    let v = parseInt(e.detail.value)
    if (isNaN(v)) v = 0
    if (field === 'age') v = Math.max(0, Math.min(60, v || 25))
    else if (field === 'height') v = Math.max(80, Math.min(200, v || 170))
    this.setData({ [`parameters.${field}`]: v })
  },

  /**
   * 身高输入
   */
  onHeightInput(e) {
    const value = parseInt(e.detail.value) || 170
    this.setData({
      'parameters.height': Math.max(80, Math.min(200, value))
    })
  },

  /**
   * 身高滑块变化
   */
  onHeightChange(e) {
    this.setData({
      'parameters.height': e.detail.value
    })
  },

  /**
   * 年龄输入
   */
  onAgeInput(e) {
    const value = parseInt(e.detail.value) || 25
    this.setData({
      'parameters.age': Math.max(18, Math.min(60, value))
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
        title: '开始创作',
        content: '请先登录体验AI摄影功能，免费生成您的专属作品',
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
    if (this.data.clothingImages.length === 0) {
      wx.showToast({
        title: '请上传服装图片',
        icon: 'none'
      })
      return
    }
    // 生成前保存最近一次预设（不含图片）
    this.saveLastUsedPreset()

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
      // 准备参数
      console.log('photography.js startGenerate: 当前选中场景', this.data.selectedScene)
      console.log('photography.js startGenerate: 场景ID', this.data.selectedScene ? (this.data.selectedScene.id || this.data.selectedScene._id) : 'null')
      
      const params = {
        images: this.data.clothingImages.map(img => img.fileId),
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

      console.log('photography.js startGenerate: 准备发送的参数', params)

      // 调用生成接口
      const res = await apiService.generatePhotography(params)
      
      if (res.success) {
        this.setData({
          currentTaskId: res.data.task_id
        })

        // 写入多任务队列 pendingTasks（去重）并保留 legacy pendingTask 兼容
        try {
          const now = Date.now()
          const arr = (wx.getStorageSync('pendingTasks') || []).filter(it => it && it.taskId)
          const exists = arr.some(it => it.taskId === res.data.task_id)
          const next = exists ? arr : [...arr, { taskId: res.data.task_id, type: 'photography', createdAt: now }]
          wx.setStorageSync('pendingTasks', next)
          // 兼容旧版逻辑，作品页会自动迁移
          wx.setStorageSync('pendingTask', { taskId: res.data.task_id, type: 'photography', createdAt: now })
        } catch (e) {
          console.warn('写入 pendingTasks 失败', e)
        }

        // 切到作品页（tabBar页面）
        wx.switchTab({
          url: '/pages/works/works'
        })
      } else {
        // 显示具体的失败原因
        wx.showToast({
          title: res.message || '生成失败，请重试',
          icon: 'none',
          duration: 3000
        })
        this.setData({
          isGenerating: false
        })
      }
    } catch (error) {
      console.error('生成失败:', error)
      // 显示网络错误提示
      wx.showToast({
        title: '网络错误，请检查网络后重试',
        icon: 'none',
        duration: 3000
      })
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
      clothingImages: [],
      customSceneText: '',
      parameters: {
        gender: 'female',
        height: 170,
        age: 25,
        nationality: 'asian',
        skin_tone: 'medium',
        clothing_material: '',
        pose_type: '',
        outfit_description: '',
        accessories_style: '',
        mood_and_atmosphere: '',
        lighting_style: ''
      },
      selectedGenderIndex: 0,
      selectedNationalityIndex: 0,
      selectedSkinToneIndex: 2,
      selectedScene: null,
      selectedSceneId: null,
      showAdvanced: false,
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
      wx.setStorageSync('last_used_photography', data)
    } catch (e) {
      console.warn('保存 last_used_photography 失败', e)
    }
  },

  /**
   * 应用最近一次预设（若存在）
   */
  applyLastUsedPreset() {
    try {
      const preset = wx.getStorageSync('last_used_photography')
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
      console.log('已应用最近一次预设 photography')
    } catch (e) {
      console.warn('应用 last_used_photography 失败', e)
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
      const presets = wx.getStorageSync('photography_presets') || []
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
        selectedGenderIndex: this.data.selectedGenderIndex,
        selectedNationalityIndex: this.data.selectedNationalityIndex,
        selectedSkinToneIndex: this.data.selectedSkinToneIndex,
        createdAt: Date.now()
      }

      const presets = wx.getStorageSync('photography_presets') || []
      presets.unshift(preset)
      wx.setStorageSync('photography_presets', presets)

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
        customSceneText: preset.customSceneText || '',
        selectedGenderIndex: preset.selectedGenderIndex || 0,
        selectedNationalityIndex: preset.selectedNationalityIndex || 0,
        selectedSkinToneIndex: preset.selectedSkinToneIndex || 2
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
            wx.setStorageSync('photography_presets', presets)
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
  },

  // ==================== AI助手功能 ====================

  /**
   * 打开AI助手弹窗
   */
  openAIHelper() {
    this.setData({
      showAIHelper: true,
      activeAITab: 'pose'
    })
  },

  /**
   * 关闭AI助手弹窗
   */
  closeAIHelper() {
    this.setData({ showAIHelper: false })
  },

  /**
   * 切换AI助手Tab
   */
  switchAITab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeAITab: tab })
  },

  /**
   * 姿势风格选择
   */
  onPoseStyleChange(e) {
    const index = parseInt(e.detail.value)
    this.setData({
      selectedPoseStyle: this.data.poseStyleOptions[index]
    })
  },

  /**
   * 生成姿势建议
   */
  async generatePoses() {
    // 检查是否选择了场景
    const sceneType = this.data.selectedScene ? this.data.selectedScene.name : (this.data.customSceneText || '通用场景')
    const clothingStyle = this.data.parameters.outfit_description || '休闲装'
    const gender = this.data.parameters.gender || 'female'

    this.setData({ aiLoading: true })

    try {
      const poses = await aiAssistant.generatePosePrompts(sceneType, clothingStyle, gender)

      this.setData({
        aiGeneratedPoses: poses,
        aiLoading: false
      })

      if (poses.length === 0) {
        wx.showToast({
          title: 'AI生成结果为空',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('生成姿势失败:', error)
      this.setData({ aiLoading: false })
      wx.showToast({
        title: error.message || 'AI生成失败',
        icon: 'none'
      })
    }
  },

  /**
   * 选择姿势并应用
   */
  selectAIPose(e) {
    const pose = e.currentTarget.dataset.pose
    this.setData({
      'parameters.pose_type': pose,
      selectedAIPose: pose
    })
    wx.showToast({
      title: '姿势已应用',
      icon: 'success'
    })
  },

  /**
   * 姿势裂变 - 生成变体
   */
  async generatePoseVariations() {
    const basePose = this.data.selectedAIPose || this.data.parameters.pose_type

    if (!basePose) {
      wx.showToast({
        title: '请先选择一个基础姿势',
        icon: 'none'
      })
      return
    }

    this.setData({ aiLoading: true })

    try {
      const variations = await aiAssistant.generatePoseVariations(basePose, 5)

      this.setData({
        aiPoseVariations: variations,
        aiLoading: false
      })
    } catch (error) {
      console.error('生成姿势变体失败:', error)
      this.setData({ aiLoading: false })
      wx.showToast({
        title: error.message || 'AI生成失败',
        icon: 'none'
      })
    }
  },

  /**
   * Prompt输入
   */
  onPromptInput(e) {
    this.setData({
      userPromptInput: e.detail.value
    })
  },

  /**
   * 优化Prompt
   */
  async optimizePrompt() {
    const userInput = this.data.userPromptInput.trim()

    if (!userInput) {
      wx.showToast({
        title: '请输入您的描述',
        icon: 'none'
      })
      return
    }

    const sceneInfo = this.data.selectedScene ? this.data.selectedScene.name : (this.data.customSceneText || '')

    this.setData({ aiLoading: true })

    try {
      const optimized = await aiAssistant.optimizeUserPrompt(userInput, sceneInfo, this.data.parameters)

      this.setData({
        optimizedPrompt: optimized,
        aiLoading: false
      })
    } catch (error) {
      console.error('优化Prompt失败:', error)
      this.setData({ aiLoading: false })
      wx.showToast({
        title: error.message || 'AI优化失败',
        icon: 'none'
      })
    }
  },

  /**
   * 使用优化后的Prompt
   */
  useOptimizedPrompt() {
    if (!this.data.optimizedPrompt) {
      wx.showToast({
        title: '请先优化Prompt',
        icon: 'none'
      })
      return
    }

    // 将优化后的prompt应用到相关字段
    this.setData({
      'parameters.outfit_description': this.data.optimizedPrompt,
      showAIHelper: false
    })

    wx.showToast({
      title: 'Prompt已应用',
      icon: 'success'
    })
  },

  /**
   * 推荐场景
   */
  async recommendScenes() {
    const clothingDesc = this.data.parameters.outfit_description || '服装'
    const clothingType = this.data.parameters.clothing_material || ''

    if (!clothingDesc || clothingDesc === '服装') {
      wx.showToast({
        title: '请先描述服装',
        icon: 'none'
      })
      return
    }

    this.setData({ aiLoading: true })

    try {
      const recommendations = await aiAssistant.recommendScenes(clothingDesc, clothingType)

      this.setData({
        aiSceneRecommendations: recommendations,
        aiLoading: false
      })
    } catch (error) {
      console.error('推荐场景失败:', error)
      this.setData({ aiLoading: false })
      wx.showToast({
        title: error.message || 'AI推荐失败',
        icon: 'none'
      })
    }
  },

  /**
   * 应用AI推荐的场景
   */
  applyAIScene(e) {
    const recommendation = e.currentTarget.dataset.scene

    // 从推荐文本中提取场景名称（格式：场景名称 - 推荐理由）
    const sceneName = recommendation.split('-')[0].trim()

    // 在scenes列表中查找匹配的场景
    const matchedScene = this.data.scenes.find(s =>
      s.name && s.name.includes(sceneName)
    )

    if (matchedScene) {
      this.setData({
        selectedScene: matchedScene,
        selectedSceneId: matchedScene._id || matchedScene.id
      })
      wx.showToast({
        title: '场景已应用',
        icon: 'success'
      })
    } else {
      // 如果没有匹配的场景，使用自定义场景
      this.setData({
        customSceneText: sceneName,
        'parameters.location': sceneName
      })
      wx.showToast({
        title: '已设置为自定义场景',
        icon: 'success'
      })
    }
  }
})