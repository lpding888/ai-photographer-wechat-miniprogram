/**
 * 腾讯云混元大模型适配器
 * 专门用于图像分析功能
 *
 * 支持两种调用方式：
 * 1. 腾讯云开发 (TCB) 方式 - 推荐
 * 2. 官方SDK方式 - 备用
 *
 * @author 老王
 * @version 1.0.0
 */

const BaseModelAdapter = require('./base-adapter.js')

class HunyuanAdapter extends BaseModelAdapter {
  constructor(config) {
    super(config)
    this.client = null
    this.useCloudBase = config.useCloudBase !== false // 默认使用云开发方式
  }

  /**
   * 初始化混元适配器
   */
  async initialize() {
    const startTime = Date.now()
    this.logOperationStart('初始化', { useCloudBase: this.useCloudBase })

    try {
      if (this.useCloudBase) {
        // 方式1：腾讯云开发 - 推荐方式
        await this.initializeCloudBase()
      } else {
        // 方式2：官方SDK方式
        await this.initializeOfficialSDK()
      }

      this.isInitialized = true

      const duration = Date.now() - startTime
      this.logOperationEnd('初始化', duration, { success: true })

      // 执行健康检查
      const healthCheck = await this.healthCheck()
      if (healthCheck.status !== 'healthy') {
        throw new Error(`初始化后健康检查失败: ${healthCheck.message}`)
      }

      console.log(`✅ 混元适配器初始化成功: ${this.name}`)
      return true

    } catch (error) {
      const duration = Date.now() - startTime
      this.logOperationEnd('初始化', duration, { success: false, error: error.message })
      throw error
    }
  }

  /**
   * 方式1：初始化腾讯云开发
   */
  async initializeCloudBase() {
    try {
      // 动态导入腾讯云开发SDK
      const tcb = require('@tencentcloud/tcb-nodejs')

      // 初始化云开发
      const app = tcb.init({
        env: this.config.envId,
        credentials: this.config.secretId && this.config.secretKey ? {
          secretId: this.config.secretId,
          secretKey: this.config.secretKey
        } : undefined
      })

      // 创建混元模型实例
      this.client = app.createModel('hunyuan-exp')

      console.log(`✅ 腾讯云开发方式初始化成功，环境: ${this.config.envId}`)
    } catch (error) {
      console.error('❌ 腾讯云开发方式初始化失败:', error.message)

      // 如果云开发方式失败，回退到官方SDK方式
      console.log('🔄 回退到官方SDK方式...')
      this.useCloudBase = false
      return await this.initializeOfficialSDK()
    }
  }

  /**
   * 方式2：初始化官方SDK
   */
  async initializeOfficialSDK() {
    try {
      // 动态导入混元SDK
      const { ChatCompletionsClient } = require('tencentcloud-sdk-nodejs-hunyuan')

      // 创建混元客户端
      this.client = new ChatCompletionsClient({
        credential: {
          secretId: this.config.secretId,
          secretKey: this.config.secretKey
        },
        region: this.config.region || 'ap-beijing',
        profile: {
          httpProfile: {
            endpoint: 'hunyuan.tencentcloudapi.com'
          }
        }
      })

      console.log(`✅ 官方SDK方式初始化成功，区域: ${this.config.region}`)
    } catch (error) {
      console.error('❌ 官方SDK方式初始化失败:', error.message)
      throw new Error('所有初始化方式都失败了，请检查配置')
    }
  }

  /**
   * 图像分析功能 - 混元的核心功能
   */
  async analyzeImages(imageUrls, options = {}) {
    if (!this.isInitialized) {
      throw new Error('适配器未初始化')
    }

    const startTime = Date.now()
    this.logOperationStart('图像分析', { imageUrls, options })

    try {
      // 参数验证
      this.validateParams('图像分析', { imageUrls }, {
        imageUrls: { required: true, type: 'object', min: 1, max: 5 }
      })

      // 构建分析提示词
      const analysisPrompt = this.buildAnalysisPrompt(options)

      // 构建消息内容
      const messages = [{
        role: 'user',
        content: this.buildMessageContent(analysisPrompt, imageUrls)
      }]

      // 调用API
      let response
      if (this.useCloudBase) {
        response = await this.callCloudBaseAPI(messages, options)
      } else {
        response = await this.callOfficialAPI(messages, options)
      }

      // 解析结果
      const analysisResult = this.parseAnalysisResult(response)

      const duration = Date.now() - startTime
      this.logOperationEnd('图像分析', duration, { success: true, result: analysisResult })

      return this.handleSuccess(analysisResult, '图像分析')

    } catch (error) {
      const duration = Date.now() - startTime
      this.logOperationEnd('图像分析', duration, { success: false, error: error.message })
      return this.handleError(error, '图像分析')
    }
  }

  /**
   * 图像生成功能 - 混元不支持
   */
  async generateImage(prompt, options = {}) {
    throw new Error('混元适配器不支持图像生成功能，请使用豆包适配器')
  }

  /**
   * 图像处理功能 - 混元不支持
   */
  async processImages(imageUrls, options = {}) {
    throw new Error('混元适配器不支持图像处理功能，请使用腾讯云CI适配器')
  }

  /**
   * 调用腾讯云开发API
   */
  async callCloudBaseAPI(messages, options = {}) {
    const params = {
      model: options.model || this.config.defaultModel || 'hunyuan-vision',
      messages: messages,
      temperature: options.temperature || 0.3,
      maxTokens: options.maxTokens || 2000,
      stream: false
    }

    const response = await this.client.streamText(params)
    return response
  }

  /**
   * 调用官方SDK API
   */
  async callOfficialAPI(messages, options = {}) {
    const params = {
      Model: options.model || this.config.defaultModel || 'hunyuan-vision',
      Messages: messages.map(msg => ({
        Role: msg.role,
        Contents: msg.content.map(content => {
          if (content.type === 'text') {
            return { Text: content.text }
          } else if (content.type === 'image_url') {
            return { ImageUrl: { Url: content.image_url.url } }
          }
          return null
        }).filter(Boolean)
      })),
      Temperature: options.temperature || 0.3,
      MaxTokens: options.maxTokens || 2000
    }

    const response = await this.client.ChatCompletions(params)
    return response
  }

  /**
   * 构建分析提示词
   */
  buildAnalysisPrompt(options = {}) {
    const basePrompt = options.basePrompt || `请分析这些图片中的人物特征、服装信息、姿势动作、整体风格等。请用JSON格式返回分析结果，包含以下字段：
- person: 人物特征（年龄、性别、发型、身材、表情等）
- clothing: 服装信息（类型、颜色、款式、材质、搭配等）
- pose: 姿势动作（身体姿态、动作、角度等）
- style: 整体风格（时尚风格、气质特征、场合等）

请确保返回有效的JSON格式。`

    return basePrompt
  }

  /**
   * 构建消息内容
   */
  buildMessageContent(prompt, imageUrls) {
    const content = [
      { type: 'text', text: prompt }
    ]

    // 添加图片内容
    imageUrls.forEach(url => {
      content.push({
        type: 'image_url',
        image_url: { url }
      })
    })

    return content
  }

  /**
   * 解析分析结果
   */
  parseAnalysisResult(response) {
    try {
      let analysisText

      // 根据不同的调用方式解析响应
      if (response.Response && response.Response.Choices) {
        // 官方SDK响应格式
        analysisText = response.Response.Choices[0].Message.Content
      } else if (response.textStream || response.text) {
        // 云开发响应格式
        analysisText = response.textStream || response.text
      } else if (typeof response === 'string') {
        // 直接返回文本
        analysisText = response
      } else {
        throw new Error('未知的响应格式')
      }

      console.log('🤖 混元分析结果原始文本:', analysisText)

      // 尝试解析JSON
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          return {
            ...parsed,
            rawResponse: analysisText,
            adapter: this.name,
            model: this.config.defaultModel || 'hunyuan-vision'
          }
        } catch (parseError) {
          console.warn('JSON解析失败，尝试提取其他格式')
        }
      }

      // 如果JSON解析失败，创建基础分析
      return this.createFallbackAnalysis(analysisText)

    } catch (error) {
      console.error('解析混元分析结果失败:', error)
      return this.createFallbackAnalysis('解析失败: ' + error.message)
    }
  }

  /**
   * 创建备用分析结果
   */
  createFallbackAnalysis(rawText) {
    return {
      person: {
        age: '未知',
        gender: '未知',
        hair: '未知',
        bodyType: '中等',
        expression: '自然'
      },
      clothing: {
        type: '服装',
        color: '多色',
        style: '时尚',
        material: '未知'
      },
      pose: {
        posture: '站立',
        action: '自然',
        angle: '正面'
      },
      style: {
        overall: '时尚',
        mood: '自然',
        occasion: '日常'
      },
      fallbackReason: 'JSON解析失败，返回基础分析',
      rawResponse: rawText,
      adapter: this.name,
      model: this.config.defaultModel || 'hunyuan-vision'
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return {
          status: 'uninitialized',
          adapter: this.name,
          message: '适配器未初始化'
        }
      }

      // 执行简单的测试调用
      const testResult = await this.analyzeImages(
        ['https://example.com/test.jpg'], // 使用测试图片URL
        {
          maxTokens: 10,
          temperature: 0.1,
          basePrompt: '测试连接，请简短回复'
        }
      )

      return {
        status: 'healthy',
        adapter: this.name,
        method: this.useCloudBase ? 'cloud_base' : 'official_sdk',
        model: this.config.defaultModel || 'hunyuan-vision',
        region: this.config.region,
        envId: this.config.envId,
        lastCheck: new Date().toISOString(),
        testResult: testResult.success ? 'success' : 'failed'
      }

    } catch (error) {
      return {
        status: 'unhealthy',
        adapter: this.name,
        message: error.message,
        lastCheck: new Date().toISOString()
      }
    }
  }

  /**
   * 获取模型信息
   */
  getModelInfo() {
    return {
      ...super.getModelInfo(),
      capabilities: ['image_analysis', 'text_generation', 'multi_modal'],
      supportedModels: ['hunyuan-vision', 'hunyuan-lite', 'hunyuan-pro'],
      apiMethod: this.useCloudBase ? 'tencent_cloud_base' : 'official_sdk',
      recommendedUse: 'image_analysis',
      limitations: ['不支持图像生成', '不支持图像处理']
    }
  }
}

module.exports = HunyuanAdapter