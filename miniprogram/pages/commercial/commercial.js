// 服装商业拍摄导航页
Page({
  data: {},

  onLoad(options) {
    console.log('commercial.js onLoad: 服装商业拍摄导航页加载')
  },

  /**
   * 前往服装拍摄页面
   */
  goToPhotography() {
    wx.navigateTo({
      url: '/pages/photography/photography'
    })
  },

  /**
   * 前往模特换装页面（试衣间）
   */
  goToFitting() {
    wx.navigateTo({
      url: '/pages/fitting/fitting'
    })
  }
})
