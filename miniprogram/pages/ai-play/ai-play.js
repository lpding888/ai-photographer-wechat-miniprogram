// AI玩页面 - 虚拟试衣 + 全球打卡
const app = getApp()
const dataManager = require('../../utils/data-manager.js')

Page({
  data: {
    activeTab: 'fitting', // fitting | travel | planner
    userPhoto: '',

    // 虚拟试衣
    selectedClothes: [],
    wardrobeItems: [],
    showClothesModal: false,

    // 去旅行
    selectedDestination: null,
    selectedCategory: '全部',
    destinations: [],
    filteredDestinations: [],
    showDestModal: false,
    categories: ['全部', '欧洲', '亚洲', '美洲', '大洋洲', '非洲'],

    generating: false
  },

  onLoad() {
    this.loadDestinations()
  },

  onShow() {
    // 更新自定义TabBar选中状态（个人模式第2个tab）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      })
    }

    this.loadWardrobeItems()
  },

  /**
   * 切换Tab
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  /**
   * 上传用户照片
   */
  uploadUserPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        this.setData({
          userPhoto: res.tempFiles[0].tempFilePath
        })
      }
    })
  },

  /**
   * 加载衣柜数据
   */
  loadWardrobeItems() {
    const items = dataManager.getWardrobeItems()
    this.setData({ wardrobeItems: items })
  },

  /**
   * 选择衣物
   */
  selectClothes() {
    const selectedIds = this.data.selectedClothes.map(item => item.id)
    const items = this.data.wardrobeItems.map(item => ({
      ...item,
      selected: selectedIds.includes(item.id)
    }))

    this.setData({
      wardrobeItems: items,
      showClothesModal: true
    })
  },

  /**
   * 切换衣物选中状态
   */
  toggleClothes(e) {
    const id = e.currentTarget.dataset.id
    const items = this.data.wardrobeItems.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected }
      }
      return item
    })

    this.setData({ wardrobeItems: items })
  },

  /**
   * 确认选择衣物
   */
  confirmClothes() {
    const selected = this.data.wardrobeItems.filter(item => item.selected)
    this.setData({
      selectedClothes: selected,
      showClothesModal: false
    })
  },

  /**
   * 关闭衣物弹窗
   */
  closeClothesModal() {
    this.setData({ showClothesModal: false })
  },

  /**
   * 加载目的地数据
   */
  loadDestinations() {
    const destinations = [
      // 欧洲
      { id: 1, name: '埃菲尔铁塔', location: '法国·巴黎', category: '欧洲', image: 'https://example.com/eiffel.jpg' },
      { id: 2, name: '比萨斜塔', location: '意大利·比萨', category: '欧洲', image: 'https://example.com/pisa.jpg' },
      { id: 3, name: '大本钟', location: '英国·伦敦', category: '欧洲', image: 'https://example.com/bigben.jpg' },

      // 亚洲
      { id: 4, name: '长城', location: '中国·北京', category: '亚洲', image: 'https://example.com/greatwall.jpg' },
      { id: 5, name: '富士山', location: '日本·山梨', category: '亚洲', image: 'https://example.com/fuji.jpg' },
      { id: 6, name: '泰姬陵', location: '印度·阿格拉', category: '亚洲', image: 'https://example.com/tajmahal.jpg' },

      // 美洲
      { id: 7, name: '自由女神像', location: '美国·纽约', category: '美洲', image: 'https://example.com/liberty.jpg' },
      { id: 8, name: '基督像', location: '巴西·里约', category: '美洲', image: 'https://example.com/christ.jpg' },

      // 大洋洲
      { id: 9, name: '悉尼歌剧院', location: '澳大利亚·悉尼', category: '大洋洲', image: 'https://example.com/opera.jpg' },

      // 非洲
      { id: 10, name: '金字塔', location: '埃及·吉萨', category: '非洲', image: 'https://example.com/pyramid.jpg' }
    ]

    this.setData({
      destinations: destinations.slice(0, 5), // 首页显示5个
      filteredDestinations: destinations
    })
  },

  /**
   * 选择目的地
   */
  selectDestination(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      selectedDestination: parseInt(id),
      showDestModal: false
    })
  },

  /**
   * 显示全部目的地
   */
  showAllDestinations() {
    this.setData({ showDestModal: true })
  },

  /**
   * 选择分类
   */
  selectCategory(e) {
    const category = e.currentTarget.dataset.category
    const filtered = category === '全部'
      ? this.data.filteredDestinations
      : this.data.filteredDestinations.filter(item => item.category === category)

    this.setData({
      selectedCategory: category
    })
  },

  /**
   * 关闭目的地弹窗
   */
  closeDestModal() {
    this.setData({ showDestModal: false })
  },

  /**
   * 生成虚拟试衣照片
   */
  async generateFitting() {
    if (!this.data.userPhoto) {
      wx.showToast({ title: '请先上传照片', icon: 'none' })
      return
    }

    if (this.data.selectedClothes.length === 0) {
      wx.showToast({ title: '请先选择衣物', icon: 'none' })
      return
    }

    this.setData({ generating: true })

    try {
      // TODO: 调用虚拟试衣云函数
      wx.showLoading({ title: 'AI生成中...' })

      // 模拟生成延迟
      await new Promise(resolve => setTimeout(resolve, 3000))

      wx.hideLoading()
      wx.showToast({ title: '生成成功！', icon: 'success' })

      // 跳转到作品集查看
      setTimeout(() => {
        wx.switchTab({ url: '/pages/personal-works/personal-works' })
      }, 1500)

    } catch (error) {
      console.error('生成失败:', error)
      wx.showToast({ title: '生成失败，请重试', icon: 'none' })
    } finally {
      this.setData({ generating: false })
    }
  },

  /**
   * 生成旅行打卡照片
   */
  async generateTravel() {
    if (!this.data.userPhoto) {
      wx.showToast({ title: '请先上传照片', icon: 'none' })
      return
    }

    if (!this.data.selectedDestination) {
      wx.showToast({ title: '请先选择目的地', icon: 'none' })
      return
    }

    this.setData({ generating: true })

    try {
      // TODO: 调用旅行打卡云函数
      wx.showLoading({ title: 'AI生成中...' })

      // 模拟生成延迟
      await new Promise(resolve => setTimeout(resolve, 3000))

      wx.hideLoading()
      wx.showToast({ title: '打卡照生成成功！', icon: 'success' })

      // 跳转到作品集查看
      setTimeout(() => {
        wx.switchTab({ url: '/pages/personal-works/personal-works' })
      }, 1500)

    } catch (error) {
      console.error('生成失败:', error)
      wx.showToast({ title: '生成失败，请重试', icon: 'none' })
    } finally {
      this.setData({ generating: false })
    }
  },

  /**
   * 跳转到造型规划器
   */
  goToPlanner() {
    wx.navigateTo({
      url: '/pages/styling-planner/styling-planner'
    })
  },

  /**
   * 阻止冒泡
   */
  stopPropagation() {}
})
