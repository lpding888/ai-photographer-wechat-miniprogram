// 个人模式主框架页
Page({
  data: {},

  onLoad() {
    // 默认跳转到衣柜页面
    wx.switchTab({
      url: '/pages/wardrobe/wardrobe'
    })
  }
})
