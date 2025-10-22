// 全球旅行页面
const apiService = require('../../utils/api.js')
const uploadService = require('../../utils/upload.js')

Page({
  data: {
    // 用户照片
    userPhoto: null,

    // 选中的目的地
    selectedDestination: null,

    // 自定义描述
    customDescription: '',

    // 目的地列表
    destinations: [
      {
        id: 'eiffel-tower',
        name: '埃菲尔铁塔',
        country: '法国·巴黎',
        image: '/images/destinations/eiffel-tower.jpg',
        prompt: 'Eiffel Tower in Paris, France, iconic landmark, romantic atmosphere'
      },
      {
        id: 'great-wall',
        name: '长城',
        country: '中国·北京',
        image: '/images/destinations/great-wall.jpg',
        prompt: 'Great Wall of China, Beijing, ancient architecture, magnificent landscape'
      },
      {
        id: 'taj-mahal',
        name: '泰姬陵',
        country: '印度·阿格拉',
        image: '/images/destinations/taj-mahal.jpg',
        prompt: 'Taj Mahal in Agra, India, white marble monument, beautiful garden'
      },
      {
        id: 'statue-of-liberty',
        name: '自由女神像',
        country: '美国·纽约',
        image: '/images/destinations/statue-of-liberty.jpg',
        prompt: 'Statue of Liberty in New York, USA, harbor view, blue sky'
      },
      {
        id: 'santorini',
        name: '圣托里尼',
        country: '希腊',
        image: '/images/destinations/santorini.jpg',
        prompt: 'Santorini Greece, white buildings, blue domes, Aegean Sea'
      },
      {
        id: 'mount-fuji',
        name: '富士山',
        country: '日本',
        image: '/images/destinations/mount-fuji.jpg',
        prompt: 'Mount Fuji Japan, snow-capped mountain, cherry blossoms, serene landscape'
      },
      {
        id: 'sydney-opera',
        name: '悉尼歌剧院',
        country: '澳大利亚',
        image: '/images/destinations/sydney-opera.jpg',
        prompt: 'Sydney Opera House Australia, harbor, modern architecture, blue sky'
      },
      {
        id: 'machu-picchu',
        name: '马丘比丘',
        country: '秘鲁',
        image: '/images/destinations/machu-picchu.jpg',
        prompt: 'Machu Picchu Peru, ancient Inca ruins, mountain peaks, misty atmosphere'
      }
    ],

    // 用户积分
    userCredits: null,

    // 加载状态
    loading: true,

    // 生成状态
    isGenerating: false,
    currentTaskId: null
  },

  async onLoad(options) {
    console.log('travel.js onLoad: 全球旅行页面加载')

    try {
      await this.loadCredits()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 加载用户积分
   */
  async loadCredits() {
    try {
      const userInfo = getApp().globalData.userInfo
      if (userInfo && userInfo.credits !== undefined) {
        this.setData({ userCredits: userInfo.credits })
      }
    } catch (error) {
      console.error('加载积分失败:', error)
    }
  },

  /**
   * 选择用户照片
   */
  async chooseUserPhoto() {
    try {
      const res = await uploadService.chooseAndUploadImage({
        count: 1,
        fileType: 'user',
        base64Mode: true
      })

      this.setData({ userPhoto: res.files[0] })
    } catch (error) {
      if (error !== 'cancel') {
        wx.showToast({
          title: '上传失败',
          icon: 'error'
        })
      }
    }
  },

  /**
   * 删除用户照片
   */
  deleteUserPhoto() {
    this.setData({ userPhoto: null })
  },

  /**
   * 选择目的地
   */
  selectDestination(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedDestination: id })
  },

  /**
   * 描述输入
   */
  onDescriptionInput(e) {
    this.setData({ customDescription: e.detail.value })
  },

  /**
   * 生成旅行照片
   */
  async generateTravel() {
    if (!this.data.userPhoto) {
      wx.showToast({
        title: '请先上传照片',
        icon: 'none'
      })
      return
    }

    if (!this.data.selectedDestination) {
      wx.showToast({
        title: '请选择目的地',
        icon: 'none'
      })
      return
    }

    // 检查积分
    if (this.data.userCredits !== null && this.data.userCredits < 1) {
      wx.showModal({
        title: '积分不足',
        content: '当前积分不足，请先充值',
        confirmText: '去充值',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/credits/credits' })
          }
        }
      })
      return
    }

    try {
      this.setData({ isGenerating: true })

      // 获取选中的目的地信息
      const destination = this.data.destinations.find(d => d.id === this.data.selectedDestination)

      // 构建场景描述
      let scenePrompt = destination.prompt
      if (this.data.customDescription) {
        scenePrompt += `, ${this.data.customDescription}`
      }

      // 调用personal云函数生成旅行照片
      const result = await apiService.callCloudFunction({
        name: 'personal',
        action: 'create',
        data: {
          type: 'travel',
          userPhoto: {
            fileId: this.data.userPhoto.fileId,
            url: this.data.userPhoto.url
          },
          destination: {
            id: destination.id,
            name: destination.name,
            country: destination.country,
            prompt: scenePrompt
          },
          customDescription: this.data.customDescription
        }
      })

      if (result.success && result.data && result.data.taskId) {
        const taskId = result.data.taskId

        // 跳转到进度页面
        wx.navigateTo({
          url: `/pages/progress/progress?taskId=${taskId}&type=travel`
        })
      } else {
        throw new Error(result.message || '创建任务失败')
      }
    } catch (error) {
      console.error('生成失败:', error)
      wx.showToast({
        title: error.message || '生成失败，请重试',
        icon: 'none'
      })
      this.setData({ isGenerating: false })
    }
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        current: url,
        urls: [url]
      })
    }
  }
})
