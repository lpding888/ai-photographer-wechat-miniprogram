/**
 * AI图像生成云函数
 * 功能：使用可配置的AI大模型生成高质量图像
 *
 * 现在支持抽屉式架构：
 * - 豆包Seedream 4.0：图像生成
 * - 混元大模型：图像分析（不用于此函数）
 * - 可配置切换：只需修改配置文件和API密钥
 *
 * @author 老王
 * @version 2.0.0 - 使用适配器架构
 */

const configLoader = require('../common/config/config-loader.js')

/**
 * 主处理函数
 */
exports.main_handler = async (event, context, callback) => {
  console.log('🚀 AI图像生成云函数启动 (v2.0 - 适配器架构)')
  console.log('📥 接收到的event:', JSON.stringify(event, null, 2))

  try {
    // 1. 参数验证
    const {
      prompt,
      modelType = 'doubao',  // 默认使用豆包
      options = {},
      sceneConfig,
      generationMode
    } = event

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('缺少必需的prompt参数，必须是非空字符串')
    }

    if (prompt.length > 1000) {
      throw new Error('提示词长度不能超过1000字符')
    }

    console.log(`🎨 开始生成图像`)
    console.log(`📝 提示词长度: ${prompt.length} 字符`)
    console.log(`🤖 使用模型: ${modelType}`)
    console.log(`🎭 生成模式: ${generationMode || 'NORMAL'}`)

    // 2. 获取适配器并生成图像
    console.log('🎨 开始生成图像...')
    const generationResult = await generateImageWithAdapter(prompt, modelType, options, sceneConfig)

    // 3. 处理生成结果
    const result = {
      images: generationResult.images,
      metadata: {
        total_images: generationResult.total_images,
        model: generationResult.model,
        adapter: generationResult.adapter,
        usage: generationResult.usage,
        generation_time: Date.now() - context.start_time
      },
      request_info: {
        prompt: prompt,
        options: options,
        sceneConfig: sceneConfig,
        generationMode: generationMode
      }
    }

    console.log('✅ AI图像生成完成')
    console.log(`🖼️ 生成图像数量: ${generationResult.total_images}`)

    const response = {
      success: true,
      data: result,
      message: 'AI图像生成成功',
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    }

    callback(null, response)

  } catch (error) {
    console.error('❌ AI图像生成失败:', error)

    const errorResponse = {
      success: false,
      error: {
        code: 'IMAGE_GENERATION_ERROR',
        message: error.message,
        type: error.constructor.name
      },
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    }

    callback(errorResponse)
  }
}

/**
 * 使用适配器生成图像
 */
async function generateImageWithAdapter(prompt, modelType, options = {}, sceneConfig) {
  try {
    console.log(`🤖 获取${modelType}适配器...`)

    // 获取适配器
    const adapter = await configLoader.getAdapter(modelType)

    // 准备生成选项
    const generationOptions = buildGenerationOptions(options, sceneConfig)

    // 执行图像生成
    const generationResult = await adapter.generateImage(prompt, generationOptions)

    if (!generationResult.success) {
      throw new Error(`图像生成失败: ${generationResult.error?.message || '未知错误'}`)
    }

    console.log(`✅ ${modelType}适配器生成完成`)
    return generationResult.data

  } catch (error) {
    console.error(`❌ ${modelType}适配器生成失败:`, error)
    throw error
  }
}

/**
 * 构建生成选项
 */
function buildGenerationOptions(options, sceneConfig) {
  const generationOptions = { ...options }

  // 根据场景配置调整参数
  if (sceneConfig) {
    // 场景特定的参数
    switch (sceneConfig.category) {
      case 'PORTRAIT':
        generationOptions.size = generationOptions.size || '2K'
        generationOptions.quality = generationOptions.quality || 'hd'
        generationOptions.maxImages = Math.min(generationOptions.maxImages || 2, 4)
        generationOptions.style = generationOptions.style || 'realistic'
        break

      case 'FASHION':
        generationOptions.size = generationOptions.size || '2K'
        generationOptions.quality = generationOptions.quality || 'hd'
        generationOptions.maxImages = Math.min(generationOptions.maxImages || 4, 6)
        generationOptions.style = generationOptions.style || 'realistic'
        generationOptions.enableSequential = generationOptions.enableSequential !== false
        break

      case 'ARTISTIC':
        generationOptions.size = generationOptions.size || '1K'
        generationOptions.quality = generationOptions.quality || 'standard'
        generationOptions.maxImages = Math.min(generationOptions.maxImages || 6, 6)
        generationOptions.enableSequential = generationOptions.enableSequential !== false
        break

      default:
        // 使用默认参数
        break
    }

    // 添加场景特定的提示词增强
    if (sceneConfig.promptEnhancement) {
      generationOptions.customParams = {
        ...generationOptions.customParams,
        prompt_suffix: sceneConfig.promptEnhancement
      }
    }
  }

  // 根据生成模式调整参数
  if (options.generationMode) {
    switch (options.generationMode) {
      case 'POSE_VARIATION':
        generationOptions.enableSequential = true
        generationOptions.maxImages = Math.min(generationOptions.maxImages || 4, 6)
        break

      case 'STYLE_TRANSFER':
        generationOptions.style = options.targetStyle || 'artistic'
        break

      case 'ENHANCEMENT':
        generationOptions.quality = 'hd'
        generationOptions.size = generationOptions.size || '2K'
        break

      default:
        break
    }
  }

  // 确保参数在有效范围内
  generationOptions.maxImages = Math.min(Math.max(generationOptions.maxImages || 1, 1), 6)
  generationOptions.size = validateSize(generationOptions.size)
  generationOptions.quality = validateQuality(generationOptions.quality)

  return generationOptions
}

/**
 * 验证图像尺寸
 */
function validateSize(size) {
  const validSizes = ['512x512', '1K', '2K', '4K']
  return validSizes.includes(size) ? size : '2K'
}

/**
 * 验证图像质量
 */
function validateQuality(quality) {
  const validQualities = ['standard', 'hd']
  return validQualities.includes(quality) ? quality : 'standard'
}

/**
 * 健康检查函数
 */
exports.health_check = async (event, context, callback) => {
  try {
    console.log('🏥 执行健康检查...')

    // 检查配置加载器
    const configLoaderHealth = await configLoader.healthCheck()

    // 测试豆包适配器
    const doubaoAdapter = await configLoader.getAdapter('doubao')
    const doubaoHealth = await doubaoAdapter.healthCheck()

    callback(null, {
      status: 'healthy',
      function: 'image-generator',
      version: '2.0.0',
      architecture: 'adapter_based',
      adapters: {
        doubao: doubaoHealth
      },
      config_loader: configLoaderHealth,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    callback(null, {
      status: 'unhealthy',
      function: 'image-generator',
      error: error.message,
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    })
  }
}