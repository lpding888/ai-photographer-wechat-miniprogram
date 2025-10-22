// 个人试衣间页面
const apiService = require('../../utils/api.js')
const uploadService = require('../../utils/upload.js')

Page({
  data: {
    // 个人照片
    userPhoto: null,

    // 用户积分
    userCredits: null,

    // 服装图片（最多3张）
    clothingImages: [],
    maxClothingImages: 3,

    // 服装搭配文字描述
    clothingDescription: '',

    // 身体参数（必填）
    bodyParams: {
      gender: 'female',
      age: 25,
      height: 165,
      weight: 52,
      skinTone: 'fair',           // fair(白皙) / wheat(小麦色)
      otherAdjustments: ''         // 其他微调需求
    },
    bodyParamsCollapsed: false,    // 身体参数是否收起

    // 背景选择（必选）
    background: 'white',           // white(纯白) / original(保持原背景)

    // 季节选择器
    showSeasonModal: false,
    seasonOptions: [
      { value: 'spring', label: '春季', icon: '🌸', color: '#98D98E' },
      { value: 'summer', label: '夏季', icon: '☀️', color: '#FFD93D' },
      { value: 'autumn', label: '秋季', icon: '🍂', color: '#F4A460' },
      { value: 'winter', label: '冬季', icon: '❄️', color: '#87CEEB' },
      { value: 'all-season', label: '四季通用', icon: '🌈', color: '#B4B4B4' }
    ],
    selectedSeasons: [],
    tempClothingData: null,

    // 衣柜选择器
    showWardrobeSelector: false,
    wardrobeSelectorIndex: null,
    wardrobeList: [],

    // 从"我的形象"选择的信息
    selectedAvatarId: null,
    selectedAvatarName: null,

    // 页面状态
    loading: true,
    isGenerating: false,
    currentTaskId: null
  },

  async onLoad(options) {
    try {
      await this.loadCredits()

      // 加载默认身体参数
      this.loadDefaultBodyParams()

      // 监听从作品详情页复用搭配数据
      const eventChannel = this.getOpenerEventChannel()
      if (eventChannel) {
        eventChannel.on('loadMatch', (data) => {
          this.loadMatchData(data)
        })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 加载用户积分
   */
  async loadCredits() {
    try {
      const app = getApp()
      const userInfo = app.globalData.userInfo

      if (userInfo && userInfo.credits !== undefined) {
        this.setData({
          userCredits: userInfo.credits
        })
      }
    } catch (error) {
      console.error('加载积分失败:', error)
    }
  },

  /**
   * 加载默认身体参数
   */
  loadDefaultBodyParams() {
    try {
      const savedParams = wx.getStorageSync('fitting_personal_body_params')
      if (savedParams) {
        console.log('加载默认身体参数:', savedParams)
        this.setData({
          bodyParams: {
            ...this.data.bodyParams,
            ...savedParams
          },
          bodyParamsCollapsed: true  // 有保存的参数，默认收起
        })
      }
    } catch (error) {
      console.error('加载默认身体参数失败:', error)
    }
  },

  /**
   * 切换身体参数展开/收起
   */
  toggleBodyParams() {
    this.setData({
      bodyParamsCollapsed: !this.data.bodyParamsCollapsed
    })
  },

  /**
   * 保存身体参数为默认值
   */
  saveDefaultBodyParams() {
    try {
      const params = {
        gender: this.data.bodyParams.gender,
        age: this.data.bodyParams.age,
        height: this.data.bodyParams.height,
        weight: this.data.bodyParams.weight,
        skinTone: this.data.bodyParams.skinTone,
        lastUpdated: new Date().toISOString()
      }
      wx.setStorageSync('fitting_personal_body_params', params)
      console.log('已保存默认身体参数')
    } catch (error) {
      console.error('保存默认身体参数失败:', error)
    }
  },

  /**
   * 加载复用搭配数据
   */
  loadMatchData(data) {
    console.log('加载搭配数据:', data)
    this.setData({
      userPhoto: {
        url: data.avatarInfo.avatarUrl,
        fileId: data.avatarInfo.avatarUrl
      },
      bodyParams: data.avatarInfo.bodyParams,
      clothingImages: data.clothingInfo.images || [],
      clothingDescription: data.clothingInfo.description || '',
      background: data.background || 'white',
      selectedAvatarId: data.avatarInfo.savedAvatarId,
      selectedAvatarName: data.avatarInfo.savedAvatarName
    })

    wx.showToast({ title: '已加载搭配信息', icon: 'success' })
  },

  /**
   * 上传个人照片
   */
  async chooseUserPhoto() {
    try {
      const res = await uploadService.chooseAndUploadImage({
        count: 1,
        fileType: 'personal',
        convertToJpeg: true
      })

      if (res.success && res.data.uploaded.length > 0) {
        const uploadedImage = res.data.uploaded[0]
        this.setData({
          userPhoto: {
            fileId: uploadedImage.fileId,
            url: uploadedImage.fileId
          }
        })

        wx.showToast({ title: '上传成功', icon: 'success' })
      }
    } catch (error) {
      if (error !== 'cancel') {
        console.error('上传个人照片失败:', error)
        wx.showToast({ title: '上传失败', icon: 'error' })
      }
    }
  },

  /**
   * 选择服装图片
   */
  async chooseClothingImage(e) {
    const index = e.currentTarget.dataset.index

    // 显示选择来源菜单
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择', '从我的衣柜选择'],
      success: async (res) => {
        if (res.tapIndex === 0 || res.tapIndex === 1) {
          // 拍照或从相册选择
          this.uploadClothingImage(index, res.tapIndex === 0 ? 'camera' : 'album')
        } else if (res.tapIndex === 2) {
          // 从衣柜选择
          this.selectFromWardrobe(index)
        }
      }
    })
  },

  /**
   * 上传服装图片
   */
  async uploadClothingImage(index, sourceType) {
    try {
      const res = await uploadService.chooseAndUploadImage({
        count: 1,
        fileType: 'clothing',
        convertToJpeg: true,
        sourceType: sourceType === 'camera' ? ['camera'] : ['album']
      })

      if (res.success && res.data.uploaded.length > 0) {
        const uploadedImage = res.data.uploaded[0]

        // 立即弹窗询问分类
        wx.showActionSheet({
          itemList: ['上衣', '下装', '鞋子', '其他'],
          success: (categoryRes) => {
            const categories = ['top', 'bottom', 'shoes', 'other']
            const category = categories[categoryRes.tapIndex]

            // 创建服装数据
            const clothingItem = {
              fileId: uploadedImage.fileId,
              url: uploadedImage.fileId,
              category: category,
              categoryLabel: ['上衣', '下装', '鞋子', '其他'][categoryRes.tapIndex],
              tempFilePath: uploadedImage.tempFilePath
            }

            // 保存到数组
            const clothingImages = [...this.data.clothingImages]
            if (index < clothingImages.length) {
              clothingImages[index] = clothingItem
            } else {
              clothingImages.push(clothingItem)
            }

            this.setData({ clothingImages })

            wx.showToast({ title: '上传成功', icon: 'success' })

            // 询问是否保存到衣柜（含季节选择）
            this.askSaveToWardrobe(clothingItem, index)
          }
        })
      }
    } catch (error) {
      if (error !== 'cancel') {
        console.error('上传服装图片失败:', error)
        wx.showToast({ title: '上传失败', icon: 'error' })
      }
    }
  },

  /**
   * 从衣柜选择服装
   */
  selectFromWardrobe(index) {
    // 获取衣柜列表（只显示服装类型，排除形象）
    const allList = wx.getStorageSync('wardrobe_clothing_list') || []
    const wardrobeList = allList.filter(item => item.type === 'clothing' || !item.type)

    if (wardrobeList.length === 0) {
      wx.showModal({
        title: '衣柜为空',
        content: '你的衣柜还没有服装，是否现在去添加？',
        confirmText: '去添加',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/wardrobe/wardrobe'
            })
          }
        }
      })
      return
    }

    // 显示衣柜选择弹窗
    this.setData({
      showWardrobeSelector: true,
      wardrobeSelectorIndex: index,
      wardrobeList: wardrobeList
    })
  },

  /**
   * 从衣柜选择确认
   */
  onWardrobeSelect(e) {
    const item = e.currentTarget.dataset.item
    const index = this.data.wardrobeSelectorIndex

    // 创建服装数据
    const clothingItem = {
      fileId: item.fileId,
      url: item.url,
      category: item.category,
      categoryLabel: item.name,
      wardrobeId: item.id  // 记录来自衣柜
    }

    // 保存到数组
    const clothingImages = [...this.data.clothingImages]
    if (index < clothingImages.length) {
      clothingImages[index] = clothingItem
    } else {
      clothingImages.push(clothingItem)
    }

    this.setData({
      clothingImages,
      showWardrobeSelector: false
    })

    wx.showToast({ title: '已选择', icon: 'success' })
  },

  /**
   * 关闭衣柜选择器
   */
  closeWardrobeSelector() {
    this.setData({
      showWardrobeSelector: false
    })
  },

  /**
   * 删除服装图片
   */
  deleteClothingImage(e) {
    const index = e.currentTarget.dataset.index
    const clothingImages = [...this.data.clothingImages]
    clothingImages.splice(index, 1)
    this.setData({ clothingImages })
  },

  /**
   * 询问是否保存到衣柜
   */
  askSaveToWardrobe(clothingItem, index) {
    wx.showModal({
      title: '保存到衣柜',
      content: '是否将此服装保存到我的衣柜？',
      confirmText: '保存',
      cancelText: '不保存',
      success: (res) => {
        if (res.confirm) {
          // 显示季节选择器
          this.setData({
            showSeasonModal: true,
            tempClothingData: { clothingItem, index },
            selectedSeasons: []
          })
        }
      }
    })
  },

  /**
   * 切换季节选择
   */
  toggleSeason(e) {
    const season = e.currentTarget.dataset.season
    let selectedSeasons = [...this.data.selectedSeasons]

    // 如果选择"四季通用"，清空其他选择
    if (season === 'all-season') {
      selectedSeasons = ['all-season']
    } else {
      // 移除"四季通用"（如果有）
      selectedSeasons = selectedSeasons.filter(s => s !== 'all-season')

      // 切换当前季节
      const index = selectedSeasons.indexOf(season)
      if (index > -1) {
        selectedSeasons.splice(index, 1)
      } else {
        selectedSeasons.push(season)
      }
    }

    this.setData({ selectedSeasons })
  },

  /**
   * 确认季节选择并保存到衣柜
   */
  confirmSeasonSelection() {
    if (this.data.selectedSeasons.length === 0) {
      wx.showToast({ title: '请选择至少一个季节', icon: 'none' })
      return
    }

    const { clothingItem } = this.data.tempClothingData
    const seasons = this.data.selectedSeasons

    // 输入服装名称和备注
    wx.showModal({
      title: '添加服装信息',
      editable: true,
      placeholderText: '服装名称（如：白色衬衫）',
      success: (modalRes) => {
        if (modalRes.confirm) {
          const name = modalRes.content || '未命名服装'

          // 询问是否添加备注
          wx.showModal({
            title: '添加备注（可选）',
            editable: true,
            placeholderText: '如：放在卧室衣柜第二层...',
            success: (noteRes) => {
              const note = noteRes.confirm ? noteRes.content : ''

              // 保存到衣柜
              this.saveToWardrobe({
                id: Date.now(),
                type: 'clothing',
                name: name,
                category: clothingItem.category,
                seasons: seasons,
                url: clothingItem.url,
                fileId: clothingItem.fileId,
                note: note,
                source: 'fitting-personal',
                createTime: new Date().toISOString()
              })

              this.setData({ showSeasonModal: false })
            }
          })
        }
      }
    })
  },

  /**
   * 关闭季节选择器
   */
  closeSeasonModal() {
    this.setData({ showSeasonModal: false })
  },

  /**
   * 保存到衣柜
   */
  saveToWardrobe(clothingData) {
    try {
      const wardrobeList = wx.getStorageSync('wardrobe_clothing_list') || []
      wardrobeList.unshift(clothingData)
      wx.setStorageSync('wardrobe_clothing_list', wardrobeList)

      wx.showToast({ title: '已保存到衣柜', icon: 'success' })
    } catch (error) {
      console.error('保存到衣柜失败:', error)
      wx.showToast({ title: '保存失败', icon: 'error' })
    }
  },

  /**
   * 身体参数输入
   */
  onBodyParamInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`bodyParams.${field}`]: value
    })
  },

  /**
   * 身体参数slider
   */
  onBodyParamChange(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`bodyParams.${field}`]: value
    })
  },

  /**
   * 性别选择
   */
  onGenderChange(e) {
    this.setData({
      'bodyParams.gender': e.detail.value
    })
  },

  /**
   * 肤色选择
   */
  onSkinToneChange(e) {
    const skinTone = e.currentTarget.dataset.value
    this.setData({
      'bodyParams.skinTone': skinTone
    })
  },

  /**
   * 背景选择
   */
  onBackgroundChange(e) {
    const background = e.currentTarget.dataset.value
    this.setData({ background })
  },

  /**
   * 服装描述输入
   */
  onClothingDescInput(e) {
    this.setData({
      clothingDescription: e.detail.value
    })
  },

  /**
   * 表单验证
   */
  validateForm() {
    // 必须有个人照片
    if (!this.data.userPhoto) {
      wx.showToast({ title: '请上传个人照片', icon: 'none' })
      return false
    }

    // 必须填写身体参数
    if (!this.data.bodyParams.age || !this.data.bodyParams.height || !this.data.bodyParams.weight) {
      wx.showToast({ title: '请完善身体参数', icon: 'none' })
      return false
    }

    // 服装图片或描述至少一个
    const hasImages = this.data.clothingImages.length > 0
    const hasDescription = this.data.clothingDescription.trim().length > 0

    if (!hasImages && !hasDescription) {
      wx.showToast({
        title: '请上传服装图片或输入服装描述',
        icon: 'none'
      })
      return false
    }

    // 必须选择背景
    if (!this.data.background) {
      wx.showToast({ title: '请选择背景样式', icon: 'none' })
      return false
    }

    return true
  },

  /**
   * 生成试衣照片
   */
  async generatePhoto() {
    // 验证表单
    if (!this.validateForm()) return

    // 保存身体参数为默认值
    this.saveDefaultBodyParams()

    this.setData({ isGenerating: true })

    try {
      // 构建请求参数
      const params = {
        type: 'fitting-personal',
        userPhoto: this.data.userPhoto,
        bodyParams: this.data.bodyParams,
        clothingImages: this.data.clothingImages,
        clothingDescription: this.data.clothingDescription,
        background: this.data.background
      }

      console.log('个人试衣生成参数:', params)

      // 调用云函数创建任务
      const result = await apiService.callCloudFunction({
        name: 'personal',
        action: 'create',
        data: params
      })

      if (result.success && result.data && result.data.taskId) {
        const taskId = result.data.taskId

        // 跳转到进度页面进行异步处理
        wx.navigateTo({
          url: `/pages/progress/progress?taskId=${taskId}&type=fitting-personal`
        })
      } else {
        throw new Error(result.message || '创建任务失败')
      }
    } catch (error) {
      console.error('生成失败:', error)
      wx.showToast({
        title: error.message || '生成失败',
        icon: 'none'
      })
      this.setData({ isGenerating: false })
    }
  }
})
