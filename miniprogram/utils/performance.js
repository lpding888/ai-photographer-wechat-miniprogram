// 性能监控工具
class PerformanceMonitor {
  constructor() {
    this.metrics = {}
    this.pageLoadTimes = new Map()
    this.apiCallTimes = new Map()
    this.imageLoadTimes = new Map()
    this.memoryUsage = []
    this.crashReports = []

    // 开始监控
    this.startMonitoring()
  }

  /**
   * 开始性能监控
   */
  startMonitoring() {
    // 监控内存使用
    this.monitorMemoryUsage()

    // 监控页面性能
    this.monitorPagePerformance()

    // 监控网络请求
    this.monitorNetworkRequests()
  }

  /**
   * 记录页面加载开始时间
   */
  startPageLoad(pagePath) {
    const startTime = Date.now()
    this.pageLoadTimes.set(pagePath, { startTime })
    console.log(`📊 页面加载开始: ${pagePath}`)
  }

  /**
   * 记录页面加载完成时间
   */
  endPageLoad(pagePath) {
    const pageData = this.pageLoadTimes.get(pagePath)
    if (pageData) {
      const endTime = Date.now()
      const loadTime = endTime - pageData.startTime

      this.pageLoadTimes.set(pagePath, {
        ...pageData,
        endTime,
        loadTime
      })

      console.log(`📊 页面加载完成: ${pagePath}, 耗时: ${loadTime}ms`)

      // 记录性能指标
      this.recordMetric('page_load_time', {
        page: pagePath,
        loadTime,
        timestamp: endTime
      })

      // 如果加载时间过长，记录警告
      if (loadTime > 3000) {
        this.recordWarning('slow_page_load', {
          page: pagePath,
          loadTime
        })
      }
    }
  }

  /**
   * 记录API调用性能
   */
  startApiCall(apiName, data) {
    const callId = `${apiName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const startTime = Date.now()

    this.apiCallTimes.set(callId, {
      apiName,
      data,
      startTime
    })

    return callId
  }

  /**
   * 记录API调用完成
   */
  endApiCall(callId, success, responseSize = 0) {
    const callData = this.apiCallTimes.get(callId)
    if (callData) {
      const endTime = Date.now()
      const responseTime = endTime - callData.startTime

      console.log(`📊 API调用完成: ${callData.apiName}, 耗时: ${responseTime}ms, 成功: ${success}`)

      // 记录性能指标
      this.recordMetric('api_call_time', {
        api: callData.apiName,
        responseTime,
        success,
        responseSize,
        timestamp: endTime
      })

      // 如果响应时间过长，记录警告
      if (responseTime > 5000) {
        this.recordWarning('slow_api_call', {
          api: callData.apiName,
          responseTime
        })
      }

      this.apiCallTimes.delete(callId)
    }
  }

  /**
   * 记录图片加载性能
   */
  recordImageLoad(imageUrl, loadTime, success = true) {
    this.recordMetric('image_load_time', {
      url: imageUrl,
      loadTime,
      success,
      timestamp: Date.now()
    })

    if (loadTime > 3000) {
      this.recordWarning('slow_image_load', {
        url: imageUrl,
        loadTime
      })
    }
  }

  /**
   * 监控内存使用
   */
  monitorMemoryUsage() {
    const recordMemory = () => {
      try {
        // 使用新的 API 替代已废弃的 getSystemInfo
        try {
          const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {}
          const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {}

          const memoryInfo = {
            timestamp: Date.now(),
            deviceMemory: deviceInfo.system || 'unknown',
            availableMemory: deviceInfo.memorySize || 0,
            windowWidth: windowInfo.windowWidth || 0,
            windowHeight: windowInfo.windowHeight || 0
          }

          this.memoryUsage.push(memoryInfo)

          // 只保留最近100条记录
          if (this.memoryUsage.length > 100) {
            this.memoryUsage.shift()
          }
        } catch (apiError) {
          // 如果新 API 不可用，回退到旧 API
          wx.getSystemInfo({
            success: (res) => {
              const memoryInfo = {
                timestamp: Date.now(),
                deviceMemory: res.system || 'unknown',
                availableMemory: res.memorySize || 0
              }
              this.memoryUsage.push(memoryInfo)
              if (this.memoryUsage.length > 100) {
                this.memoryUsage.shift()
              }
            }
          })
        }
      } catch (error) {
        console.warn('获取内存信息失败:', error)
      }
    }

    // 每30秒记录一次内存使用
    setInterval(recordMemory, 30000)
    recordMemory() // 立即记录一次
  }

  /**
   * 监控页面性能
   */
  monitorPagePerformance() {
    // 监控页面渲染性能
    const originalPage = Page
    const self = this

    Page = function(options) {
      const originalOnLoad = options.onLoad
      const originalOnShow = options.onShow
      const originalOnReady = options.onReady

      // 重写onLoad
      options.onLoad = function(...args) {
        const pagePath = this.route || 'unknown'
        self.startPageLoad(pagePath)

        if (originalOnLoad) {
          originalOnLoad.apply(this, args)
        }
      }

      // 重写onShow
      options.onShow = function(...args) {
        const pagePath = this.route || 'unknown'

        if (originalOnShow) {
          originalOnShow.apply(this, args)
        }
      }

      // 重写onReady
      options.onReady = function(...args) {
        const pagePath = this.route || 'unknown'
        self.endPageLoad(pagePath)

        if (originalOnReady) {
          originalOnReady.apply(this, args)
        }
      }

      return originalPage(options)
    }
  }

  /**
   * 监控网络请求
   */
  monitorNetworkRequests() {
    // 这里可以监控wx.request的性能
    const originalRequest = wx.request
    const self = this

    wx.request = function(options) {
      const startTime = Date.now()
      const url = options.url

      const originalSuccess = options.success
      const originalFail = options.fail

      options.success = function(res) {
        const endTime = Date.now()
        const responseTime = endTime - startTime

        self.recordMetric('network_request', {
          url,
          responseTime,
          success: true,
          statusCode: res.statusCode,
          timestamp: endTime
        })

        if (originalSuccess) {
          originalSuccess(res)
        }
      }

      options.fail = function(error) {
        const endTime = Date.now()
        const responseTime = endTime - startTime

        self.recordMetric('network_request', {
          url,
          responseTime,
          success: false,
          error: error.errMsg,
          timestamp: endTime
        })

        if (originalFail) {
          originalFail(error)
        }
      }

      return originalRequest(options)
    }
  }

  /**
   * 记录性能指标
   */
  recordMetric(type, data) {
    if (!this.metrics[type]) {
      this.metrics[type] = []
    }

    this.metrics[type].push(data)

    // 只保留最近50条记录
    if (this.metrics[type].length > 50) {
      this.metrics[type].shift()
    }
  }

  /**
   * 记录警告
   */
  recordWarning(type, data) {
    console.warn(`⚠️ 性能警告 [${type}]:`, data)

    this.recordMetric('performance_warning', {
      type,
      data,
      timestamp: Date.now()
    })
  }

  /**
   * 记录崩溃报告
   */
  recordCrash(error, context) {
    const crashReport = {
      timestamp: Date.now(),
      error: {
        message: error.message,
        stack: error.stack
      },
      context,
      metrics: this.getPerformanceSummary()
    }

    this.crashReports.push(crashReport)
    console.error('💥 应用崩溃:', crashReport)

    // 只保留最近10条崩溃报告
    if (this.crashReports.length > 10) {
      this.crashReports.shift()
    }
  }

  /**
   * 获取性能摘要
   */
  getPerformanceSummary() {
    const summary = {
      timestamp: Date.now(),
      pageLoads: this.getAverageMetric('page_load_time', 'loadTime'),
      apiCalls: this.getAverageMetric('api_call_time', 'responseTime'),
      imageLoads: this.getAverageMetric('image_load_time', 'loadTime'),
      networkRequests: this.getAverageMetric('network_request', 'responseTime'),
      memoryUsage: this.getLatestMemoryUsage(),
      warningCount: this.getMetricCount('performance_warning'),
      crashCount: this.crashReports.length
    }

    return summary
  }

  /**
   * 获取平均指标
   */
  getAverageMetric(type, field) {
    const metrics = this.metrics[type] || []
    if (metrics.length === 0) return 0

    const sum = metrics.reduce((total, metric) => total + (metric[field] || 0), 0)
    return Math.round(sum / metrics.length)
  }

  /**
   * 获取指标数量
   */
  getMetricCount(type) {
    return (this.metrics[type] || []).length
  }

  /**
   * 获取最新内存使用
   */
  getLatestMemoryUsage() {
    return this.memoryUsage[this.memoryUsage.length - 1] || null
  }

  /**
   * 导出性能报告
   */
  exportReport() {
    const report = {
      timestamp: Date.now(),
      summary: this.getPerformanceSummary(),
      metrics: this.metrics,
      pageLoadTimes: Array.from(this.pageLoadTimes.entries()),
      memoryUsage: this.memoryUsage,
      crashReports: this.crashReports
    }

    return report
  }

  /**
   * 清理数据
   */
  clearData() {
    this.metrics = {}
    this.pageLoadTimes.clear()
    this.apiCallTimes.clear()
    this.imageLoadTimes.clear()
    this.memoryUsage = []
    this.crashReports = []

    console.log('📊 性能监控数据已清理')
  }

  /**
   * 获取性能建议
   */
  getPerformanceAdvice() {
    const summary = this.getPerformanceSummary()
    const advice = []

    if (summary.pageLoads > 3000) {
      advice.push('页面加载时间过长，建议优化页面渲染逻辑')
    }

    if (summary.apiCalls > 5000) {
      advice.push('API响应时间过长，建议检查网络连接或服务器性能')
    }

    if (summary.imageLoads > 3000) {
      advice.push('图片加载时间过长，建议压缩图片或使用CDN')
    }

    if (summary.warningCount > 10) {
      advice.push('性能警告过多，建议全面检查应用性能')
    }

    if (summary.crashCount > 0) {
      advice.push('应用存在崩溃，建议检查错误日志并修复问题')
    }

    return advice
  }
}

// 创建全局性能监控实例
const performanceMonitor = new PerformanceMonitor()

// 全局错误处理
wx.onError((error) => {
  performanceMonitor.recordCrash(new Error(error), 'global_error')
})

// 全局未处理的Promise拒绝
wx.onUnhandledRejection((event) => {
  performanceMonitor.recordCrash(new Error(event.reason), 'unhandled_rejection')
})

module.exports = performanceMonitor