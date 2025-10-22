// 日期时间工具
class DateUtils {
  
  /**
   * 格式化显示时间
   */
  formatDisplayTime(date) {
    try {
      let targetDate = date
      
      // 安全处理undefined或null
      if (date === undefined || date === null) {
        targetDate = new Date()
      }
      // 处理不同类型的日期输入
      else if (typeof date === 'string' && date.trim() !== '') {
        targetDate = new Date(date)
      } else if (typeof date === 'number') {
        targetDate = new Date(date)
      } else if (!(date instanceof Date) || isNaN(date.getTime())) {
        targetDate = new Date()
      }
      
      // 双重检查日期有效性
      if (isNaN(targetDate.getTime())) {
        targetDate = new Date()
      }
      
      const year = targetDate.getFullYear()
      const month = String(targetDate.getMonth() + 1).padStart(2, '0')
      const day = String(targetDate.getDate()).padStart(2, '0')
      const hours = String(targetDate.getHours()).padStart(2, '0')
      const minutes = String(targetDate.getMinutes()).padStart(2, '0')
      
      return `${year}-${month}-${day} ${hours}:${minutes}`
      
    } catch (error) {
      console.error('formatDisplayTime error:', error)
      return new Date().toISOString().replace('T', ' ').substring(0, 16)
    }
  }
  
  /**
   * 格式化相对时间
   */
  formatRelativeTime(date) {
    try {
      const now = new Date()
      const targetDate = new Date(date)
      const diffMs = now.getTime() - targetDate.getTime()
      
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      
      if (diffMinutes < 1) {
        return '刚刚'
      } else if (diffMinutes < 60) {
        return `${diffMinutes}分钟前`
      } else if (diffHours < 24) {
        return `${diffHours}小时前`
      } else if (diffDays < 7) {
        return `${diffDays}天前`
      } else {
        return this.formatDisplayTime(date)
      }
      
    } catch (error) {
      return ''
    }
  }
  
  /**
   * 格式化日期为YYYY-MM-DD
   */
  formatDate(date) {
    try {
      const targetDate = new Date(date)
      const year = targetDate.getFullYear()
      const month = String(targetDate.getMonth() + 1).padStart(2, '0')
      const day = String(targetDate.getDate()).padStart(2, '0')
      
      return `${year}-${month}-${day}`
      
    } catch (error) {
      return ''
    }
  }
  
  /**
   * 格式化时间为HH:MM:SS
   */
  formatTime(date) {
    try {
      const targetDate = new Date(date)
      const hours = String(targetDate.getHours()).padStart(2, '0')
      const minutes = String(targetDate.getMinutes()).padStart(2, '0')
      const seconds = String(targetDate.getSeconds()).padStart(2, '0')
      
      return `${hours}:${minutes}:${seconds}`
      
    } catch (error) {
      return ''
    }
  }
  
  /**
   * 获取今天的开始时间
   */
  getTodayStart() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }
  
  /**
   * 获取今天的结束时间
   */
  getTodayEnd() {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    return today
  }
  
  /**
   * 获取本月的开始时间
   */
  getMonthStart() {
    const date = new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  }
  
  /**
   * 获取本月的结束时间
   */
  getMonthEnd() {
    const date = new Date()
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  }
  
  /**
   * 检查是否是今天
   */
  isToday(date) {
    try {
      const today = new Date()
      const targetDate = new Date(date)
      
      return today.getFullYear() === targetDate.getFullYear() &&
             today.getMonth() === targetDate.getMonth() &&
             today.getDate() === targetDate.getDate()
             
    } catch (error) {
      return false
    }
  }
  
  /**
   * 检查是否是本周
   */
  isThisWeek(date) {
    try {
      const today = new Date()
      const targetDate = new Date(date)
      
      const startOfWeek = new Date(today)
      startOfWeek.setDate(today.getDate() - today.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(startOfWeek.getDate() + 6)
      endOfWeek.setHours(23, 59, 59, 999)
      
      return targetDate >= startOfWeek && targetDate <= endOfWeek
      
    } catch (error) {
      return false
    }
  }
  
  /**
   * 添加天数
   */
  addDays(date, days) {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }
  
  /**
   * 添加小时
   */
  addHours(date, hours) {
    const result = new Date(date)
    result.setHours(result.getHours() + hours)
    return result
  }
  
  /**
   * 添加分钟
   */
  addMinutes(date, minutes) {
    const result = new Date(date)
    result.setMinutes(result.getMinutes() + minutes)
    return result
  }
}

module.exports = new DateUtils()