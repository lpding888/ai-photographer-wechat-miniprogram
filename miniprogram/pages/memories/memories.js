// 造型回忆
const app = getApp()
const dataManager = require('../../utils/data-manager.js')

Page({
  data: {
    // 筛选选项
    selectedFilter: 'all',
    filterOptions: [
      { key: 'all', label: '全部' },
      { key: 'thisWeek', label: '本周' },
      { key: 'thisMonth', label: '本月' },
      { key: 'lastMonth', label: '上月' },
      { key: 'thisYear', label: '今年' }
    ],

    // 回忆列表
    memories: [],
    allMemories: [],
    loading: false,

    // 添加弹窗
    showAddModal: false,
    isEditMode: false,
    currentMemoryId: null,

    // 回忆表单
    memoryForm: {
      date: '',
      time: '12:00',
      title: '',
      images: [],
      mood: '',
      items: [],
      location: '',
      note: ''
    },

    // 心情选项
    moodOptions: [
      { key: 'happy', label: '开心', icon: '😊' },
      { key: 'excited', label: '兴奋', icon: '🤩' },
      { key: 'lovely', label: '甜蜜', icon: '🥰' },
      { key: 'confident', label: '自信', icon: '😎' },
      { key: 'relaxed', label: '放松', icon: '😌' },
      { key: 'grateful', label: '感恩', icon: '🙏' },
      { key: 'inspired', label: '灵感', icon: '💡' },
      { key: 'peaceful', label: '平静', icon: '☮️' }
    ],

    // 衣物选择
    showOutfitModal: false,
    selectedCategory: 'all',
    categories: [
      { key: 'all', label: '全部', icon: '👔' },
      { key: 'top', label: '上装', icon: '👕' },
      { key: 'bottom', label: '下装', icon: '👖' },
      { key: 'dress', label: '连衣裙', icon: '👗' },
      { key: 'shoes', label: '鞋子', icon: '👟' },
      { key: 'accessory', label: '配饰', icon: '🎒' }
    ],
    wardrobeItems: [],
    selectedItemsCount: 0
  },

  onLoad(options) {
    console.log('memories.js onLoad', options)
    this.loadMemories()

    // 检查是否从AI摄影页面带参数（URL参数方式）
    if (options.imageUrl && options.fromPhoto) {
      try {
        const imageUrl = decodeURIComponent(options.imageUrl)
        const title = options.title ? decodeURIComponent(options.title) : ''
        this.openAddModalWithImage(imageUrl, title)

        // 给用户反馈
        setTimeout(() => {
          wx.showToast({
            title: '图片已添加',
            icon: 'success',
            duration: 1500
          })
        }, 500)
      } catch (error) {
        console.error('解析URL参数失败:', error)
        wx.showToast({
          title: '图片加载失败',
          icon: 'none'
        })
      }
    }

    // 检查是否从作品详情页面带参数（全局数据方式）
    if (options.from === 'work') {
      const app = getApp()
      const globalData = app.globalData || {}

      if (globalData.tempMemoryImage) {
        const imageUrl = globalData.tempMemoryImage
        this.openAddModalWithImage(imageUrl, '')

        // 清除全局临时数据
        delete globalData.tempMemoryImage
        delete globalData.tempMemoryFrom

        // 给用户反馈
        setTimeout(() => {
          wx.showToast({
            title: '图片已添加',
            icon: 'success',
            duration: 1500
          })
        }, 500)
      }
    }
  },

  onShow() {
    this.loadMemories()
  },

  /**
   * 加载回忆列表
   */
  loadMemories() {
    this.setData({ loading: true })

    try {
      const memories = dataManager.getMemories()

      // 格式化显示数据
      const formattedMemories = memories.map(memory => {
        const date = new Date(memory.date)
        const moodOption = this.data.moodOptions.find(m => m.key === memory.mood)

        return {
          ...memory,
          displayDay: String(date.getDate()).padStart(2, '0'),
          displayMonth: `${date.getMonth() + 1}月`,
          displayTime: memory.time || this.formatTime(date),
          moodIcon: moodOption ? moodOption.icon : '',
          moodText: moodOption ? moodOption.label : ''
        }
      }).sort((a, b) => {
        // 按日期倒序
        return new Date(b.date) - new Date(a.date)
      })

      this.setData({
        allMemories: formattedMemories,
        memories: formattedMemories,
        loading: false
      })

      this.applyFilter()
    } catch (error) {
      console.error('加载回忆失败:', error)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  },

  /**
   * 筛选改变
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ selectedFilter: filter })
    this.applyFilter()
  },

  /**
   * 应用筛选
   */
  applyFilter() {
    const filter = this.data.selectedFilter
    const now = new Date()
    let filtered = [...this.data.allMemories]

    if (filter === 'all') {
      // 不筛选
    } else if (filter === 'thisWeek') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      filtered = filtered.filter(m => new Date(m.date) >= weekAgo)
    } else if (filter === 'thisMonth') {
      const thisMonth = now.getMonth()
      const thisYear = now.getFullYear()
      filtered = filtered.filter(m => {
        const date = new Date(m.date)
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear
      })
    } else if (filter === 'lastMonth') {
      const lastMonth = now.getMonth() - 1
      const year = lastMonth < 0 ? now.getFullYear() - 1 : now.getFullYear()
      const month = lastMonth < 0 ? 11 : lastMonth
      filtered = filtered.filter(m => {
        const date = new Date(m.date)
        return date.getMonth() === month && date.getFullYear() === year
      })
    } else if (filter === 'thisYear') {
      const thisYear = now.getFullYear()
      filtered = filtered.filter(m => new Date(m.date).getFullYear() === thisYear)
    }

    this.setData({ memories: filtered })
  },

  /**
   * 点击回忆
   */
  onMemoryClick(e) {
    const id = e.currentTarget.dataset.id
    const memory = this.data.allMemories.find(m => m.id === id)
    if (memory) {
      this.showMemoryDetail(memory)
    }
  },

  /**
   * 长按回忆
   */
  onMemoryLongPress(e) {
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.editMemory(id)
        } else if (res.tapIndex === 1) {
          this.deleteMemory(id)
        }
      }
    })
  },

  /**
   * 显示回忆详情
   */
  showMemoryDetail(memory) {
    const moodOption = this.data.moodOptions.find(m => m.key === memory.mood)
    const itemsText = memory.items && memory.items.length > 0
      ? memory.items.map(item => item.name).join('、')
      : '未记录'

    let content = `时间：${memory.displayTime}\n`
    if (memory.location) content += `地点：${memory.location}\n`
    if (moodOption) content += `心情：${moodOption.icon} ${moodOption.label}\n`
    content += `穿搭：${itemsText}\n`
    if (memory.note) content += `\n${memory.note}`

    wx.showModal({
      title: memory.title || '回忆',
      content: content,
      showCancel: false
    })
  },

  /**
   * 点击图片
   */
  onImageClick(e) {
    const images = e.currentTarget.dataset.images
    const index = e.currentTarget.dataset.index
    wx.previewImage({
      current: images[index],
      urls: images
    })
  },

  /**
   * 阻止冒泡
   */
  stopPropagation(e) {
    // 阻止事件冒泡
  },

  /**
   * 添加回忆
   */
  onAddMemory() {
    const today = new Date()
    const dateStr = this.formatDate(today)
    const timeStr = this.formatTime(today)

    this.setData({
      showAddModal: true,
      isEditMode: false,
      currentMemoryId: null,
      memoryForm: {
        date: dateStr,
        time: timeStr,
        title: '',
        images: [],
        mood: '',
        items: [],
        location: '',
        note: ''
      }
    })
  },

  /**
   * 从照片打开添加弹窗
   */
  openAddModalWithImage(imageUrl, title = '') {
    const today = new Date()
    const dateStr = this.formatDate(today)
    const timeStr = this.formatTime(today)

    this.setData({
      showAddModal: true,
      isEditMode: false,
      currentMemoryId: null,
      memoryForm: {
        date: dateStr,
        time: timeStr,
        title: title || '',
        images: [imageUrl],
        mood: '',
        items: [],
        location: '',
        note: ''
      }
    })
  },

  /**
   * 编辑回忆
   */
  editMemory(id) {
    const memory = this.data.allMemories.find(m => m.id === id)
    if (!memory) return

    this.setData({
      showAddModal: true,
      isEditMode: true,
      currentMemoryId: id,
      memoryForm: {
        date: memory.date,
        time: memory.time || '12:00',
        title: memory.title || '',
        images: memory.images || [],
        mood: memory.mood || '',
        items: memory.items || [],
        location: memory.location || '',
        note: memory.note || ''
      }
    })
  },

  /**
   * 删除回忆
   */
  deleteMemory(id) {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条回忆吗？',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          const result = dataManager.deleteMemory(id)
          if (result.success) {
            wx.showToast({ title: '删除成功', icon: 'success' })
            this.loadMemories()
          } else {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  /**
   * 关闭添加弹窗
   */
  onCloseAddModal() {
    this.setData({ showAddModal: false })
  },

  /**
   * 格式化日期
   */
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 日期改变
   */
  onDateChange(e) {
    this.setData({ 'memoryForm.date': e.detail.value })
  },

  /**
   * 时间改变
   */
  onTimeChange(e) {
    this.setData({ 'memoryForm.time': e.detail.value })
  },

  /**
   * 标题输入
   */
  onTitleInput(e) {
    this.setData({ 'memoryForm.title': e.detail.value })
  },

  /**
   * 选择图片
   */
  onChooseImage() {
    const maxCount = 9 - this.data.memoryForm.images.length

    if (maxCount <= 0) {
      wx.showToast({ title: '最多添加9张照片', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: maxCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        if (!res.tempFiles || res.tempFiles.length === 0) {
          return
        }

        wx.showLoading({ title: `上传中 0/${res.tempFiles.length}` })

        try {
          const uploadPromises = res.tempFiles.map((file, index) => {
            const timestamp = Date.now() + index
            const random = Math.random().toString(36).substr(2, 9)
            const cloudPath = `memories/${timestamp}_${random}.jpg`
            return wx.cloud.uploadFile({
              cloudPath,
              filePath: file.tempFilePath
            })
          })

          // 逐个上传并更新进度
          const fileIDs = []
          for (let i = 0; i < uploadPromises.length; i++) {
            const result = await uploadPromises[i]
            fileIDs.push(result.fileID)
            wx.showLoading({ title: `上传中 ${i + 1}/${uploadPromises.length}` })
          }

          this.setData({
            'memoryForm.images': [...this.data.memoryForm.images, ...fileIDs]
          })

          wx.hideLoading()
          wx.showToast({ title: '上传成功', icon: 'success' })
        } catch (error) {
          wx.hideLoading()
          console.error('上传图片失败:', error)
          wx.showToast({ title: '部分图片上传失败，请重试', icon: 'none' })
        }
      },
      fail: (err) => {
        console.log('选择图片失败:', err)
        if (err.errMsg !== 'chooseMedia:fail cancel') {
          wx.showToast({ title: '选择图片失败，请重试', icon: 'none' })
        }
      }
    })
  },

  /**
   * 删除图片
   */
  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.memoryForm.images]
    images.splice(index, 1)
    this.setData({ 'memoryForm.images': images })
  },

  /**
   * 选择心情
   */
  onSelectMood(e) {
    const mood = e.currentTarget.dataset.mood
    this.setData({ 'memoryForm.mood': mood })
  },

  /**
   * 地点输入
   */
  onLocationInput(e) {
    this.setData({ 'memoryForm.location': e.detail.value })
  },

  /**
   * 备注输入
   */
  onNoteInput(e) {
    this.setData({ 'memoryForm.note': e.detail.value })
  },

  /**
   * 选择穿搭
   */
  onSelectOutfit() {
    this.loadWardrobeItems()

    const selectedIds = this.data.memoryForm.items.map(item => item.id)
    const wardrobeItems = this.data.wardrobeItems.map(item => ({
      ...item,
      selected: selectedIds.includes(item.id)
    }))

    this.setData({
      showOutfitModal: true,
      wardrobeItems,
      selectedItemsCount: selectedIds.length
    })
  },

  /**
   * 加载衣柜数据
   */
  loadWardrobeItems() {
    let items = dataManager.getWardrobeItems()

    if (this.data.selectedCategory !== 'all') {
      items = items.filter(item => item.category === this.data.selectedCategory)
    }

    this.setData({ wardrobeItems: items })
  },

  /**
   * 分类改变
   */
  onCategoryChange(e) {
    const category = e.currentTarget.dataset.category
    this.setData({ selectedCategory: category })
    this.loadWardrobeItems()
  },

  /**
   * 切换衣物选中状态
   */
  onToggleItem(e) {
    const id = e.currentTarget.dataset.id
    const items = this.data.wardrobeItems.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected }
      }
      return item
    })

    const selectedCount = items.filter(item => item.selected).length
    this.setData({
      wardrobeItems: items,
      selectedItemsCount: selectedCount
    })
  },

  /**
   * 确认选择穿搭
   */
  onConfirmOutfit() {
    const selectedItems = this.data.wardrobeItems
      .filter(item => item.selected)
      .map(item => ({
        id: item.id,
        name: item.name,
        category: item.category,
        url: item.url,
        processedImage: item.processedImage
      }))

    this.setData({
      'memoryForm.items': selectedItems,
      showOutfitModal: false
    })
  },

  /**
   * 关闭衣物选择弹窗
   */
  onCloseOutfitModal() {
    this.setData({
      showOutfitModal: false,
      selectedCategory: 'all'
    })
  },

  /**
   * 保存回忆
   */
  onSaveMemory() {
    const form = this.data.memoryForm

    // 验证
    if (form.images.length === 0 && !form.title && !form.note) {
      wx.showToast({ title: '请添加照片或填写标题/备注', icon: 'none' })
      return
    }

    try {
      if (this.data.isEditMode) {
        // 更新回忆
        const result = dataManager.updateMemory(this.data.currentMemoryId, {
          date: form.date,
          time: form.time,
          title: form.title.trim(),
          images: form.images,
          mood: form.mood,
          items: form.items,
          location: form.location.trim(),
          note: form.note.trim()
        })

        if (result.success) {
          wx.showToast({ title: '更新成功', icon: 'success' })
          this.setData({ showAddModal: false })
          this.loadMemories()
        } else {
          throw new Error(result.error)
        }
      } else {
        // 新建回忆
        const memory = {
          id: Date.now() + Math.floor(Math.random() * 10000),
          date: form.date,
          time: form.time,
          title: form.title.trim(),
          images: form.images,
          mood: form.mood,
          items: form.items,
          location: form.location.trim(),
          note: form.note.trim(),
          createTime: new Date().toISOString()
        }

        const result = dataManager.addMemory(memory)

        if (result.success) {
          wx.showToast({ title: '添加成功', icon: 'success' })
          this.setData({ showAddModal: false })
          this.loadMemories()
        } else {
          throw new Error(result.error)
        }
      }
    } catch (error) {
      console.error('保存回忆失败:', error)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    try {
      this.loadMemories()
    } catch (error) {
      console.error('刷新失败:', error)
    } finally {
      setTimeout(() => {
        wx.stopPullDownRefresh()
      }, 800)
    }
  }
})
