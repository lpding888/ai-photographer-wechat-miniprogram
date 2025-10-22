/**
 * 数据管理工具 - 统一管理衣柜、规划器数据
 */

class DataManager {
  constructor() {
    // 存储Key常量
    this.KEYS = {
      WARDROBE_ITEMS: 'wardrobe_items',           // 衣柜单品
      WARDROBE_SEARCH_HISTORY: 'wardrobe_search_history', // 衣柜搜索历史
      PLANNER_EVENTS: 'styling_planner_events',   // 规划事件
      PLANNER_MEMORIES: 'styling_planner_memories', // 回忆记录
      SAVED_OUTFITS: 'styling_saved_outfits'      // 保存的套装
    }
  }

  // ========== 衣柜数据管理 ==========

  /**
   * 获取所有衣物
   */
  getWardrobeItems() {
    try {
      return wx.getStorageSync(this.KEYS.WARDROBE_ITEMS) || []
    } catch (error) {
      console.error('获取衣物列表失败:', error)
      return []
    }
  }

  /**
   * 添加衣物
   */
  addWardrobeItem(item) {
    try {
      const items = this.getWardrobeItems()
      items.unshift(item)
      wx.setStorageSync(this.KEYS.WARDROBE_ITEMS, items)
      return { success: true, item }
    } catch (error) {
      console.error('添加衣物失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 更新衣物
   */
  updateWardrobeItem(id, updates) {
    try {
      const items = this.getWardrobeItems()
      const index = items.findIndex(item => item.id === id)

      if (index > -1) {
        items[index] = { ...items[index], ...updates, updateTime: new Date().toISOString() }
        wx.setStorageSync(this.KEYS.WARDROBE_ITEMS, items)
        return { success: true, item: items[index] }
      }

      return { success: false, error: '未找到该衣物' }
    } catch (error) {
      console.error('更新衣物失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 删除衣物
   */
  deleteWardrobeItem(id) {
    try {
      const items = this.getWardrobeItems()
      const newItems = items.filter(item => item.id !== id)
      wx.setStorageSync(this.KEYS.WARDROBE_ITEMS, newItems)
      return { success: true }
    } catch (error) {
      console.error('删除衣物失败:', error)
      return { success: false, error: error.message }
    }
  }

  // ========== 规划器数据管理 ==========

  /**
   * 获取指定日期范围的事件
   */
  getPlannerEvents(startDate, endDate) {
    try {
      const events = wx.getStorageSync(this.KEYS.PLANNER_EVENTS) || []
      if (!startDate && !endDate) return events

      return events.filter(event => {
        const eventDate = new Date(event.date)
        const start = startDate ? new Date(startDate) : new Date('1970-01-01')
        const end = endDate ? new Date(endDate) : new Date('2099-12-31')
        return eventDate >= start && eventDate <= end
      })
    } catch (error) {
      console.error('获取规划事件失败:', error)
      return []
    }
  }

  /**
   * 添加规划事件
   */
  addPlannerEvent(event) {
    try {
      const events = wx.getStorageSync(this.KEYS.PLANNER_EVENTS) || []
      events.push(event)
      wx.setStorageSync(this.KEYS.PLANNER_EVENTS, events)
      return { success: true, event }
    } catch (error) {
      console.error('添加规划事件失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 更新规划事件
   */
  updatePlannerEvent(id, updates) {
    try {
      const events = wx.getStorageSync(this.KEYS.PLANNER_EVENTS) || []
      const index = events.findIndex(event => event.id === id)

      if (index > -1) {
        events[index] = { ...events[index], ...updates, updateTime: new Date().toISOString() }
        wx.setStorageSync(this.KEYS.PLANNER_EVENTS, events)
        return { success: true, event: events[index] }
      }

      return { success: false, error: '未找到该事件' }
    } catch (error) {
      console.error('更新规划事件失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 删除规划事件
   */
  deletePlannerEvent(id) {
    try {
      const events = wx.getStorageSync(this.KEYS.PLANNER_EVENTS) || []
      const newEvents = events.filter(event => event.id !== id)
      wx.setStorageSync(this.KEYS.PLANNER_EVENTS, newEvents)
      return { success: true }
    } catch (error) {
      console.error('删除规划事件失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 根据日期获取事件
   */
  getEventByDate(date) {
    const events = this.getPlannerEvents()
    return events.find(event => event.date === date) || null
  }

  // ========== 回忆数据管理 ==========

  /**
   * 获取回忆记录
   */
  getMemories(startDate, endDate) {
    try {
      const memories = wx.getStorageSync(this.KEYS.PLANNER_MEMORIES) || []
      if (!startDate && !endDate) return memories

      return memories.filter(memory => {
        const memoryDate = new Date(memory.date)
        const start = startDate ? new Date(startDate) : new Date('1970-01-01')
        const end = endDate ? new Date(endDate) : new Date('2099-12-31')
        return memoryDate >= start && memoryDate <= end
      })
    } catch (error) {
      console.error('获取回忆记录失败:', error)
      return []
    }
  }

  /**
   * 添加回忆
   */
  addMemory(memory) {
    try {
      const memories = wx.getStorageSync(this.KEYS.PLANNER_MEMORIES) || []
      memories.push(memory)
      wx.setStorageSync(this.KEYS.PLANNER_MEMORIES, memories)
      return { success: true, memory }
    } catch (error) {
      console.error('添加回忆失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 更新回忆
   */
  updateMemory(id, updates) {
    try {
      const memories = wx.getStorageSync(this.KEYS.PLANNER_MEMORIES) || []
      const index = memories.findIndex(memory => memory.id === id)

      if (index > -1) {
        memories[index] = { ...memories[index], ...updates, updateTime: new Date().toISOString() }
        wx.setStorageSync(this.KEYS.PLANNER_MEMORIES, memories)
        return { success: true, memory: memories[index] }
      }

      return { success: false, error: '未找到该回忆' }
    } catch (error) {
      console.error('更新回忆失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 删除回忆
   */
  deleteMemory(id) {
    try {
      const memories = wx.getStorageSync(this.KEYS.PLANNER_MEMORIES) || []
      const newMemories = memories.filter(memory => memory.id !== id)
      wx.setStorageSync(this.KEYS.PLANNER_MEMORIES, newMemories)
      return { success: true }
    } catch (error) {
      console.error('删除回忆失败:', error)
      return { success: false, error: error.message }
    }
  }

  // ========== 保存的套装管理 ==========

  /**
   * 获取保存的套装
   */
  getSavedOutfits() {
    try {
      return wx.getStorageSync(this.KEYS.SAVED_OUTFITS) || []
    } catch (error) {
      console.error('获取套装失败:', error)
      return []
    }
  }

  /**
   * 保存套装
   */
  saveOutfit(outfit) {
    try {
      const outfits = this.getSavedOutfits()
      outfits.unshift(outfit)
      wx.setStorageSync(this.KEYS.SAVED_OUTFITS, outfits)
      return { success: true, outfit }
    } catch (error) {
      console.error('保存套装失败:', error)
      return { success: false, error: error.message }
    }
  }

  // ========== 统计数据 ==========

  /**
   * 获取衣物使用统计
   */
  getItemUsageStats() {
    try {
      const items = this.getWardrobeItems()
      return items.map(item => ({
        id: item.id,
        name: item.name,
        useCount: item.useCount || 0,
        lastUsed: item.lastUsedTime || null
      })).sort((a, b) => b.useCount - a.useCount)
    } catch (error) {
      console.error('获取使用统计失败:', error)
      return []
    }
  }

  /**
   * 获取最常穿的衣物
   */
  getMostUsedItems(limit = 10) {
    const stats = this.getItemUsageStats()
    return stats.slice(0, limit)
  }

  /**
   * 增加衣物使用次数
   */
  incrementItemUsage(itemId) {
    const items = this.getWardrobeItems()
    const index = items.findIndex(item => item.id === itemId)

    if (index > -1) {
      items[index].useCount = (items[index].useCount || 0) + 1
      items[index].lastUsedTime = new Date().toISOString()
      wx.setStorageSync(this.KEYS.WARDROBE_ITEMS, items)
    }
  }

  // ========== 数据同步（可选，未来扩展） ==========

  /**
   * 同步到云端
   */
  async syncToCloud() {
    // TODO: 实现云端同步逻辑
    console.log('云端同步功能待实现')
  }

  /**
   * 从云端恢复
   */
  async restoreFromCloud() {
    // TODO: 实现云端恢复逻辑
    console.log('云端恢复功能待实现')
  }

  // ========== 搜索历史管理 ==========

  /**
   * 获取搜索历史
   */
  getSearchHistory(limit = 20) {
    try {
      const history = wx.getStorageSync(this.KEYS.WARDROBE_SEARCH_HISTORY) || []
      return history.slice(0, limit)
    } catch (error) {
      console.error('获取搜索历史失败:', error)
      return []
    }
  }

  /**
   * 添加搜索历史
   */
  addSearchHistory(keyword) {
    try {
      if (!keyword || !keyword.trim()) return

      let history = wx.getStorageSync(this.KEYS.WARDROBE_SEARCH_HISTORY) || []

      // 移除重复项
      history = history.filter(item => item !== keyword.trim())

      // 添加到开头
      history.unshift(keyword.trim())

      // 最多保留20条
      history = history.slice(0, 20)

      wx.setStorageSync(this.KEYS.WARDROBE_SEARCH_HISTORY, history)
      return { success: true, history }
    } catch (error) {
      console.error('保存搜索历史失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 清空搜索历史
   */
  clearSearchHistory() {
    try {
      wx.setStorageSync(this.KEYS.WARDROBE_SEARCH_HISTORY, [])
      return { success: true }
    } catch (error) {
      console.error('清空搜索历史失败:', error)
      return { success: false, error: error.message }
    }
  }

  // ========== 数据导出/导入 ==========

  /**
   * 导出所有数据
   */
  exportAllData() {
    return {
      wardrobeItems: this.getWardrobeItems(),
      plannerEvents: this.getPlannerEvents(),
      memories: this.getMemories(),
      savedOutfits: this.getSavedOutfits(),
      searchHistory: this.getSearchHistory(),
      exportTime: new Date().toISOString()
    }
  }

  /**
   * 导入数据
   */
  importData(data) {
    try {
      if (data.wardrobeItems) {
        wx.setStorageSync(this.KEYS.WARDROBE_ITEMS, data.wardrobeItems)
      }
      if (data.plannerEvents) {
        wx.setStorageSync(this.KEYS.PLANNER_EVENTS, data.plannerEvents)
      }
      if (data.memories) {
        wx.setStorageSync(this.KEYS.PLANNER_MEMORIES, data.memories)
      }
      if (data.savedOutfits) {
        wx.setStorageSync(this.KEYS.SAVED_OUTFITS, data.savedOutfits)
      }
      return { success: true }
    } catch (error) {
      console.error('导入数据失败:', error)
      return { success: false, error: error.message }
    }
  }
}

// 导出单例
const dataManager = new DataManager()
module.exports = dataManager
