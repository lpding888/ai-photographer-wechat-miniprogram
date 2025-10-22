// 个人作品集页面
Page({
  data: {
    activeTab: 'mine', // mine | discover
    selectedFilter: 'all',
    filters: [
      { key: 'all', label: '全部' },
      { key: 'fitting', label: '试衣照' },
      { key: 'travel', label: '打卡照' },
      { key: 'commercial', label: '商业作品' }
    ],
    works: [],
    leftWorks: [],
    rightWorks: []
  },

  onLoad() {
    this.loadWorks()
  },

  onShow() {
    // 更新自定义TabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      })
    }

    this.loadWorks()
  },

  /**
   * 切换Tab
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  /**
   * 选择筛选
   */
  selectFilter(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ selectedFilter: key })
    this.loadWorks()
  },

  /**
   * 加载作品
   */
  loadWorks() {
    // TODO: 从云数据库加载作品
    // 这里使用模拟数据
    const mockWorks = [
      {
        id: 1,
        cover: 'https://via.placeholder.com/300x400',
        title: '巴黎铁塔打卡',
        type: 'travel',
        typeText: '打卡照',
        createTime: '2025-10-13'
      },
      {
        id: 2,
        cover: 'https://via.placeholder.com/300x500',
        title: '新款连衣裙试穿',
        type: 'fitting',
        typeText: '试衣照',
        createTime: '2025-10-12'
      },
      {
        id: 3,
        cover: 'https://via.placeholder.com/300x600',
        title: '长城合影',
        type: 'travel',
        typeText: '打卡照',
        createTime: '2025-10-11'
      },
      {
        id: 4,
        cover: 'https://via.placeholder.com/300x450',
        title: '商务正装',
        type: 'fitting',
        typeText: '试衣照',
        createTime: '2025-10-10'
      }
    ]

    // 筛选
    const filtered = this.data.selectedFilter === 'all'
      ? mockWorks
      : mockWorks.filter(item => item.type === this.data.selectedFilter)

    // 瀑布流分配
    this.distributeToWaterfall(filtered)
  },

  /**
   * 分配到瀑布流
   */
  distributeToWaterfall(works) {
    const left = []
    const right = []

    works.forEach((item, index) => {
      if (index % 2 === 0) {
        left.push(item)
      } else {
        right.push(item)
      }
    })

    this.setData({
      works,
      leftWorks: left,
      rightWorks: right
    })
  },

  /**
   * 查看作品详情
   */
  viewWork(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/work-detail/work-detail?id=${id}`
    })
  },

  /**
   * 去AI玩
   */
  goToAIPlay() {
    wx.switchTab({
      url: '/pages/ai-play/ai-play'
    })
  }
})
