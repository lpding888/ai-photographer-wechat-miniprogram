/**
 * 字节跳动豆包Seedream 4.0适配器
 * 专门用于图像生成功能
 *
 * 支持功能：
 * 1. 图像生成 (核心功能)
 * 2. 参考图生成
 * 3. 多图融合
 * 4. 连续生成
 *
 * @author 老王
 * @version 1.0.0
 */

const BaseModelAdapter = require('./base-adapter.js')

class DoubaoAdapter extends BaseModelAdapter {
  constructor(config) {
    super(config)
    this.apiEndpoint = config.apiEndpoint || 'https://ark.cn-beijing.volces.com/api/v3'
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel || 'doubao-Seedream-4-0-250828'
  }

  /**
   * 初始化豆包适配器
   */
  async initialize() {
    const startTime = Date.now()
    this.logOperationStart('初始化', {
      apiEndpoint: this.apiEndpoint,
      defaultModel: this.defaultModel
    })

    try {
      // 验证必需的配置
      if (!this.apiKey) {
        throw new Error('缺少必需的apiKey配置')
      }

      // 执行API连接测试
      await this.testAPIConnection()

      this.isInitialized = true

      const duration = Date.now() - startTime
      this.logOperationEnd('初始化', duration, { success: true })

      console.log(`✅ 豆包适配器初始化成功: ${this.name}`)
      return true

    } catch (error) {
      const duration = Date.now() - startTime
      this.logOperationEnd('初始化', duration, { success: false, error: error.message })
      throw error
    }
  }

  /**
   * 测试API连接
   */
  async testAPIConnection() {
    try {
      const testResponse = await this.makeAPIRequest('/images/generations', {
        model: this.defaultModel,
        prompt: 'test connection',
        max_retries: 1,
        samples: 1
      })

      if (!testResponse) {
        throw new Error('API连接测试返回空响应')
      }

      console.log('✅ 豆包API连接测试成功')
    } catch (error) {
      console.error('❌ 豆包API连接测试失败:', error.message)
      throw new Error(`API连接失败: ${error.message}`)
    }
  }

  /**
   * 图像分析功能 - 豆包不支持
   */
  async analyzeImages(imageUrls, options = {}) {
    throw new Error('豆包适配器不支持图像分析功能，请使用混元适配器')
  }

  /**
   * 图像生成功能 - 豆包的核心功能
   */
  async generateImage(prompt, options = {}) {
    if (!this.isInitialized) {
      throw new Error('适配器未初始化')
    }

    const startTime = Date.now()
    this.logOperationStart('图像生成', { prompt: prompt.substring(0, 100) + '...', options })

    try {
      // 参数验证
      this.validateParams('图像生成', { prompt }, {
        prompt: { required: true, type: 'string', min: 1, max: 1000 }
      })

      // 构建请求参数
      const requestBody = this.buildGenerationRequest(prompt, options)

      // 调用API
      const response = await this.makeAPIRequest('/images/generations', requestBody)

      // 解析结果
      const generationResult = this.parseGenerationResult(response)

      const duration = Date.now() - startTime
      this.logOperationEnd('图像生成', duration, {
        success: true,
        imagesGenerated: generationResult.images?.length || 0
      })

      return this.handleSuccess(generationResult, '图像生成')

    } catch (error) {
      const duration = Date.now() - startTime
      this.logOperationEnd('图像生成', duration, { success: false, error: error.message })
      return this.handleError(error, '图像生成')
    }
  }

  /**
   * 图像处理功能 - 豆包不支持
   */
  async processImages(imageUrls, options = {}) {
    throw new Error('豆包适配器不支持图像处理功能，请使用腾讯云CI适配器')
  }

  /**
   * 构建图像生成请求参数
   */
  buildGenerationRequest(prompt, options = {}) {
    const requestBody = {
      model: options.model || this.defaultModel,
      prompt: prompt,
      response_format: options.responseFormat || "url",
      size: options.size || "2K",
      quality: options.quality || "standard",
      stream: false,
      watermark: options.watermark || false
    }

    // 添加参考图支持
    if (options.referenceImages && Array.isArray(options.referenceImages) && options.referenceImages.length > 0) {
      requestBody.image = options.referenceImages.slice(0, 5) // 最多5张参考图
    }

    // 添加连续生成支持
    if (options.enableSequential !== false) {
      requestBody.sequential_image_generation = options.sequentialMode || "auto"
      requestBody.sequential_image_generation_options = {
        max_images: Math.min(options.maxImages || 4, 6) // 最多6张
      }
    }

    // 添加自定义参数
    if (options.customParams && typeof options.customParams === 'object') {
      Object.assign(requestBody, options.customParams)
    }

    // 添加风格参数
    if (options.style) {
      requestBody.style = options.style
    }

    // 添加种子参数
    if (options.seed !== undefined) {
      requestBody.seed = options.seed
    }

    return requestBody
  }

  /**
   * 发起API请求
   */
  async makeAPIRequest(endpoint, requestBody) {
    const url = `${this.apiEndpoint}${endpoint}`

    console.log(`🌐 发起豆包API请求: ${url}`)
    console.log(`📝 请求参数:`, JSON.stringify(requestBody, null, 2))

    // 使用fetch发起请求
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DoubaoAdapter/1.0.0'
      },
      body: JSON.stringify(requestBody),
      timeout: this.config.timeout || 300000 // 5分钟超时
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ 豆包API请求失败: ${response.status} ${response.statusText}`)
      console.error(`❌ 错误详情:`, errorText)
      throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const responseData = await response.json()
    console.log(`✅ 豆包API请求成功`)

    return responseData
  }

  /**
   * 解析图像生成结果
   */
  parseGenerationResult(response) {
    try {
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('API返回的图像数据为空')
      }

      const images = response.data.map((item, index) => ({
        id: item.id || `image_${index}`,
        url: item.url,
        revised_prompt: item.revised_prompt || '',
        seed: item.seed,
        width: item.width || 2048,
        height: item.height || 2048,
        size: item.size || '2K',
        quality: item.quality || 'standard',
        model: response.model || this.defaultModel
      }))

      return {
        success: true,
        images: images,
        total_images: images.length,
        model: response.model || this.defaultModel,
        usage: response.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        },
        created_at: response.created || Date.now(),
        adapter: this.name
      }

    } catch (error) {
      console.error('解析豆包生成结果失败:', error)
      throw new Error(`结果解析失败: ${error.message}`)
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

      // 执行简单的测试生成
      const testResult = await this.generateImage('test health check', {
        maxImages: 1,
        size: '512x512',
        quality: 'standard',
        enableSequential: false
      })

      return {
        status: 'healthy',
        adapter: this.name,
        apiEndpoint: this.apiEndpoint,
        defaultModel: this.defaultModel,
        lastCheck: new Date().toISOString(),
        testResult: testResult.success ? 'success' : 'failed',
        supportedFeatures: [
          'image_generation',
          'reference_generation',
          'multi_fusion',
          'sequential_generation'
        ]
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
      capabilities: [
        'image_generation',
        'reference_generation',
        'multi_fusion',
        'sequential_generation',
        'style_transfer'
      ],
      supportedModels: [
        'doubao-Seedream-4-0-250828',
        'doubao-Seedream-4-0-latest',
        'doubao-vision-4-0-latest'
      ],
      supportedSizes: ['512x512', '1K', '2K', '4K'],
      supportedQualities: ['standard', 'hd'],
      apiEndpoint: this.apiEndpoint,
      defaultModel: this.defaultModel,
      recommendedUse: 'image_generation',
      limitations: ['不支持图像分析', '不支持图像处理'],
      features: {
        '4k_support': true,
        'multi_image_fusion': true,
        'reference_generation': true,
        'style_transfer': true,
        'sequential_generation': true,
        'max_images_per_request': 6,
        'max_reference_images': 5
      }
    }
  }

  /**
   * 获取支持的风格列表
   */
  getSupportedStyles() {
    return [
      'realistic',      // 写实风格
      'anime',          // 动漫风格
      'oil_painting',   // 油画风格
      'watercolor',     // 水彩风格
      'sketch',         // 素描风格
      'cartoon',        // 卡通风格
      'cyberpunk',      // 赛博朋克
      'vintage',        // 复古风格
      'fantasy',        // 奇幻风格
      'minimalist'      // 极简风格
    ]
  }

  /**
   * 获取推荐的生成参数
   */
  getRecommendedParams(purpose = 'general') {
    const baseParams = {
      size: '2K',
      quality: 'standard',
      enableSequential: true,
      maxImages: 4,
      watermark: false
    }

    const purposeParams = {
      'portrait': {
        ...baseParams,
        size: '2K',
        quality: 'hd',
        maxImages: 2
      },
      'fashion': {
        ...baseParams,
        size: '2K',
        quality: 'hd',
        maxImages: 4,
        style: 'realistic'
      },
      'artistic': {
        ...baseParams,
        size: '1K',
        quality: 'standard',
        maxImages: 6,
        enableSequential: true
      },
      'quick': {
        ...baseParams,
        size: '512x512',
        quality: 'standard',
        maxImages: 1,
        enableSequential: false
      }
    }

    return purposeParams[purpose] || baseParams
  }
}

module.exports = DoubaoAdapter