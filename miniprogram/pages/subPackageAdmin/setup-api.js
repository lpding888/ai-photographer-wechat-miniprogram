// pages/setup-api/setup-api.js
Page({
  data: {
    loading: false,
    models: []
  },

  onLoad: function (options) {
    console.log('API配置页面加载')
    this.setupGeminiModels()
  },

  // 设置Gemini API模型
  async setupGeminiModels() {
    this.setData({ loading: true })

    try {
      console.log('正在配置Gemini API模型...')

      // 调用database-init云函数
      const result = await wx.cloud.callFunction({
        name: 'database-init',
        data: {
          action: 'add_gemini_models'
        }
      })

      console.log('云函数返回结果：', result.result)

      if (result.result.success) {
        wx.showToast({
          title: '配置成功！',
          icon: 'success'
        })

        this.setData({
          models: result.result.results || []
        })

        // 显示配置结果
        const message = `配置成功！\n\n已配置模型：\n${result.result.results.map(r => `${r.model_id}: ${r.action}`).join('\n')}\n\n请在云开发控制台设置环境变量：\n- GEMINI_OPENAI_API_KEY\n- GEMINI_GOOGLE_API_KEY`

        wx.showModal({
          title: '配置完成',
          content: message,
          showCancel: false,
          confirmText: '知道了'
        })

      } else {
        throw new Error(result.result.message || '配置失败')
      }

    } catch (error) {
      console.error('配置API模型失败：', error)

      wx.showModal({
        title: '配置失败',
        content: `错误信息：${error.message}\n\n请检查：\n1. database-init云函数是否已部署\n2. 网络连接是否正常\n3. 云开发环境是否正常`,
        showCancel: false,
        confirmText: '知道了'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 测试API调用
  async testApiCall() {
    wx.showLoading({ title: '测试中...' })

    try {
      // 调用aimodels云函数测试
      const result = await wx.cloud.callFunction({
        name: 'aimodels',
        data: {
          model_id: 'gemini-openai-compatible',
          prompt: '这是一个测试调用，请回复"API连接成功"',
          image_count: 1
        }
      })

      wx.hideLoading()
      console.log('API测试结果：', result.result)

      if (result.result.success) {
        wx.showToast({
          title: 'API测试成功！',
          icon: 'success'
        })
      } else {
        wx.showModal({
          title: 'API测试失败',
          content: result.result.message || '未知错误',
          showCancel: false
        })
      }

    } catch (error) {
      wx.hideLoading()
      console.error('API测试失败：', error)

      wx.showModal({
        title: '测试失败',
        content: error.message || '网络错误',
        showCancel: false
      })
    }
  },

  // 返回首页
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})