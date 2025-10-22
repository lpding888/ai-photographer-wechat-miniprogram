// 个人中心页面
const app = getApp()
const dataManager = require('../../utils/data-manager.js')

Page({
  data: {
    userInfo: null,
    stats: {
      clothes: 0,
      works: 0,
      memories: 0
    }
  },

  onLoad() {
    this.loadUserInfo()
    this.loadStats()
  },

  onShow() {
    // 更新自定义TabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 4
      })
    }

    this.loadUserInfo()
    this.loadStats()
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    const userInfo = app.globalData.userInfo
    this.setData({ userInfo })
  },

  /**
   * 加载统计数据
   */
  loadStats() {
    const clothes = dataManager.getWardrobeItems().length
    const memories = dataManager.getMemories().length
    // TODO: 从云数据库加载作品数量
    const works = 0

    this.setData({
      stats: { clothes, works, memories }
    })
  },

  /**
   * 去造型回忆
   */
  goToMemories() {
    wx.navigateTo({
      url: '/pages/memories/memories'
    })
  },

  /**
   * 去设置
   */
  goToSettings() {
    wx.showToast({ title: '设置功能开发中', icon: 'none' })
  },

  /**
   * 切换模式
   */
  switchMode() {
    wx.showModal({
      title: '切换模式',
      content: '是否切换到商业拍摄模式？',
      confirmColor: '#FF9A56',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('app_mode', 'commercial')
          wx.reLaunch({
            url: '/pages/index/index'
          })
        }
      }
    })
  },

  /**
   * 关于
   */
  goToAbout() {
    wx.showModal({
      title: '关于',
      content: 'AI摄影助手 v1.0.0\n\n个人生活模式 · 智能穿搭管理',
      showCancel: false
    })
  },

  /**
   * 退出登录
   */
  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          app.setUserInfo(null)
          wx.showToast({ title: '已退出', icon: 'success' })
        }
      }
    })
  }
})
