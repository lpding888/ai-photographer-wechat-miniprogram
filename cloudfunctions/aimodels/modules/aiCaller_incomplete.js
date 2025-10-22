/**
 * AI模型调用模块
 * 负责：模型选择、API调用、结果解析
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
   * 调用AI模型生成图片
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

      // 根据模型提供商调用不同的API
      const startTime = Date.now()
      let aiResult

      switch (modelConfig.provider) {
        case 'gemini':
        case 'google':
          aiResult = await this.callGeminiAPI(modelConfig, prompt, images, parameters)
          break

        case 'openai':
          aiResult = await this.callOpenAIAPI(modelConfig, prompt, images, parameters)
          break

        case 'anthropic':
          aiResult = await this.callAnthropicAPI(modelConfig, prompt, images, parameters)
          break

        default:
          throw new Error(`不支持的AI模型提供商: ${modelConfig.provider}`)
      }

      const generationTime = Date.now() - startTime
      console.log(`⏱️ AI生成耗时: ${generationTime}ms`)

      // 解析和验证结果
      const parsedResult = await this.parseAIResponse(aiResult, modelConfig)

      return {
        success: true,
        data: {
          images: parsedResult.images,
          model_used: modelConfig.name,
          generation_time: generationTime,
          cost: this.calculateCost(modelConfig, parameters),
          raw_response: aiResult,
          provider: modelConfig.provider
        },
        message: 'AI图片生成成功'
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
   * 调用Google Gemini API
   */
  async callGeminiAPI(model, prompt, images, parameters) {
    console.log('🔵 调用Google Gemini API...')

    // 构建请求parts
    const parts = [{ text: prompt }]

    // 添加图片数据
    if (images && images.length > 0) {
      console.log(`📸 添加 ${images.length} 张参考图片`)

      for (let i = 0; i < images.length; i++) {
        const image = images[i]
        let base64Data, mimeType

        if (image.base64Data && image.mimeType) {
          base64Data = image.base64Data
          mimeType = image.mimeType
        } else if (image.base64) {
          base64Data = image.base64
          mimeType = image.mimeType || 'image/jpeg'
        } else if (image.url && image.url.startsWith('data:image/')) {
          const matches = image.url.match(/^data:image\/([^;]+);base64,(.+)$/)
          if (matches) {
            mimeType = `image/${matches[1]}`
            base64Data = matches[2]
          } else {
            throw new Error(`无效的base64图片格式: 图片${i+1}`)
          }
        } else {
          throw new Error(`无效的图片数据格式: 图片${i+1}`)
        }

        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        })

        console.log(`✅ 成功添加第${i+1}张图片到API请求`)
      }
    }

    // 构建请求数据
    const requestData = {
      contents: [{
        parts: parts
      }],
      generationConfig: {
        responseModalities: ["IMAGE"]
      }
    }

    console.log('📡 发送Gemini API请求...')

    // 调用API
    const response = await axios({
      method: 'POST',
      url: `${model.api_url}?key=${model.api_key}`,
      headers: {
        'Authorization': `Bearer ${model.api_key}`,
        'Content-Type': 'application/json'
      },
      data: requestData,
      timeout: this.timeout
    })

    console.log('✅ Gemini API响应成功')
    return response.data
  }

  /**
   * 调用OpenAI API
   */
  async callOpenAIAPI(model, prompt, images, parameters) {
    console.log('🟢 调用OpenAI API...')

    // OpenAI DALL-E API调用逻辑
    const requestData = {
      prompt: prompt,
      n: parameters.count || 1,
      size: `${parameters.width || 1024}x${parameters.height || 1024}`,
      response_format: 'b64_json'
    }

    const response = await axios({
      method: 'POST',
      url: model.api_url,
      headers: {
        'Authorization': `Bearer ${model.api_key}`,
        'Content-Type': 'application/json'
      },
      data: requestData,
      timeout: this.timeout
    })

    console.log('✅ OpenAI API响应成功')
    return response.data
  }

  /**
   * 调用Anthropic API
   */
  async callAnthropicAPI(model, prompt, images, parameters) {
    console.log('🟣 调用Anthropic API...')

    // Anthropic API调用逻辑
    const requestData = {
      model: model.model_name,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    }

    const response = await axios({
      method: 'POST',
      url: model.api_url,
      headers: {
        'Authorization': `Bearer ${model.api_key}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      data: requestData,
      timeout: this.timeout
    })

    console.log('✅ Anthropic API响应成功')
    return response.data
  }

  /**
   * 解析AI返回的图片数据
   * @param {Object} response - AI API响应
   * @param {Object} model - 模型配置
   * @returns {Object} 解析后的结果
   */
  async parseAIResponse(response, model) {
    console.log('🔍 解析AI响应数据...')

    let images = []

    try {
      switch (model.provider) {
        case 'gemini':
        case 'google':
          images = this.parseGeminiResponse(response)
          break

        case 'openai':
          images = this.parseOpenAIResponse(response)
          break

        case 'anthropic':
          images = this.parseAnthropicResponse(response)
          break

        default:
          throw new Error(`不支持的提供商响应解析: ${model.provider}`)
      }

      console.log(`📊 解析完成: 获得 ${images.length} 张图片`)

      // 验证图片数据
      const validImages = await this.validateImages(images)

      return { images: validImages }

    } catch (error) {
      console.error('❌ AI响应解析失败:', error.message)
      throw new Error(`AI响应解析失败: ${error.message}`)
    }
  }

  /**
   * 解析Gemini响应
   */
  parseGeminiResponse(response) {
    const images = []

    if (response.candidates && response.candidates.length > 0) {
      for (const candidate of response.candidates) {
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inline_data && part.inline_data.data) {
              images.push({
                url: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`,
                width: 1024,
                height: 1024,
                metadata: {
                  generated_by: 'gemini',
                  real_ai: true,
                  extracted_from: 'base64_inline',
                  format: 'base64',
                  mime_type: part.inline_data.mime_type
                }
              })
            }
          }
        }
      }
    }

    return images
  }

  /**
   * 解析OpenAI响应
   */
  parseOpenAIResponse(response) {
    const images = []

    if (response.data && Array.isArray(response.data)) {
      for (let i = 0; i < response.data.length; i++) {
        const item = response.data[i]
        if (item.b64_json) {
          images.push({
            url: `data:image/png;base64,${item.b64_json}`,
            width: 1024,
            height: 1024,
            metadata: {
              generated_by: 'openai',
              real_ai: true,
              extracted_from: 'b64_json',
              format: 'base64',
              index: i
            }
          })
        }
      }
    }

    return images
  }

  /**
   * 解析Anthropic响应
   */
  parseAnthropicResponse(response) {
    // Anthropic主要是文本模型，这里是示例实现
    return []
  }

  /**
   * 验证图片数据
   * @param {Array} images - 图片数组
   * @returns {Array} 验证后的图片数组
   */
  async validateImages(images) {
    const validImages = []

    for (let i = 0; i < images.length; i++) {
      const image = images[i]

      try {
        // 验证base64数据
        if (image.url && image.url.startsWith('data:image/')) {
          const matches = image.url.match(/^data:image\/([^;]+);base64,(.+)$/)
          if (!matches) {
            throw new Error('base64格式验证失败')
          }

          const [, format, base64Data] = matches

          // 验证base64数据长度
          if (!base64Data || base64Data.length < 100) {
            throw new Error('base64数据过小或无效')
          }

          validImages.push({
            ...image,
            metadata: {
              ...image.metadata,
              validated: true,
              validation_time: new Date(),
              base64_length: base64Data.length,
              format: format
            }
          })

          console.log(`✅ 第${i+1}张图片验证通过: ${format}格式, ${Math.round(base64Data.length/1024)}KB`)

        } else {
          throw new Error('无效的图片URL格式')
        }

      } catch (error) {
        console.warn(`⚠️ 第${i+1}张图片验证失败: ${error.message}`)
        // 可以选择跳过无效图片或抛出错误
      }
    }

    return validImages
  }

  /**
   * 获取模型配置
   * @param {string} modelId - 模型ID
   * @returns {Object} 模型配置
   */
  async getModelConfig(modelId) {
    try {
      const db = cloud.database()
      const result = await db.collection('aimodels').doc(modelId).get()

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
   * 计算调用成本
   * @param {Object} model - 模型配置
   * @param {Object} parameters - 调用参数
   * @returns {number} 预估成本
   */
  calculateCost(model, parameters) {
    // 简化的成本计算，实际项目中应根据具体模型的计费方式
    const basePrice = model.price_per_call || 0.01
    const imageCount = parameters.count || 1
    return basePrice * imageCount
  }

  /**
   * 选择最佳模型
   * @param {Object} requirements - 需求配置
   * @returns {Object} 推荐的模型
   */
  async selectBestModel(requirements) {
    try {
      const db = cloud.database()
      const result = await db.collection('aimodels')
        .where({
          status: 'active',
          model_type: 'text-to-image'
        })
        .orderBy('priority', 'desc')
        .limit(1)
        .get()

      if (result.data && result.data.length > 0) {
        return {
          success: true,
          data: {
            selected_model: result.data[0]
          }
        }
      } else {
        throw new Error('没有可用的AI模型')
      }
    } catch (error) {
      return {
        success: false,
        message: `模型选择失败: ${error.message}`
      }
    }
  }
}

module.exports = AICaller