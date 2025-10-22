/**
 * AI模型调用模块 - 完整版本
 * 负责：模型选择、API调用、结果解析
 * 包含所有原始AI调用逻辑
 */

const axios = require('axios')
const cloud = require('wx-server-sdk')

class AICaller {
  constructor() {
    this.timeout = 60000 // 60秒超时
    this.retryCount = 2
    this.retryDelay = 2000
  }

  /**
   * 调用AI模型生成图片 (主要接口)
   * @param {Object} config - AI调用配置
   * @returns {Object} AI生成结果
   */
  async generateImages({ modelId, model, prompt, images, parameters }) {
    try {
      console.log('🚀 开始AI图片生成...')
      console.log(`📝 提示词长度: ${prompt.length} 字符`)
      console.log(`🖼️ 输入图片数量: ${images ? images.length : 0}`)

      // 获取模型配置
      const modelConfig = model || await this.getModelConfig(modelId)
      if (!modelConfig) {
        throw new Error('无法获取AI模型配置')
      }

      console.log(`🤖 使用AI模型: ${modelConfig.name} (${modelConfig.provider})`)

      // 准备API参数
      const params = this.prepareAPIParams(modelConfig, prompt, parameters, images)

      // 调用外部AI服务
      const startTime = Date.now()
      const aiResult = await this.callExternalAI(modelConfig, params)

      const generationTime = Date.now() - startTime
      console.log(`⏱️ AI生成耗时: ${generationTime}ms`)

      if (!aiResult.success) {
        return aiResult // 直接返回错误结果
      }

      // 添加元数据
      return {
        ...aiResult,
        data: {
          ...aiResult.data,
          model_used: modelConfig.name,
          generation_time: generationTime,
          provider: modelConfig.provider
        }
      }

    } catch (error) {
      console.error('❌ AI图片生成失败:', error.message)

      return {
        success: false,
        message: error.message,
        error_details: {
          type: error.constructor.name,
          stack: error.stack
        }
      }
    }
  }

  /**
   * 调用外部AI服务 (核心逻辑)
   */
  async callExternalAI(model, params) {
    try {
      console.log(`调用${model.provider}模型: ${model.model_name || model.name}`)
      console.log(`API格式: ${model.api_format}`)
      console.log('完整模型信息:', JSON.stringify(model, null, 2))

      // 解析API密钥
      console.log('🔑 检查API密钥:', model.api_key)
      const apiKey = this.parseApiKey(model.api_key)
      if (!apiKey) {
        console.error('❌ API密钥解析失败！')
        console.error('模型配置的API密钥:', model.api_key)
        console.error('如果是环境变量格式，请检查云函数环境变量设置')
        return {
          success: false,
          message: `API密钥未配置或环境变量未设置: ${model.api_key}`,
          error_details: {
            reason: 'api_key_missing',
            configured_key: model.api_key,
            model: model.name,
            provider: model.provider
          }
        }
      }
      console.log('✅ API密钥解析成功')

      // 检查是否是模拟模式（用于测试）
      if (process.env.MOCK_MODE === 'true' || params.mock_mode) {
        console.log('⚠️ 警告：使用模拟模式生成图片，这不是真实的AI结果！')
        return {
          success: false,
          message: '模拟模式已禁用，请配置真实的API密钥',
          error_details: {
            reason: 'mock_mode_disabled',
            model: model.name,
            provider: model.provider
          }
        }
      }

      // OpenAI兼容格式的Gemini API
      if (model.api_format === 'openai_compatible') {
        return await this.callGeminiOpenAICompatible({ ...model, api_key: apiKey }, params)
      }

      // Google官方格式的Gemini API
      if (model.api_format === 'google_official') {
        return await this.callGoogleGeminiAPI({ ...model, api_key: apiKey }, params)
      }

      // 不支持的API格式，直接返回错误
      console.error('❌ 不支持的API格式:', model.api_format)
      return {
        success: false,
        message: `不支持的API格式: ${model.api_format}，请检查模型配置`,
        error_details: {
          reason: 'unsupported_api_format',
          api_format: model.api_format,
          provider: model.provider,
          model: model.name
        }
      }

    } catch (error) {
      console.error('AI模型调用失败:', error)
      return {
        success: false,
        message: 'AI模型调用失败: ' + error.message,
        error_details: {
          provider: model ? model.provider : 'unknown',
          model: model ? model.name : 'unknown',
          error: error.message
        }
      }
    }
  }

  /**
   * 调用Gemini API（OpenAI兼容格式）
   */
  async callGeminiOpenAICompatible(model, params) {
    try {
      console.log('🟦 使用OpenAI兼容格式调用Gemini API...')
      console.log('📊 API配置:', {
        url: model.api_url,
        model: model.model_name,
        prompt_length: params.prompt ? params.prompt.length : 0,
        has_images: !!(params.images && params.images.length > 0)
      })

      // 准备请求体
      const requestBody = {
        model: model.model_name || 'gemini-1.5-flash',
        messages: [
          {
            role: 'user',
            content: params.prompt
          }
        ],
        max_tokens: 4096,
        temperature: 0.7
      }

      // 如果有图片，添加到消息中
      if (params.images && params.images.length > 0) {
        console.log(`📸 添加 ${params.images.length} 张图片到请求`)
        requestBody.messages[0].content = [
          { type: 'text', text: params.prompt }
        ]

        params.images.forEach((image, index) => {
          if (image.url && image.url.startsWith('data:image/')) {
            requestBody.messages[0].content.push({
              type: 'image_url',
              image_url: { url: image.url }
            })
            console.log(`✅ 添加第${index + 1}张图片 (base64格式)`)
          }
        })
      }

      console.log('📡 发送API请求...')
      const response = await axios({
        method: 'POST',
        url: model.api_url,
        headers: {
          'Authorization': `Bearer ${model.api_key}`,
          'Content-Type': 'application/json'
        },
        data: requestBody,
        timeout: this.timeout
      })

      console.log('✅ OpenAI兼容API调用成功')
      return this.parseOpenAICompatibleResponse(response.data)

    } catch (error) {
      console.error('❌ OpenAI兼容API调用失败:', error.message)
      if (error.response) {
        console.error('响应状态:', error.response.status)
        console.error('响应数据:', JSON.stringify(error.response.data, null, 2))
      }
      return {
        success: false,
        message: `OpenAI兼容API调用失败: ${error.message}`,
        error_details: {
          api_format: 'openai_compatible',
          status: error.response?.status,
          response: error.response?.data
        }
      }
    }
  }

  /**
   * 调用Google Gemini API（官方格式）
   */
  async callGoogleGeminiAPI(model, params) {
    try {
      console.log('🟩 使用Google官方格式调用Gemini API...')
      console.log('📊 API配置:', {
        url: model.api_url,
        model: model.model_name,
        prompt_length: params.prompt ? params.prompt.length : 0,
        has_images: !!(params.images && params.images.length > 0)
      })

      // 构建内容部分
      const parts = [{ text: params.prompt }]

      // 添加图片数据
      if (params.images && params.images.length > 0) {
        console.log(`📸 添加 ${params.images.length} 张图片到请求`)

        params.images.forEach((image, index) => {
          if (image.url && image.url.startsWith('data:image/')) {
            const matches = image.url.match(/^data:image\/([^;]+);base64,(.+)$/)
            if (matches) {
              const [, mimeType, base64Data] = matches
              parts.push({
                inline_data: {
                  mime_type: `image/${mimeType}`,
                  data: base64Data
                }
              })
              console.log(`✅ 添加第${index + 1}张图片 (${mimeType}格式)`)
            }
          }
        })
      }

      // 构建请求体
      const requestBody = {
        contents: [{
          parts: parts
        }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 4096
        }
      }

      console.log('📡 发送Google Gemini API请求...')
      const response = await axios({
        method: 'POST',
        url: `${model.api_url}?key=${model.api_key}`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: requestBody,
        timeout: this.timeout
      })

      console.log('✅ Google Gemini API调用成功')
      return this.parseGoogleGeminiResponse(response.data)

    } catch (error) {
      console.error('❌ Google Gemini API调用失败:', error.message)
      if (error.response) {
        console.error('响应状态:', error.response.status)
        console.error('响应数据:', JSON.stringify(error.response.data, null, 2))
      }
      return {
        success: false,
        message: `Google Gemini API调用失败: ${error.message}`,
        error_details: {
          api_format: 'google_official',
          status: error.response?.status,
          response: error.response?.data
        }
      }
    }
  }

  /**
   * 解析OpenAI兼容响应
   */
  parseOpenAICompatibleResponse(content) {
    try {
      console.log('🔍 解析OpenAI兼容响应...')

      if (!content.choices || !content.choices[0] || !content.choices[0].message) {
        throw new Error('响应格式无效')
      }

      const message = content.choices[0].message.content
      console.log('📄 获得文本响应:', message.substring(0, 100) + '...')

      // 解析文本内容，提取图片URL
      const images = this.parseContentForImages(message)

      return {
        success: true,
        data: {
          images: images,
          text_response: message,
          usage: content.usage
        },
        message: `OpenAI兼容API调用成功，提取到${images.length}张图片`
      }

    } catch (error) {
      console.error('❌ OpenAI兼容响应解析失败:', error.message)
      return {
        success: false,
        message: `响应解析失败: ${error.message}`
      }
    }
  }

  /**
   * 从内容中解析图片
   */
  parseContentForImages(content) {
    try {
      // 首先查找Markdown格式的base64图片 ![image](data:image/...)
      const base64ImageRegex = /!\[.*?\]\((data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)\)/g
      const base64Matches = []
      let match

      while ((match = base64ImageRegex.exec(content)) !== null) {
        base64Matches.push(match[1])
      }

      if (base64Matches.length > 0) {
        console.log(`🖼️ OpenAI兼容API找到${base64Matches.length}张base64格式图片`)
        return base64Matches.map((dataUrl, index) => ({
          url: dataUrl,
          width: 1024,
          height: 1024,
          metadata: {
            generated_by: 'gemini_openai_compatible',
            real_ai: true,
            extracted_from: 'base64_markdown',
            format: 'base64',
            index: index
          }
        }))
      }

      // 然后查找Markdown格式的HTTP图片链接 ![image](url)
      const imageRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g
      const matches = []

      while ((match = imageRegex.exec(content)) !== null) {
        matches.push(match[1])
      }

      if (matches.length > 0) {
        console.log(`🔗 OpenAI兼容API找到${matches.length}张HTTP URL图片`)
        return matches.map(url => ({
          url: url,
          width: 1024,
          height: 1024,
          metadata: {
            generated_by: 'gemini_openai_compatible',
            real_ai: true,
            extracted_from: 'http_markdown'
          }
        }))
      }

      // 如果没有找到Markdown格式，尝试查找纯URL
      const urlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/gi
      const urlMatches = []
      while ((match = urlRegex.exec(content)) !== null) {
        urlMatches.push(match[1])
      }

      if (urlMatches.length > 0) {
        console.log(`📷 找到${urlMatches.length}张纯URL格式图片`)
        return urlMatches.map(url => ({
          url: url,
          width: 1024,
          height: 1024,
          metadata: {
            generated_by: 'gemini_openai_compatible',
            real_ai: true,
            extracted_from: 'url'
          }
        }))
      }

      // 如果没有找到图片链接，返回空数组
      console.warn('未在响应中找到图片链接，响应内容:', content.substring(0, 200))
      return []

    } catch (error) {
      console.error('解析图片内容失败:', error)
      return []
    }
  }

  /**
   * 解析Google Gemini响应
   */
  parseGoogleGeminiResponse(responseData) {
    try {
      console.log('🔍 解析Google Gemini响应...')
      console.log('📊 响应数据概览:', {
        has_candidates: !!(responseData.candidates && responseData.candidates.length > 0),
        candidate_count: responseData.candidates ? responseData.candidates.length : 0
      })

      if (!responseData.candidates || responseData.candidates.length === 0) {
        throw new Error('没有获得AI响应候选')
      }

      const images = []
      let textResponse = ''

      responseData.candidates.forEach((candidate, candidateIndex) => {
        console.log(`处理候选${candidateIndex + 1}:`, {
          has_content: !!candidate.content,
          has_parts: !!(candidate.content && candidate.content.parts),
          parts_count: candidate.content && candidate.content.parts ? candidate.content.parts.length : 0
        })

        if (candidate.content && candidate.content.parts) {
          candidate.content.parts.forEach((part, partIndex) => {
            // 处理文本部分
            if (part.text) {
              textResponse += part.text
              console.log(`✅ 获得文本响应 (候选${candidateIndex + 1}, 部分${partIndex + 1}): ${part.text.substring(0, 50)}...`)
            }

            // 处理图片部分 - 兼容Node.js SDK格式(inlineData)和REST API格式(inline_data)
            const imageData = part.inlineData || part.inline_data
            if (imageData && imageData.data) {
              const mimeType = imageData.mimeType || imageData.mime_type
              const finalImageData = {
                url: `data:${mimeType};base64,${imageData.data}`,
                width: 1024, // Gemini通常返回1024x1024
                height: 1024,
                metadata: {
                  generated_by: 'gemini',
                  candidate_index: candidateIndex,
                  part_index: partIndex,
                  mime_type: mimeType,
                  format: 'base64',
                  size_kb: Math.round((imageData.data.length * 3) / 4 / 1024),
                  api_format: part.inlineData ? 'node_sdk' : 'rest_api'
                }
              }
              images.push(finalImageData)
              console.log(`✅ 获得图片 (候选${candidateIndex + 1}, 部分${partIndex + 1}): ${mimeType}, ${finalImageData.metadata.size_kb}KB [${finalImageData.metadata.api_format}格式]`)
            }

            // 调试：显示part的实际结构
            console.log(`🔍 Part结构 (候选${candidateIndex + 1}, 部分${partIndex + 1}):`, {
              has_text: !!part.text,
              has_inlineData: !!part.inlineData,
              has_inline_data: !!part.inline_data,
              part_keys: Object.keys(part)
            })
          })
        }
      })

      // 如果没有直接的图片数据，尝试从文本中提取图片链接
      if (images.length === 0 && textResponse) {
        console.log('🔍 没有找到inline图片数据，尝试从文本中提取图片链接...')
        const extractedImages = this.extractImagesFromText(textResponse)
        if (extractedImages.length > 0) {
          images.push(...extractedImages)
          console.log(`✅ 从文本中提取到${extractedImages.length}张图片`)
        }
      }

      if (images.length === 0 && !textResponse) {
        console.error('❌ 没有获得有效的响应内容')
        console.error('❌ 响应数据详情:', JSON.stringify(responseData, null, 2))
        throw new Error('没有获得有效的响应内容')
      }

      console.log(`📊 解析完成: ${images.length}张图片, ${textResponse.length}字符文本`)

      return {
        success: true,
        data: {
          images: images,
          text_response: textResponse,
          candidates_count: responseData.candidates.length,
          usage: responseData.usageMetadata || {}
        },
        message: `AI生成成功: ${images.length}张图片`
      }

    } catch (error) {
      console.error('❌ Google Gemini响应解析失败:', error.message)
      console.error('原始响应数据:', JSON.stringify(responseData, null, 2))
      return {
        success: false,
        message: `响应解析失败: ${error.message}`,
        error_details: {
          raw_response: responseData
        }
      }
    }
  }

  /**
   * 准备API调用参数
   */
  prepareAPIParams(model, prompt, parameters, images = []) {
    // 转换 ImageProcessor 格式为 API 期望格式
    const convertedImages = this.convertImagesForAPI(images)

    return {
      prompt: String(prompt || ''),
      images: convertedImages,
      ...(parameters || {})
    }
  }

  /**
   * 转换图片格式：ImageProcessor 输出 → API 期望格式
   */
  convertImagesForAPI(images) {
    if (!Array.isArray(images)) return []

    console.log(`🔄 转换 ${images.length} 张图片格式为API期望格式`)

    return images
      .filter(img => img.status === 'success') // 只处理成功的图片
      .map((img, index) => {
        try {
          // ImageProcessor 返回 base64Url，API 期待 url
          if (img.base64Url && img.base64Url.startsWith('data:image/')) {
            console.log(`✅ 转换第${index + 1}张图片: ${Math.round(img.size/1024)}KB`)
            return {
              url: img.base64Url,  // 关键：base64Url → url
              width: img.width || 1024,
              height: img.height || 1024,
              metadata: {
                mimeType: img.mimeType,
                size: img.size,
                fileId: img.fileId
              }
            }
          } else {
            console.warn(`⚠️ 第${index + 1}张图片缺少base64Url:`, Object.keys(img))
            return null
          }
        } catch (error) {
          console.error(`❌ 第${index + 1}张图片转换失败:`, error.message)
          return null
        }
      })
      .filter(img => img !== null)
  }

  /**
   * 解析API密钥 (支持环境变量)
   */
  parseApiKey(apiKey) {
    // 如果是环境变量格式 {{VAR_NAME}}
    if (apiKey && apiKey.startsWith('{{') && apiKey.endsWith('}}')) {
      const envVar = apiKey.slice(2, -2)
      const envValue = process.env[envVar]
      if (envValue) {
        console.log(`使用环境变量 ${envVar}`)
        return envValue
      } else {
        console.warn(`环境变量 ${envVar} 未设置`)
        return null
      }
    }
    return apiKey
  }

  /**
   * 计算调用成本
   */
  calculateCost(usage) {
    // 简化的成本计算，实际项目中应根据具体模型的计费方式
    return 0.01 // 固定成本
  }

  /**
   * 获取模型配置
   * @param {string} modelId - 模型ID
   * @returns {Object} 模型配置
   */
  async getModelConfig(modelId) {
    try {
      const db = cloud.database()
      const result = await db.collection('api_configs').doc(modelId).get()

      if (!result.data) {
        throw new Error(`模型配置不存在: ${modelId}`)
      }

      return result.data
    } catch (error) {
      console.error('获取模型配置失败:', error.message)
      throw new Error(`无法获取模型配置: ${error.message}`)
    }
  }

  /**
   * 选择最佳模型
   * @param {Object} requirements - 需求配置
   * @returns {Object} 推荐的模型
   */
  async selectBestModel(requirements) {
    try {
      console.log('🔍 开始选择最佳AI模型...')
      const db = cloud.database()

      // 尝试多种查询策略以确保找到可用模型
      let result = null

      // 策略1: 优先选择同时满足两个条件的模型
      result = await db.collection('api_configs')
        .where({
          status: 'active',
          is_active: true
        })
        .orderBy('priority', 'desc')
        .orderBy('weight', 'desc')
        .limit(1)
        .get()

      console.log('📊 策略1查询结果:', { count: result.data?.length || 0 })

      // 策略2: 如果没找到，则查找status为active的模型
      if (!result.data || result.data.length === 0) {
        console.log('🔄 策略1无结果，尝试策略2...')
        result = await db.collection('api_configs')
          .where({
            status: 'active'
          })
          .orderBy('priority', 'desc')
          .orderBy('weight', 'desc')
          .limit(1)
          .get()

        console.log('📊 策略2查询结果:', { count: result.data?.length || 0 })
      }

      // 策略3: 如果还没找到，查找is_active为true的模型
      if (!result.data || result.data.length === 0) {
        console.log('🔄 策略2无结果，尝试策略3...')
        result = await db.collection('api_configs')
          .where({
            is_active: true
          })
          .orderBy('priority', 'desc')
          .orderBy('weight', 'desc')
          .limit(1)
          .get()

        console.log('📊 策略3查询结果:', { count: result.data?.length || 0 })
      }

      if (result.data && result.data.length > 0) {
        const selectedModel = result.data[0]
        console.log('✅ 成功选择AI模型:', {
          name: selectedModel.name,
          id: selectedModel._id,
          status: selectedModel.status,
          is_active: selectedModel.is_active,
          priority: selectedModel.priority,
          weight: selectedModel.weight
        })

        return {
          success: true,
          data: {
            selected_model: selectedModel
          }
        }
      } else {
        // 最后尝试：获取所有模型看看到底有什么
        const allModels = await db.collection('api_configs').limit(10).get()
        console.error('❌ 所有策略都失败，数据库中的模型列表:', {
          total_count: allModels.data?.length || 0,
          models: allModels.data?.map(m => ({
            id: m._id,
            name: m.name,
            status: m.status,
            is_active: m.is_active
          })) || []
        })
        throw new Error(`没有可用的AI模型。数据库中共有${allModels.data?.length || 0}个模型`)
      }
    } catch (error) {
      return {
        success: false,
        message: `模型选择失败: ${error.message}`
      }
    }
  }

  /**
   * 处理大型AI结果 - 完整的图片上传逻辑和数据库更新
   * @param {string} taskId - 任务ID
   * @param {string} type - 任务类型 (photography/fitting)
   * @param {Object} aiResult - AI生成结果
   * @param {string} originalPrompt - 原始提示词
   */
  async handleLargeAIResult(taskId, type, aiResult, originalPrompt) {
    console.log('✅ 开始处理大型AI结果, taskId:', taskId)

    // 添加详细的AI结果调试信息
    console.log('🔍 AI结果详细检查:', {
      success: aiResult.success,
      hasData: !!aiResult.data,
      hasImages: !!(aiResult.data && aiResult.data.images),
      imagesLength: aiResult.data && aiResult.data.images ? aiResult.data.images.length : 0,
      imagesArray: aiResult.data && aiResult.data.images ? aiResult.data.images.map((img, i) => ({
        index: i,
        hasUrl: !!img.url,
        urlType: img.url ? (img.url.startsWith('data:') ? 'base64' : 'url') : 'none',
        urlLength: img.url ? img.url.length : 0
      })) : []
    })

    // 检查AI结果是否包含图片数据
    if (!aiResult.data || !aiResult.data.images || aiResult.data.images.length === 0) {
      console.error('❌ AI结果中没有图片数据！')
      console.error('❌ aiResult.data:', aiResult.data)
      throw new Error('AI生成成功但没有返回图片数据')
    }

    const db = cloud.database()
    const finalImages = []

    // 处理生成的图片 - 上传到云存储
    let uploadSuccessCount = 0
    let uploadFailCount = 0

    for (let i = 0; i < aiResult.data.images.length; i++) {
      const image = aiResult.data.images[i]
      console.log(`🖼️ 处理第${i+1}张图片，URL类型: ${image.url ? (image.url.startsWith('data:') ? 'base64' : 'URL') : '无URL'}`)

      try {
        if (image.url && image.url.startsWith('data:image/')) {
          // 处理base64图片
          console.log(`📤 上传第${i+1}张base64图片到云存储`)

          // 解析base64数据
          const matches = image.url.match(/^data:image\/([^;]+);base64,(.+)$/)
          if (!matches) {
            throw new Error('base64格式解析失败')
          }

          const [, imageFormat, base64Data] = matches

          // 验证base64数据
          if (!base64Data || base64Data.length < 100) {
            throw new Error('base64数据无效或过小')
          }

          const timestamp = Date.now()
          const fileName = `${type}_${taskId}_${i+1}_${timestamp}.${imageFormat}`
          const cloudPath = `${type}/${taskId}/${fileName}`

          // 上传到云存储
          const uploadResult = await cloud.uploadFile({
            cloudPath: cloudPath,
            fileContent: Buffer.from(base64Data, 'base64')
          })

          if (uploadResult.fileID) {
            finalImages.push({
              url: uploadResult.fileID,
              width: image.width || 1024,
              height: image.height || 1024,
              metadata: {
                ...image.metadata,
                cloud_path: cloudPath,
                uploaded_at: new Date(),
                original_format: imageFormat,
                ai_generated: true,
                upload_success: true,
                processed_in_aimodels: true // 标记为在aimodels中处理
              }
            })
            uploadSuccessCount++
            console.log(`✅ 第${i+1}张图片上传成功: ${uploadResult.fileID}`)
          } else {
            throw new Error('云存储返回空fileID')
          }
        } else if (image.url && (image.url.startsWith('http://') || image.url.startsWith('https://'))) {
          // 处理远程URL图片 - 保留原始URL
          console.log(`🔗 第${i+1}张图片为远程URL，直接保存`)
          finalImages.push({
            ...image,
            metadata: {
              ...image.metadata,
              ai_generated: true,
              upload_success: false,
              url_type: 'remote',
              processed_in_aimodels: true
            }
          })
          uploadSuccessCount++
        } else {
          throw new Error(`不支持的图片格式: ${image.url ? image.url.substring(0, 50) + '...' : '无URL'}`)
        }
      } catch (uploadError) {
        console.error(`❌ 第${i+1}张图片处理失败:`, uploadError.message)
        console.error(`❌ 错误详细信息:`, {
          error_type: uploadError.constructor.name,
          stack: uploadError.stack?.substring(0, 200),
          image_url_type: image.url ? (image.url.startsWith('data:') ? 'base64' : 'url') : 'no_url',
          image_size: image.url ? image.url.length : 0,
          task_id: taskId,
          image_index: i+1
        })
        uploadFailCount++

        // 保留原始图片数据作为备份，但标记为失败
        finalImages.push({
          ...image,
          metadata: {
            ...image.metadata,
            ai_generated: true,
            upload_success: false,
            upload_error: uploadError.message,
            upload_error_type: uploadError.constructor.name,
            upload_error_stack: uploadError.stack?.substring(0, 300),
            processed_in_aimodels: true,
            failed_at: new Date()
          }
        })
      }
    }

    console.log(`📊 图片处理统计: 总数 ${aiResult.data.images.length}, 成功 ${uploadSuccessCount}, 失败 ${uploadFailCount}`)

    // 检查是否至少有一张图片成功处理
    if (uploadSuccessCount === 0) {
      const totalImages = aiResult.data.images.length
      console.error(`❌ 所有图片处理都失败，任务标记为失败。总计${totalImages}张，失败${uploadFailCount}张`)
      throw new Error(`图片上传完全失败：成功0张，失败${uploadFailCount}张，总计${totalImages}张`)
    }

    // 更新作品记录
    const workStatus = uploadSuccessCount > 0 ? 'completed' : 'failed'
    console.log(`📝 更新作品记录为${workStatus} (成功图片: ${uploadSuccessCount}张)`)
    await db.collection('works')
      .where({ task_id: taskId })
      .update({
        data: {
          status: workStatus,
          images: finalImages,
          ai_prompt: originalPrompt,
          completed_at: workStatus === 'completed' ? new Date() : null,
          failed_at: workStatus === 'failed' ? new Date() : null,
          error_message: workStatus === 'failed' ? `图片上传失败：成功${uploadSuccessCount}张，失败${uploadFailCount}张` : null,
          updated_at: new Date()
        }
      })

    // 更新任务状态
    await db.collection('task_queue')
      .doc(taskId)
      .update({
        data: {
          status: workStatus,
          result: {
            success: workStatus === 'completed',
            images_count: finalImages.length,
            upload_success_count: uploadSuccessCount,
            upload_fail_count: uploadFailCount,
            ai_generated: true,
            processed_in_aimodels: true,
            error_message: workStatus === 'failed' ? `图片上传失败：成功${uploadSuccessCount}张，失败${uploadFailCount}张` : null
          },
          updated_at: new Date()
        }
      })

    console.log('🎉 大型AI结果处理完成，生成图片数量:', finalImages.length)
  }

  /**
   * 处理AI失败的情况 - 完整的积分退还逻辑
   * @param {string} taskId - 任务ID
   * @param {string} type - 任务类型
   * @param {Object} aiResult - AI失败结果
   */
  async handleFailedAI(taskId, type, aiResult) {
    console.log('❌ 在aimodels中处理AI失败结果, taskId:', taskId)

    const db = cloud.database()

    // 获取任务信息以便退还积分
    let taskInfo = null
    try {
      const taskResult = await db.collection('task_queue').doc(taskId).get()
      if (taskResult.data) {
        taskInfo = taskResult.data
      }
    } catch (error) {
      console.warn('获取任务信息失败:', error)
    }

    // 更新作品记录为失败
    await db.collection('works')
      .where({ task_id: taskId })
      .update({
        data: {
          status: 'failed',
          error: aiResult.message || 'AI生成失败',
          updated_at: new Date()
        }
      })

    // 更新任务状态为失败
    await db.collection('task_queue')
      .doc(taskId)
      .update({
        data: {
          status: 'failed',
          error: aiResult.message || 'AI生成失败',
          updated_at: new Date()
        }
      })

    // 退还用户积分
    if (taskInfo && taskInfo.user_openid && taskInfo.params) {
      try {
        const refundCredits = taskInfo.params.count || 1
        console.log('💰 退还用户积分:', refundCredits, 'to user:', taskInfo.user_openid)

        await db.collection('users')
          .where({ openid: taskInfo.user_openid })
          .update({
            data: {
              credits: db.command.inc(refundCredits),
              total_consumed_credits: db.command.inc(-refundCredits),
              updated_at: new Date()
            }
          })

        console.log('✅ 积分退还成功')
      } catch (refundError) {
        console.error('❌ 积分退还失败:', refundError)
      }
    } else {
      console.warn('无法退还积分，任务信息不完整')
    }

    console.log('💥 AI失败处理完成, taskId:', taskId)
  }
}

module.exports = AICaller