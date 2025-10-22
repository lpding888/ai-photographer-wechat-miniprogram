// app.js - 修复版本
const imageHandler = require('./utils/image-handler.js')

App({
  onLaunch: function () {
    // 初始化日志控制（生产环境自动关闭日志）
    this.initLogger()

    console.log('app.js: 小程序启动')

    // 初始化云开发环境
    this.initCloudEnvironment()

    // 启动云函数预热（减少冷启动）
    this.startCloudFunctionWarmUp()
    
    // 延迟加载用户信息，避免存储API时机问题
    setTimeout(() => {
      this.loadUserInfoFromStorage()
      
      // 如果启动时用户已登录，则立即在后台刷新一次用户信息
      if (this.globalData.userInfo) {
        console.log('app.js: onLaunch - 检测到用户已登录，开始静默刷新用户信息...')
        this.refreshUserInfo()
      }
    }, 100) // 延迟100ms确保小程序完全初始化
  },

  onShow: function() {
    console.log('app.js: 小程序显示')

    // 应用回到前台时，恢复预热
    if (!this.warmUpTimer && this.globalData.cloudReadyPromise) {
      this.startCloudFunctionWarmUp()
    }
  },

  onHide: function() {
    console.log('app.js: 小程序隐藏')

    // 应用进入后台时，停止预热
    if (this.warmUpTimer) {
      clearInterval(this.warmUpTimer)
      this.warmUpTimer = null
      console.log('☁️ 云函数预热暂停')
    }
  },

  globalData: {
    userInfo: null,
    cloudReadyPromise: null, // 用于确保云环境初始化的Promise
    isRefreshingUserInfo: false, // 全局刷新状态控制
    lastRefreshTime: 0, // 上次刷新时间戳
    imageHandler: imageHandler, // 全局图片处理工具
    isDev: false, // 是否开发环境

    // 🔄 全局轮询状态管理（防止重复轮询）
    pollingTasks: new Set(), // 正在轮询的任务ID集合
    pollingOwners: new Map() // 任务ID -> 页面路径映射
  },

  /**
   * 🔄 注册任务轮询（防止重复）
   * @param {string} taskId - 任务ID
   * @param {string} pagePath - 页面路径（如 pages/progress/progress）
   * @returns {boolean} - 是否成功注册（false表示已被其他页面轮询）
   */
  registerPolling(taskId, pagePath) {
    if (this.globalData.pollingTasks.has(taskId)) {
      const owner = this.globalData.pollingOwners.get(taskId)
      console.log(`⚠️ 任务 ${taskId} 已在 ${owner} 页面轮询，跳过重复注册`)
      return false
    }

    this.globalData.pollingTasks.add(taskId)
    this.globalData.pollingOwners.set(taskId, pagePath)
    console.log(`✅ 任务 ${taskId} 注册轮询：${pagePath}`)
    return true
  },

  /**
   * 🔄 注销任务轮询
   * @param {string} taskId - 任务ID
   * @param {string} pagePath - 页面路径
   */
  unregisterPolling(taskId, pagePath) {
    const owner = this.globalData.pollingOwners.get(taskId)

    // 只有注册者才能注销
    if (owner === pagePath) {
      this.globalData.pollingTasks.delete(taskId)
      this.globalData.pollingOwners.delete(taskId)
      console.log(`✅ 任务 ${taskId} 注销轮询：${pagePath}`)
    } else {
      console.log(`⚠️ 任务 ${taskId} 不属于 ${pagePath}，无法注销（当前拥有者：${owner}）`)
    }
  },

  /**
   * 🔄 检查任务是否正在被轮询
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  isPolling(taskId) {
    return this.globalData.pollingTasks.has(taskId)
  },

  /**
   * 🔄 清理页面的所有轮询任务
   * @param {string} pagePath - 页面路径
   */
  clearPagePolling(pagePath) {
    const tasksToRemove = []

    this.globalData.pollingOwners.forEach((owner, taskId) => {
      if (owner === pagePath) {
        tasksToRemove.push(taskId)
      }
    })

    tasksToRemove.forEach(taskId => {
      this.globalData.pollingTasks.delete(taskId)
      this.globalData.pollingOwners.delete(taskId)
    })

    if (tasksToRemove.length > 0) {
      console.log(`🧹 清理 ${pagePath} 的 ${tasksToRemove.length} 个轮询任务`)
    }
  },

  /**
   * 初始化日志控制器
   * 生产环境自动关闭console.log，保留error
   */
  initLogger() {
    try {
      // 获取当前环境信息
      const accountInfo = wx.getAccountInfoSync()
      const envVersion = accountInfo.miniProgram.envVersion

      // 判断是否开发环境
      this.globalData.isDev = (envVersion === 'develop' || envVersion === 'trial')

      if (!this.globalData.isDev) {
        // 生产环境：重写console方法
        const originalConsole = {
          log: console.log,
          warn: console.warn,
          info: console.info,
          debug: console.debug
        }

        // 关闭非必要日志
        console.log = function() {}
        console.warn = function() {}
        console.info = function() {}
        console.debug = function() {}

        // 保留error用于错误监控
        // console.error 保持不变

        // 存储原始方法供特殊情况使用
        this.globalData.originalConsole = originalConsole
      }
    } catch (e) {
      // 如果获取环境信息失败，默认为生产环境
      console.warn('获取环境信息失败，默认为生产环境', e)
    }
  },

  /**
   * 初始化云开发环境
   */
  initCloudEnvironment() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    
    try {
      wx.cloud.init({
        env: 'cloudbase-0gu1afji26f514d2',
        traceUser: true,
      })
      
      // 创建一个 resolved 的 Promise 表示已就绪
      this.globalData.cloudReadyPromise = Promise.resolve(true)
      console.log('app.js: 云开发环境初始化完成，cloudReadyPromise 已创建')
    } catch (error) {
      console.error('app.js: 云开发环境初始化失败', error)
      this.globalData.cloudReadyPromise = Promise.reject(error)
    }
  },

  /**
   * 从本地存储加载用户信息到全局数据
   * 增加错误处理和重试机制
   */
  loadUserInfoFromStorage() {
    // 延迟执行，确保存储API已准备好
    setTimeout(() => {
      try {
        // 先检查存储是否可用
        if (typeof wx === 'undefined' || !wx.getStorageSync) {
          console.warn('app.js: 存储API不可用，跳过加载')
          return
        }

        // 使用同步方式，但增加错误处理
        const userInfo = wx.getStorageSync('userInfo')
        if (userInfo) {
          this.globalData.userInfo = userInfo
          console.log('app.js: 从本地存储加载用户信息成功', this.globalData.userInfo)
        } else {
          console.log('app.js: 本地存储中没有用户信息')
        }
      } catch (error) {
        console.error('app.js: 从本地存储加载用户信息失败', error)

        // 如果同步方式失败，尝试异步方式
        this.loadUserInfoAsync()
      }
    }, 100) // 延迟100ms确保存储API准备就绪
  },

  /**
   * 异步方式加载用户信息（备用方案）
   */
  loadUserInfoAsync() {
    // 检查异步存储API是否可用
    if (typeof wx === 'undefined' || !wx.getStorage) {
      console.warn('app.js: 异步存储API不可用，跳过加载')
      return
    }

    try {
      wx.getStorage({
        key: 'userInfo',
        success: (res) => {
          if (res.data) {
            this.globalData.userInfo = res.data
            console.log('app.js: 异步加载用户信息成功', this.globalData.userInfo)
          }
        },
        fail: (error) => {
          console.log('app.js: 异步加载用户信息失败（可能是首次使用）', error)
        }
      })
    } catch (error) {
      console.error('app.js: 异步存储API调用失败', error)
    }
  },

  /**
   * 设置用户信息，并同步保存到全局 globalData 和本地存储
   * 增加错误处理和重试机制
   */
  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    
    if (userInfo) {
      // 用户登录或信息更新，存入缓存
      this.saveUserInfoToStorage(userInfo)
      console.log('app.js: 用户信息已更新', userInfo)
    } else {
      // 用户退出登录，清除缓存
      this.clearUserInfoFromStorage()
      console.log('app.js: 用户已退出，清除用户信息')
    }
  },

  /**
   * 保存用户信息到本地存储（增强版）
   */
  saveUserInfoToStorage(userInfo) {
    // 检查存储API是否可用
    if (typeof wx === 'undefined') {
      console.warn('app.js: 微信API不可用，跳过保存')
      return
    }

    try {
      // 优先使用同步方式，但先检查API是否存在
      if (wx.setStorageSync) {
        wx.setStorageSync('userInfo', userInfo)
        console.log('app.js: 用户信息已同步保存到本地存储')
      } else if (wx.setStorage) {
        // 如果同步API不可用，直接使用异步
        this.saveUserInfoAsync(userInfo)
      } else {
        console.warn('app.js: 存储API不可用，无法保存用户信息')
      }
    } catch (error) {
      console.error('app.js: 同步保存用户信息失败，尝试异步方式', error)

      // 同步失败时使用异步方式
      this.saveUserInfoAsync(userInfo)
    }
  },

  /**
   * 异步保存用户信息
   */
  saveUserInfoAsync(userInfo) {
    if (!wx.setStorage) {
      console.warn('app.js: 异步存储API不可用')
      return
    }

    try {
      wx.setStorage({
        key: 'userInfo',
        data: userInfo,
        success: () => {
          console.log('app.js: 用户信息已异步保存到本地存储')
        },
        fail: (err) => {
          console.error('app.js: 异步保存用户信息也失败', err)
        }
      })
    } catch (error) {
      console.error('app.js: 异步存储API调用失败', error)
    }
  },

  /**
   * 清除用户信息从本地存储（增强版）
   */
  clearUserInfoFromStorage() {
    // 检查存储API是否可用
    if (typeof wx === 'undefined') {
      console.warn('app.js: 微信API不可用，跳过清除')
      return
    }

    try {
      // 优先使用同步方式，但先检查API是否存在
      if (wx.removeStorageSync) {
        wx.removeStorageSync('userInfo')
        console.log('app.js: 已同步清除本地存储的用户信息')
      } else if (wx.removeStorage) {
        // 如果同步API不可用，直接使用异步
        this.clearUserInfoAsync()
      } else {
        console.warn('app.js: 清除存储API不可用')
      }
    } catch (error) {
      console.error('app.js: 同步清除用户信息失败，尝试异步方式', error)

      // 同步失败时使用异步方式
      this.clearUserInfoAsync()
    }
  },

  /**
   * 异步清除用户信息
   */
  clearUserInfoAsync() {
    if (!wx.removeStorage) {
      console.warn('app.js: 异步清除存储API不可用')
      return
    }

    try {
      wx.removeStorage({
        key: 'userInfo',
        success: () => {
          console.log('app.js: 已异步清除本地存储的用户信息')
        },
        fail: (err) => {
          console.error('app.js: 异步清除用户信息也失败', err)
        }
      })
    } catch (error) {
      console.error('app.js: 异步清除存储API调用失败', error)
    }
  },

  /**
   * 异步从服务器刷新最新的用户信息
   * 修复循环依赖问题
   */
  async refreshUserInfo() {
    // 刷新控制：防止多个页面同时刷新
    const now = Date.now()
    if (this.globalData.isRefreshingUserInfo) {
      console.log('app.js: 刷新正在进行中，跳过重复调用')
      return this.globalData.userInfo
    }
    
    // 时间控制：30秒内不重复刷新
    if (now - this.globalData.lastRefreshTime < 30000) {
      console.log('app.js: 30秒内已刷新过，使用缓存数据')
      return this.globalData.userInfo
    }

    // 必须是在已登录状态下才执行刷新
    if (!this.globalData.userInfo) {
      console.log('app.js: 用户未登录，跳过刷新')
      return null
    }
    
    // 设置刷新状态
    this.globalData.isRefreshingUserInfo = true
    this.globalData.lastRefreshTime = now
    
    try {
      console.log('app.js: 开始从服务器刷新用户信息...')
      
      // 延迟加载api.js，避免循环依赖
      const api = require('./utils/api.js')
      const res = await api.getUserInfo()
      
      if (res.success && res.data && res.data.user_info) {
        // 后端返回的数据是嵌套的,需要提取 user_info 对象
        const userInfo = res.data.user_info
        // 获取成功后，通过统一的入口更新用户信息
        this.setUserInfo(userInfo)
        console.log('app.js: 从服务器刷新用户信息成功', userInfo)
        return userInfo
      } else {
        // 如果获取失败，可能意味着登录状态失效
        console.warn('app.js: 刷新用户信息失败，可能登录已失效', res.message)
        this.setUserInfo(null)
        return null
      }
    } catch (error) {
      console.error('app.js: 调用刷新用户信息接口异常', error)
      // 接口异常也可能意味着需要重新登录
      this.setUserInfo(null)
      return null
    } finally {
      // 无论成功失败，都要重置刷新状态
      this.globalData.isRefreshingUserInfo = false
    }
  },

  /**
   * 启动云函数预热机制
   * 定期ping云函数，保持热启动状态
   */
  startCloudFunctionWarmUp() {
    // 立即预热一次
    this.warmUpCloudFunction()

    // 每4分钟预热一次（云函数实例通常5-10分钟后销毁）
    this.warmUpTimer = setInterval(() => {
      this.warmUpCloudFunction()
    }, 4 * 60 * 1000) // 4分钟

    console.log('☁️ 云函数预热机制已启动')
  },

  /**
   * 执行云函数预热
   */
  async warmUpCloudFunction() {
    try {
      // 静默调用，不显示loading
      wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'ping'
        },
        success: (res) => {
          console.log('🔥 云函数预热成功')
        },
        fail: (err) => {
          console.warn('云函数预热失败:', err)
        }
      })
    } catch (error) {
      // 忽略预热错误
    }
  }
})