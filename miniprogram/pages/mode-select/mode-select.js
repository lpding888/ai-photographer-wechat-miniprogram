// 模式选择页面
Page({
  data: {},

  /**
   * 页面加载时检查是否已选择过模式
   */
  onLoad() {
    // 延迟检查，确保存储API已准备好
    setTimeout(() => {
      const savedMode = wx.getStorageSync('app_mode')

      if (savedMode) {
        console.log('检测到已选择模式:', savedMode)

        // 已选择过模式，直接跳转到对应默认tab
        if (savedMode === 'commercial') {
          // 商业模式 → 摄影tab
          wx.switchTab({
            url: '/pages/index/index'
          })
        } else if (savedMode === 'personal') {
          // 个人模式 → 衣柜tab
          wx.switchTab({
            url: '/pages/wardrobe/wardrobe'
          })
        }
      }
    }, 100)
  },

  /**
   * 选择商业拍摄模式
   */
  selectCommercial() {
    wx.setStorageSync('app_mode', 'commercial')

    // 跳转到摄影tab
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  /**
   * 选择个人生活模式
   */
  selectPersonal() {
    wx.setStorageSync('app_mode', 'personal')

    // 跳转到衣柜tab
    wx.switchTab({
      url: '/pages/wardrobe/wardrobe'
    })
  }
})
