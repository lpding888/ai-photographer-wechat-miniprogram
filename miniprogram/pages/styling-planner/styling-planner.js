// 造型规划器
const app = getApp()
const dataManager = require('../../utils/data-manager.js')
const aiStylist = require('../../utils/ai-stylist.js')

Page({
  data: {
    // 当前年月
    currentYear: 2025,
    currentMonth: 1,

    // 星期
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],

    // 日历数据
    calendarDays: [],

    // 今日事件
    todayEvents: [],

    // 事件弹窗
    showEventModal: false,
    isEditMode: false,
    currentEventId: null,

    // 事件表单
    eventForm: {
      date: '',
      time: '09:00',
      title: '',
      type: '',
      weather: '',
      selectedItems: [],
      note: ''
    },

    // 事件类型
    eventTypes: [
      { key: 'work', label: '工作', icon: '💼', color: '#4A90E2' },
      { key: 'meeting', label: '会议', icon: '👔', color: '#F5A623' },
      { key: 'date', label: '约会', icon: '💕', color: '#E94B3C' },
      { key: 'party', label: '聚会', icon: '🎉', color: '#7ED321' },
      { key: 'travel', label: '旅行', icon: '✈️', color: '#BD10E0' },
      { key: 'sport', label: '运动', icon: '🏃', color: '#50E3C2' },
      { key: 'casual', label: '休闲', icon: '☕', color: '#B8E986' },
      { key: 'other', label: '其他', icon: '📌', color: '#9B9B9B' }
    ],

    // 天气选项
    weatherOptions: [
      { key: 'sunny', icon: '☀️' },
      { key: 'cloudy', icon: '☁️' },
      { key: 'rainy', icon: '🌧️' },
      { key: 'snowy', icon: '❄️' },
      { key: 'hot', icon: '🔥' },
      { key: 'cold', icon: '🧊' }
    ],

    // 衣物选择弹窗
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
    selectedItemsCount: 0,

    // AI建议相关
    showAIModal: false,
    aiLoading: false,
    aiSuggestion: null
  },

  onLoad(options) {
    console.log('styling-planner.js onLoad')
    const today = new Date()
    this.setData({
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth() + 1
    })
    this.loadCalendar()
    this.loadTodayEvents()
  },

  onShow() {
    // 更新自定义TabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      })
    }

    this.loadCalendar()
    this.loadTodayEvents()
  },

  /**
   * 加载日历数据
   */
  loadCalendar() {
    const year = this.data.currentYear
    const month = this.data.currentMonth

    // 获取当月第一天和最后一天
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)

    // 获取第一天是星期几（0=周日）
    const firstDayWeek = firstDay.getDay()

    // 获取当月天数
    const daysInMonth = lastDay.getDate()

    // 计算需要显示的上月天数
    const prevMonthDays = firstDayWeek
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate()

    // 计算需要显示的下月天数
    const totalCells = Math.ceil((prevMonthDays + daysInMonth) / 7) * 7
    const nextMonthDays = totalCells - prevMonthDays - daysInMonth

    const calendarDays = []
    const events = dataManager.getPlannerEvents()
    const today = new Date()
    const todayStr = this.formatDate(today)

    // 上月日期
    for (let i = prevMonthDays - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i
      const date = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      calendarDays.push({
        id: `prev-${day}`,
        day,
        date,
        isOtherMonth: true,
        isToday: false,
        hasEvent: false,
        events: [],
        outfitImage: null,
        weather: null
      })
    }

    // 当月日期
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayEvents = events.filter(e => e.date === date)
      const isToday = date === todayStr

      // 获取第一个事件的造型图片
      let outfitImage = null
      if (dayEvents.length > 0 && dayEvents[0].selectedItems && dayEvents[0].selectedItems.length > 0) {
        outfitImage = dayEvents[0].selectedItems[0].processedImage || dayEvents[0].selectedItems[0].url
      }

      // 获取天气（未来7天）
      let weather = null
      const dateDiff = Math.ceil((new Date(date) - today) / (1000 * 60 * 60 * 24))
      if (dateDiff >= 0 && dateDiff <= 7 && dayEvents.length > 0) {
        weather = this.getWeatherIcon(dayEvents[0].weather)
      }

      calendarDays.push({
        id: `current-${day}`,
        day,
        date,
        isOtherMonth: false,
        isToday,
        hasEvent: dayEvents.length > 0,
        events: dayEvents.map(e => ({
          id: e.id,
          color: this.getEventTypeColor(e.type)
        })),
        outfitImage,
        weather
      })
    }

    // 下月日期
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    for (let day = 1; day <= nextMonthDays; day++) {
      const date = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      calendarDays.push({
        id: `next-${day}`,
        day,
        date,
        isOtherMonth: true,
        isToday: false,
        hasEvent: false,
        events: [],
        outfitImage: null,
        weather: null
      })
    }

    this.setData({ calendarDays })
  },

  /**
   * 加载今日事件
   */
  loadTodayEvents() {
    const today = this.formatDate(new Date())
    const events = dataManager.getPlannerEvents()
    const todayEvents = events
      .filter(e => e.date === today)
      .map(e => ({
        ...e,
        typeName: this.getEventTypeName(e.type),
        color: this.getEventTypeColor(e.type),
        outfitImage: e.selectedItems && e.selectedItems.length > 0
          ? e.selectedItems[0].processedImage || e.selectedItems[0].url
          : null
      }))
      .sort((a, b) => a.time.localeCompare(b.time))

    this.setData({ todayEvents })
  },

  /**
   * 获取事件类型名称
   */
  getEventTypeName(type) {
    const eventType = this.data.eventTypes.find(t => t.key === type)
    return eventType ? eventType.label : '其他'
  },

  /**
   * 获取事件类型颜色
   */
  getEventTypeColor(type) {
    const eventType = this.data.eventTypes.find(t => t.key === type)
    return eventType ? eventType.color : '#9B9B9B'
  },

  /**
   * 获取天气图标
   */
  getWeatherIcon(weather) {
    const option = this.data.weatherOptions.find(w => w.key === weather)
    return option ? option.icon : null
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
   * 上一月
   */
  onPrevMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth--
    if (currentMonth < 1) {
      currentMonth = 12
      currentYear--
    }
    this.setData({ currentYear, currentMonth })
    this.loadCalendar()
  },

  /**
   * 下一月
   */
  onNextMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth++
    if (currentMonth > 12) {
      currentMonth = 1
      currentYear++
    }
    this.setData({ currentYear, currentMonth })
    this.loadCalendar()
  },

  /**
   * 点击日期
   */
  onDateClick(e) {
    const date = e.currentTarget.dataset.date
    // 检查是否已有事件
    const events = dataManager.getPlannerEvents()
    const hasEvent = events.some(event => event.date === date)

    if (hasEvent) {
      // 显示当天的事件列表（可以改进为底部弹窗）
      wx.showToast({ title: '已有安排', icon: 'none' })
    } else {
      // 创建新事件
      this.openEventModal(date)
    }
  },

  /**
   * 添加事件
   */
  onAddEvent() {
    const today = this.formatDate(new Date())
    this.openEventModal(today)
  },

  /**
   * 打开事件弹窗
   */
  openEventModal(date, event = null) {
    if (event) {
      // 编辑模式
      this.setData({
        showEventModal: true,
        isEditMode: true,
        currentEventId: event.id,
        eventForm: {
          date: event.date,
          time: event.time,
          title: event.title,
          type: event.type,
          weather: event.weather || '',
          selectedItems: event.selectedItems || [],
          note: event.note || ''
        }
      })
    } else {
      // 新建模式
      this.setData({
        showEventModal: true,
        isEditMode: false,
        currentEventId: null,
        eventForm: {
          date: date,
          time: '09:00',
          title: '',
          type: '',
          weather: '',
          selectedItems: [],
          note: ''
        }
      })
    }
  },

  /**
   * 关闭事件弹窗
   */
  onCloseEventModal() {
    this.setData({ showEventModal: false })
  },

  /**
   * 阻止冒泡
   */
  stopPropagation(e) {
    // 阻止事件冒泡
  },

  /**
   * 日期改变
   */
  onDateChange(e) {
    this.setData({
      'eventForm.date': e.detail.value
    })
  },

  /**
   * 时间改变
   */
  onTimeChange(e) {
    this.setData({
      'eventForm.time': e.detail.value
    })
  },

  /**
   * 标题输入
   */
  onTitleInput(e) {
    this.setData({
      'eventForm.title': e.detail.value
    })
  },

  /**
   * 选择类型
   */
  onSelectType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      'eventForm.type': type
    })
  },

  /**
   * 选择天气
   */
  onSelectWeather(e) {
    const weather = e.currentTarget.dataset.weather
    this.setData({
      'eventForm.weather': weather
    })
  },

  /**
   * 备注输入
   */
  onNoteInput(e) {
    this.setData({
      'eventForm.note': e.detail.value
    })
  },

  /**
   * 选择造型
   */
  onSelectOutfit() {
    // 加载衣柜数据
    this.loadWardrobeItems()

    // 标记已选中的衣物
    const selectedIds = this.data.eventForm.selectedItems.map(item => item.id)
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

    // 分类筛选
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
   * 确认选择造型
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
      'eventForm.selectedItems': selectedItems,
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
   * 保存事件
   */
  onSaveEvent() {
    const form = this.data.eventForm

    // 验证
    if (!form.title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' })
      return
    }

    if (!form.type) {
      wx.showToast({ title: '请选择类型', icon: 'none' })
      return
    }

    try {
      if (this.data.isEditMode) {
        // 更新事件
        const result = dataManager.updatePlannerEvent(this.data.currentEventId, {
          date: form.date,
          time: form.time,
          title: form.title.trim(),
          type: form.type,
          weather: form.weather,
          selectedItems: form.selectedItems,
          note: form.note.trim()
        })

        if (result.success) {
          wx.showToast({ title: '更新成功', icon: 'success' })
          this.setData({ showEventModal: false })
          this.loadCalendar()
          this.loadTodayEvents()
        } else {
          throw new Error(result.error)
        }
      } else {
        // 新建事件
        const event = {
          id: Date.now() + Math.floor(Math.random() * 10000),
          date: form.date,
          time: form.time,
          title: form.title.trim(),
          type: form.type,
          weather: form.weather,
          selectedItems: form.selectedItems,
          note: form.note.trim(),
          createTime: new Date().toISOString()
        }

        const result = dataManager.addPlannerEvent(event)

        if (result.success) {
          wx.showToast({ title: '创建成功', icon: 'success' })
          this.setData({ showEventModal: false })
          this.loadCalendar()
          this.loadTodayEvents()
        } else {
          throw new Error(result.error)
        }
      }
    } catch (error) {
      console.error('保存事件失败:', error)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  /**
   * 点击事件
   */
  onEventClick(e) {
    const id = e.currentTarget.dataset.id
    const events = dataManager.getPlannerEvents()
    const event = events.find(e => e.id === id)

    if (event) {
      // 显示操作菜单
      wx.showActionSheet({
        itemList: ['查看详情', '编辑', '删除'],
        success: (res) => {
          switch (res.tapIndex) {
            case 0:
              this.showEventDetail(event)
              break
            case 1:
              this.openEventModal(event.date, event)
              break
            case 2:
              this.deleteEvent(event.id)
              break
          }
        }
      })
    }
  },

  /**
   * 显示事件详情
   */
  showEventDetail(event) {
    const typeName = this.getEventTypeName(event.type)
    const weatherIcon = event.weather ? this.getWeatherIcon(event.weather) : ''
    const itemsText = event.selectedItems && event.selectedItems.length > 0
      ? event.selectedItems.map(item => item.name).join('、')
      : '未选择'

    const content = `时间：${event.time}\n类型：${typeName}\n天气：${weatherIcon}\n造型：${itemsText}\n备注：${event.note || '无'}`

    wx.showModal({
      title: event.title,
      content: content,
      showCancel: false
    })
  },

  /**
   * 删除事件
   */
  deleteEvent(id) {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个事件吗？',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          const result = dataManager.deletePlannerEvent(id)
          if (result.success) {
            wx.showToast({ title: '删除成功', icon: 'success' })
            this.loadCalendar()
            this.loadTodayEvents()
          } else {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    try {
      this.loadCalendar()
      this.loadTodayEvents()
    } catch (error) {
      console.error('刷新失败:', error)
    } finally {
      setTimeout(() => {
        wx.stopPullDownRefresh()
      }, 800)
    }
  },

  /**
   * 获取AI建议
   */
  async onGetAISuggestion() {
    const form = this.data.eventForm

    // 防抖：如果正在加载，忽略重复点击
    if (this.data.aiLoading) {
      return
    }

    // 验证必要信息
    if (!form.type) {
      wx.showToast({ title: '请先选择事件类型', icon: 'none' })
      return
    }

    if (!form.weather) {
      wx.showToast({ title: '请先选择天气', icon: 'none' })
      return
    }

    // 获取衣柜数据
    const wardrobeItems = dataManager.getWardrobeItems()

    if (wardrobeItems.length === 0) {
      wx.showToast({ title: '衣柜空空如也，去添加衣物吧', icon: 'none', duration: 2000 })
      return
    }

    // 显示AI模态框并开始加载
    this.setData({
      showAIModal: true,
      aiLoading: true,
      aiSuggestion: null
    })

    try {
      // 调用AI造型师服务
      // 注意：开发环境使用mockStylistSuggestion，生产环境需切换为getStylistSuggestion
      const result = await aiStylist.mockStylistSuggestion(
        form.type,
        form.weather,
        wardrobeItems
      )

      if (result.success) {
        this.setData({
          aiLoading: false,
          aiSuggestion: result.suggestion
        })
      } else {
        throw new Error(result.error || 'AI建议生成失败')
      }
    } catch (error) {
      console.error('获取AI建议失败:', error)

      // 先关闭modal再显示错误提示，确保用户能看到
      this.setData({
        showAIModal: false,
        aiLoading: false
      })

      setTimeout(() => {
        wx.showToast({ title: error.message || 'AI服务异常，请稍后再试', icon: 'none', duration: 2000 })
      }, 300)
    }
  },

  /**
   * 关闭AI模态框
   */
  onCloseAIModal() {
    this.setData({
      showAIModal: false,
      aiLoading: false,
      aiSuggestion: null
    })
  },

  /**
   * 采纳AI建议
   */
  onApplyAISuggestion() {
    const suggestion = this.data.aiSuggestion

    if (!suggestion || !suggestion.recommendedItems || suggestion.recommendedItems.length === 0) {
      wx.showToast({ title: 'AI建议无效或暂无推荐衣物', icon: 'none' })
      return
    }

    // 将AI推荐的衣物添加到事件表单中
    const selectedItems = suggestion.recommendedItems.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      url: item.url,
      processedImage: item.processedImage
    }))

    this.setData({
      'eventForm.selectedItems': selectedItems,
      showAIModal: false,
      aiSuggestion: null
    })

    wx.showToast({ title: '已采纳AI建议', icon: 'success' })
  }
})
