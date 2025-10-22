// 全局公共方法
const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

// 显示成功提示
const showSuccess = (title = '操作成功') => {
  wx.showToast({
    title,
    icon: 'success',
    duration: 2000
  })
}

// 显示错误提示
const showError = (title = '操作失败') => {
  wx.showToast({
    title,
    icon: 'none',
    duration: 2000
  })
}

// 显示加载提示
const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title
  })
}

// 隐藏加载提示
const hideLoading = () => {
  wx.hideLoading()
}

// 检查用户是否登录
const checkLogin = () => {
  const userInfo = wx.getStorageSync('userInfo')
  return !!userInfo.openid
}

// 格式化积分数量
const formatCredits = (credits) => {
  if (credits >= 10000) {
    return (credits / 10000).toFixed(1) + '万'
  }
  return credits.toString()
}

// 防抖函数
const debounce = (func, wait) => {
  let timeout
  return function () {
    const context = this
    const args = arguments
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      func.apply(context, args)
    }, wait)
  }
}

// 节流函数
const throttle = (func, limit) => {
  let inThrottle
  return function () {
    const args = arguments
    const context = this
    if (!inThrottle) {
      func.apply(context, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

module.exports = {
  formatTime,
  showSuccess,
  showError,
  showLoading,
  hideLoading,
  checkLogin,
  formatCredits,
  debounce,
  throttle
}