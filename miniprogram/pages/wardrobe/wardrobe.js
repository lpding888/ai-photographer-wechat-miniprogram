// 我的衣柜 - 智能管理版
const app = getApp()
const dataManager = require('../../utils/data-manager.js')

Page({
  data: {
    // 衣物列表
    clothingList: [],
    allClothingList: [], // 完整列表（用于筛选）

    // 筛选条件
    currentCategory: 'all',
    categories: [
      { key: 'all', label: '全部', icon: '👔' },
      { key: 'top', label: '上装', icon: '👕' },
      { key: 'bottom', label: '下装', icon: '👖' },
      { key: 'dress', label: '连衣裙', icon: '👗' },
      { key: 'shoes', label: '鞋子', icon: '👟' },
      { key: 'accessory', label: '配饰', icon: '🎒' }
    ],

    // 搜索
    showSearch: false,
    searchKeyword: '',
    searchResults: [],
    searchHistory: [],

    // 加载状态
    loading: false
  },

  // 搜索防抖定时器
  searchTimer: null,

  onLoad(options) {
    console.log('wardrobe.js onLoad: 衣柜页面加载')
    this.loadData()
    this.loadSearchHistory()
  },

  onShow() {
    // 更新自定义TabBar选中状态（个人模式第1个tab）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      })
    }

    // 每次显示页面时刷新列表（可能从添加页面返回）
    this.loadData()
  },

  /**
   * 加载衣物数据
   */
  async loadData() {
    try {
      this.setData({ loading: true })

      // 使用数据管理器加载
      let clothingList = dataManager.getWardrobeItems()

      // 按创建时间倒序排序
      clothingList.sort((a, b) => {
        return new Date(b.createTime || 0) - new Date(a.createTime || 0)
      })

      this.setData({ allClothingList: clothingList })
      this.applyFilters()
    } catch (error) {
      console.error('加载衣物列表失败:', error)
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 应用筛选
   */
  applyFilters() {
    let list = [...this.data.allClothingList]

    // 分类筛选
    if (this.data.currentCategory !== 'all') {
      list = list.filter(item => item.category === this.data.currentCategory)
    }

    this.setData({ clothingList: list })
  },

  /**
   * 切换分类
   */
  switchCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({ currentCategory: category })
    this.applyFilters()
  },

  /**
   * 显示搜索
   */
  onShowSearch() {
    this.setData({ showSearch: true })
  },

  /**
   * 关闭搜索
   */
  onCloseSearch() {
    this.setData({
      showSearch: false,
      searchKeyword: '',
      searchResults: []
    })
  },

  /**
   * 搜索输入（带防抖）
   */
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 清除之前的定时器
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
    }

    // 300ms防抖
    this.searchTimer = setTimeout(() => {
      this.performSearch(keyword)
    }, 300)
  },

  /**
   * 执行搜索
   */
  performSearch(keyword) {
    if (!keyword.trim()) {
      this.setData({ searchResults: [] })
      return
    }

    const kw = keyword.trim().toLowerCase()
    const results = this.data.allClothingList.filter(item => {
      // 搜索名称、标签
      const nameMatch = item.name && item.name.toLowerCase().includes(kw)
      const tagsMatch = item.tags && item.tags.some(tag => tag.toLowerCase().includes(kw))
      return nameMatch || tagsMatch
    })

    this.setData({ searchResults: results })
  },

  /**
   * 搜索确认
   */
  onSearchConfirm(e) {
    const keyword = e.detail.value
    if (keyword.trim()) {
      this.saveSearchHistory(keyword.trim())
    }
  },

  /**
   * 清空搜索
   */
  onClearSearch() {
    this.setData({
      searchKeyword: '',
      searchResults: []
    })
  },

  /**
   * 点击搜索结果
   */
  onSearchResultClick(e) {
    const item = e.currentTarget.dataset.item
    this.onClothesClick({ currentTarget: { dataset: { item } } })
  },

  /**
   * 加载搜索历史
   */
  loadSearchHistory() {
    try {
      const history = dataManager.getSearchHistory(10) // 最多10条
      this.setData({ searchHistory: history })
    } catch (error) {
      console.error('加载搜索历史失败:', error)
    }
  },

  /**
   * 保存搜索历史
   */
  saveSearchHistory(keyword) {
    try {
      const result = dataManager.addSearchHistory(keyword)
      if (result.success) {
        this.setData({ searchHistory: result.history.slice(0, 10) })
      }
    } catch (error) {
      console.error('保存搜索历史失败:', error)
    }
  },

  /**
   * 清空搜索历史
   */
  onClearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          const result = dataManager.clearSearchHistory()
          if (result.success) {
            this.setData({ searchHistory: [] })
            wx.showToast({ title: '已清空', icon: 'success' })
          } else {
            wx.showToast({ title: '清空失败', icon: 'none' })
          }
        }
      }
    })
  },

  /**
   * 点击历史记录
   */
  onHistoryClick(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ searchKeyword: keyword })
    this.performSearch(keyword)
  },

  /**
   * 阻止冒泡
   */
  stopPropagation() {
    // 阻止事件冒泡
  },

  /**
   * 添加衣物
   */
  onAddClothes() {
    wx.navigateTo({
      url: '/pages/wardrobe/add-clothing/add-clothing'
    })
  },

  /**
   * 点击衣物卡片
   */
  onClothesClick(e) {
    const item = e.currentTarget.dataset.item

    // 查看大图
    wx.previewImage({
      current: item.processedImage || item.url,
      urls: [item.processedImage || item.url]
    })
  },

  /**
   * 长按衣物卡片
   */
  onClothesLongPress(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.clothingList.find(c => c.id === id)

    if (!item) return

    const itemList = [
      item.isFavorite ? '取消常穿' : '设为常穿',
      '编辑信息',
      '删除'
    ]

    wx.showActionSheet({
      itemList,
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.toggleFavorite(item)
            break
          case 1:
            this.editClothing(item)
            break
          case 2:
            this.deleteClothing(item)
            break
        }
      }
    })
  },

  /**
   * 切换常穿标记
   */
  toggleFavorite(item) {
    try {
      const result = dataManager.updateWardrobeItem(item.id, {
        isFavorite: !item.isFavorite
      })

      if (result.success) {
        wx.showToast({
          title: result.item.isFavorite ? '已设为常穿' : '已取消常穿',
          icon: 'success'
        })
        this.loadData()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('切换常穿失败:', error)
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    }
  },

  /**
   * 编辑衣物
   */
  editClothing(item) {
    wx.showModal({
      title: '编辑衣物名称',
      editable: true,
      placeholderText: item.name,
      success: (res) => {
        if (res.confirm && res.content) {
          try {
            const result = dataManager.updateWardrobeItem(item.id, {
              name: res.content.trim()
            })

            if (result.success) {
              wx.showToast({ title: '修改成功', icon: 'success' })
              this.loadData()
            } else {
              throw new Error(result.error)
            }
          } catch (error) {
            console.error('编辑失败:', error)
            wx.showToast({ title: '修改失败，请重试', icon: 'none' })
          }
        }
      }
    })
  },

  /**
   * 删除衣物
   */
  deleteClothing(item) {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${item.name}"吗？`,
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          try {
            const result = dataManager.deleteWardrobeItem(item.id)

            if (result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              this.loadData()
            } else {
              throw new Error(result.error)
            }
          } catch (error) {
            console.error('删除失败:', error)
            wx.showToast({ title: '删除失败，请重试', icon: 'none' })
          }
        }
      }
    })
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadData()
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 1000)
  }
})
