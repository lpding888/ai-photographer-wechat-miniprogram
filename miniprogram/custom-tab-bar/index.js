// 自定义TabBar - 根据模式显示不同tab
Component({
  data: {
    selected: 0,
    commercialList: [
      {
        icon: '📸',
        text: '摄影',
        pagePath: '/pages/index/index'
      },
      {
        icon: '📱',
        text: '作品',
        pagePath: '/pages/works/works'
      },
      {
        icon: '👤',
        text: '我的',
        pagePath: '/pages/profile/profile'
      }
    ],
    personalList: [
      {
        icon: '👗',
        text: '衣柜',
        pagePath: '/pages/wardrobe/wardrobe'
      },
      {
        icon: '🪞',
        text: 'AI玩',
        pagePath: '/pages/ai-play/ai-play'
      },
      {
        icon: '📱',
        text: '作品',
        pagePath: '/pages/works/works'
      },
      {
        icon: '👤',
        text: '我的',
        pagePath: '/pages/profile/profile'
      }
    ],
    list: []
  },

  attached() {
    this.updateList()
  },

  methods: {
    // 更新tab列表（根据当前模式）
    updateList() {
      const mode = wx.getStorageSync('app_mode') || 'commercial'
      const list = mode === 'commercial' ? this.data.commercialList : this.data.personalList
      console.log('TabBar更新列表，当前模式:', mode, '，tab数量:', list.length)
      this.setData({ list })
    },

    switchTab(e) {
      const path = e.currentTarget.dataset.path
      const index = e.currentTarget.dataset.index

      wx.switchTab({
        url: path,
        success: () => {
          this.setData({ selected: index })
        }
      })
    }
  }
})
