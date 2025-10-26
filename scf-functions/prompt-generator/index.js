/**
 * AI提示词生成云函数
 * 功能：使用可配置的AI大模型分析图片并生成AI绘画提示词
 *
 * 现在支持抽屉式架构：
 * - 混元大模型：图像分析
 * - 豆包大模型：图像生成（不用于此函数）
 * - 可配置切换：只需修改配置文件和API密钥
 *
 * @author 老王
 * @version 2.0.0 - 使用适配器架构
 */

const configLoader = require('../common/config/config-loader.js')

// 场景提示词模板
const SCENE_TEMPLATES = {
  URBAN: {
    base: '现代都市环境，高楼大厦，街道景观',
    lighting: '自然城市光线，现代照明',
    atmosphere: '时尚、现代、都市感',
    style: '写实摄影风格，高清细节'
  },
  NATURE: {
    base: '自然环境，山水风光，花草树木',
    lighting: '自然日光，柔和光线',
    atmosphere: '自然、清新、和谐',
    style: '自然摄影，色彩鲜艳'
  },
  INDOOR: {
    base: '室内环境，温馨家居，现代装饰',
    lighting: '温暖室内灯光，自然光透入',
    atmosphere: '舒适、温馨、居家感',
    style: '室内摄影，生活化场景'
  },
  LIFESTYLE: {
    base: '生活场景，日常环境，休闲氛围',
    lighting: '柔和自然光线',
    atmosphere: '轻松、自然、生活化',
    style: '生活摄影，真实感'
  },
  COMMERCIAL: {
    base: '商业环境，专业空间，现代办公',
    lighting: '专业照明，明亮均匀',
    atmosphere: '专业、自信、现代',
    style: '商业摄影，专业形象'
  },
  ARTISTIC: {
    base: '艺术环境，画廊空间，创意氛围',
    lighting: '艺术照明，突出氛围',
    atmosphere: '艺术、高雅、文化',
    style: '艺术摄影，创意构图'
  },
  SEASONAL: {
    base: '季节特色，自然变化，时令元素',
    lighting: '季节性光线特色',
    atmosphere: '季节感，时令氛围',
    style: '季节摄影，色彩丰富'
  }
}

/**
 * 主处理函数
 */
exports.main_handler = async (event, context, callback) => {
  console.log('🚀 AI提示词生成云函数启动 (v2.0 - 适配器架构)')
  console.log('📥 接收到的event:', JSON.stringify(event, null, 2))

  try {
    // 1. 参数验证
    const {
      imageUrls,
      sceneId,
      sceneConfig,
      modelConfig,
      generationMode,
      referenceWorkId,
      modelType = 'hunyuan',  // 默认使用混元
      analysisOptions = {}   // 分析选项
    } = event

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw new Error('缺少必需的imageUrls参数，必须是非空数组')
    }

    if (imageUrls.length > 5) {
      throw new Error('最多支持同时分析5张图片')
    }

    if (!sceneConfig) {
      throw new Error('缺少必需的sceneConfig参数')
    }

    console.log(`🎨 开始生成提示词，图片数量: ${imageUrls.length}`)
    console.log(`🎭 场景信息: ${sceneConfig.name} (${sceneConfig.category})`)
    console.log(`🤖 使用模型: ${modelType}`)
    console.log(`🔄 生成模式: ${generationMode || 'NORMAL'}`)

    // 2. 获取场景模板
    const sceneTemplate = SCENE_TEMPLATES[sceneConfig.category] || SCENE_TEMPLATES.LIFESTYLE

    // 3. 分析图片内容
    console.log('🔍 开始分析图片内容...')
    const imageAnalysis = await analyzeImagesWithAdapter(imageUrls, modelType, modelConfig, analysisOptions)

    // 4. 生成基础提示词
    console.log('✍️ 生成基础提示词...')
    const basePrompt = generateBasePrompt(imageAnalysis, sceneTemplate, sceneConfig)

    // 5. 根据生成模式优化提示词
    console.log('🎛️ 根据生成模式优化提示词...')
    const optimizedPrompt = optimizePromptForMode(basePrompt, generationMode, referenceWorkId)

    // 6. 最终格式化
    const finalPrompt = formatFinalPrompt(optimizedPrompt, sceneConfig, modelConfig)

    const result = {
      prompt: finalPrompt,
      analysis: imageAnalysis,
      sceneInfo: {
        id: sceneId,
        name: sceneConfig.name,
        category: sceneConfig.category,
        template: sceneTemplate
      },
      generationMode,
      modelInfo: {
        type: modelType,
        adapter: imageAnalysis.adapter || 'unknown'
      },
      processingTime: Date.now() - context.start_time
    }

    console.log('✅ AI提示词生成完成')
    console.log(`📝 提示词长度: ${finalPrompt.length} 字符`)

    const response = {
      success: true,
      data: result,
      message: 'AI提示词生成成功',
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    }

    callback(null, response)

  } catch (error) {
    console.error('❌ AI提示词生成失败:', error)

    const errorResponse = {
      success: false,
      error: {
        code: 'PROMPT_GENERATION_ERROR',
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
 * 使用适配器分析图片内容
 */
async function analyzeImagesWithAdapter(imageUrls, modelType, modelConfig = {}, analysisOptions = {}) {
  try {
    console.log(`🤖 获取${modelType}适配器...`)

    // 获取适配器
    const adapter = await configLoader.getAdapter(modelType)

    // 混元分析提示词 - 专注于图像分析
    const analysisPrompt = analysisOptions.prompt || `请详细分析这些图片中的人物特征、服装信息、姿势动作和整体风格。请用JSON格式返回分析结果，包含以下字段：

1. person（人物特征）：
   - age: 年龄范围
   - gender: 性别
   - hair: 发型特征
   - bodyType: 身材描述
   - expression: 面部表情
   - other_features: 其他特征

2. clothing（服装信息）：
   - type: 服装类型
   - color: 主要颜色
   - style: 服装风格
   - material: 材质描述
   - details: 细节特征
   - accessories: 配饰信息

3. pose（姿势动作）：
   - posture: 身体姿态
   - action: 具体动作
   - angle: 拍摄角度
   - hand_position: 手部位置

4. style（风格特征）：
   - overall: 整体风格
   - mood: 氛围感觉
   - scene_type: 场景类型
   - lighting: 光线条件
   - background: 背景描述

请确保JSON格式正确，如果某些信息无法确定，请使用"未知"。`

    // 准备分析选项
    const finalAnalysisOptions = {
      temperature: analysisOptions.temperature || modelConfig.temperature || 0.3,
      maxTokens: analysisOptions.maxTokens || modelConfig.maxTokens || 2000,
      basePrompt: analysisPrompt,
      ...analysisOptions
    }

    // 执行图像分析
    const analysisResult = await adapter.analyzeImages(imageUrls, finalAnalysisOptions)

    if (!analysisResult.success) {
      throw new Error(`图像分析失败: ${analysisResult.error?.message || '未知错误'}`)
    }

    console.log(`✅ ${modelType}适配器分析完成`)
    return analysisResult.data

  } catch (error) {
    console.error(`❌ ${modelType}适配器分析失败:`, error)

    // 如果适配器调用失败，返回基础分析
    return createFallbackAnalysis(`${modelType}分析失败: ${error.message}`)
  }
}

/**
 * 创建备用分析结果
 */
function createFallbackAnalysis(reason) {
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
    fallbackReason: reason,
    adapter: 'fallback',
    model: 'fallback'
  }
}

/**
 * 生成基础提示词 - 根据混元分析结果生成适合豆包的提示词
 */
function generateBasePrompt(imageAnalysis, sceneTemplate, sceneConfig) {
  const { person, clothing, pose, style } = imageAnalysis

  // 构建适合豆包图像生成的提示词
  let prompt = ""

  // 1. 人物描述
  if (person) {
    prompt += buildPersonDescription(person)
  }

  // 2. 服装描述
  if (clothing) {
    prompt += buildClothingDescription(clothing)
  }

  // 3. 姿势和构图
  if (pose) {
    prompt += buildPoseDescription(pose)
  }

  // 4. 场景和环境
  prompt += buildSceneDescription(sceneTemplate, style)

  // 5. 技术参数
  prompt += buildTechnicalParameters(sceneConfig)

  // 6. 风格和质量要求
  prompt += buildStyleRequirements(sceneConfig, style)

  return prompt
}

/**
 * 构建人物描述
 */
function buildPersonDescription(person) {
  let description = ""

  if (person.age && person.age !== '未知') {
    description += `${person.age}岁`
  }

  if (person.gender && person.gender !== '未知') {
    description += `${person.gender}`
  }

  if (person.hair && person.hair !== '未知') {
    description += `，${person.hair}`
  }

  if (person.bodyType && person.bodyType !== '未知') {
    description += `，${person.bodyType}身材`
  }

  if (person.expression && person.expression !== '未知') {
    description += `，${person.expression}表情`
  }

  if (description) {
    return description + "，"
  }

  return "人物，"
}

/**
 * 构建服装描述
 */
function buildClothingDescription(clothing) {
  let description = ""

  if (clothing.color && clothing.color !== '未知') {
    description += `穿着${clothing.color}色`
  }

  if (clothing.style && clothing.style !== '未知') {
    description += `${clothing.style}风格的`
  }

  if (clothing.type && clothing.type !== '未知') {
    description += `${clothing.type}`
  }

  if (clothing.material && clothing.material !== '未知') {
    description += `，${clothing.material}材质`
  }

  if (clothing.details && clothing.details !== '未知') {
    description += `，${clothing.details}`
  }

  if (description) {
    return description + "，"
  }

  return "穿着服装，"
}

/**
 * 构建姿势描述
 */
function buildPoseDescription(pose) {
  let description = ""

  if (pose.posture && pose.posture !== '未知') {
    description += `${pose.posture}`
  }

  if (pose.action && pose.action !== '未知') {
    description += `，${pose.action}`
  }

  if (pose.angle && pose.angle !== '未知') {
    description += `，${pose.angle}视角`
  }

  if (description) {
    return description + "，"
  }

  return "站立姿势，"
}

/**
 * 构建场景描述
 */
function buildSceneDescription(sceneTemplate, style) {
  let description = "在"

  // 场景基础描述
  if (sceneTemplate.base) {
    description += sceneTemplate.base
  } else {
    description += "现代环境中"
  }

  // 光线描述
  if (sceneTemplate.lighting) {
    description += `，${sceneTemplate.lighting}`
  }

  // 整体氛围
  if (sceneTemplate.atmosphere) {
    description += `，${sceneTemplate.atmosphere}`
  }

  // 风格特征
  if (style && style.overall && style.overall !== '未知') {
    description += `，${style.overall}风格`
  }

  if (style && style.lighting && style.lighting !== '未知') {
    description += `，${style.lighting}`
  }

  return description + "。"
}

/**
 * 构建技术参数
 */
function buildTechnicalParameters(sceneConfig) {
  let description = "专业摄影级别画质，"

  // 质量要求
  description += "8K超高分辨率，"

  // 细节要求
  description += "极致精细细节，"

  // 渲染要求
  description += "电影级渲染效果，"

  // 色彩要求
  description += "色彩真实自然，"

  return description
}

/**
 * 构建风格要求
 */
function buildStyleRequirements(sceneConfig, style) {
  let description = ""

  // 艺术风格
  if (style && style.mood && style.mood !== '未知') {
    description += `${style.mood}氛围，`
  }

  // 专业要求
  description += "专业摄影构图，"
  description += "完美光影效果，"
  description += "高级质感呈现，"
  description += "艺术审美标准。"

  // 自定义场景要求
  if (sceneConfig.promptTemplate) {
    description += ` ${sceneConfig.promptTemplate}`
  }

  return description
}

/**
 * 根据生成模式优化提示词
 */
function optimizePromptForMode(basePrompt, generationMode, referenceWorkId) {
  let optimizedPrompt = basePrompt

  switch (generationMode) {
    case 'POSE_VARIATION':
      // 姿势裂变模式：强调姿势变化
      optimizedPrompt += `【姿势裂变要求】\n`
      optimizedPrompt += `保持人物面部特征和服装不变，重点改变身体姿势和动作角度，`
      optimizedPrompt += `生成多种不同的姿势：站立、坐姿、行走、转身等，`
      optimizedPrompt += `每个姿势都要自然流畅，符合人体工学。\n\n`
      break

    case 'STYLE_TRANSFER':
      // 风格迁移模式：强调风格变化
      optimizedPrompt += `【风格迁移要求】\n`
      optimizedPrompt += `保持人物和服装的基本特征，重点改变艺术风格，`
      optimizedPrompt += `可以尝试油画、水彩、素描、卡通、赛博朋克等不同风格，`
      optimizedPrompt += `每种风格都要突出其艺术特点和视觉冲击力。\n\n`
      break

    case 'ENHANCEMENT':
      // 图像增强模式：强调质量提升
      optimizedPrompt += `【图像增强要求】\n`
      optimizedPrompt += `在保持原有特征的基础上，全面提升图像质量，`
      optimizedPrompt += `增强细节清晰度、色彩饱和度、光影效果，`
      optimizedPrompt += `确保皮肤质感、服装纹理、背景细节都更加精细真实。\n\n`
      break

    default:
      // 正常模式：保持原样
      break
  }

  // 如果有参考作品，添加参考说明
  if (referenceWorkId) {
    optimizedPrompt += `【参考作品】\n`
    optimizedPrompt += `参考作品ID：${referenceWorkId}，`
    optimizedPrompt += `在保持核心特征相似的前提下，创造性地重新演绎。\n\n`
  }

  return optimizedPrompt
}

/**
 * 格式化最终提示词
 */
function formatFinalPrompt(prompt, sceneConfig, modelConfig) {
  let finalPrompt = prompt

  // 添加技术参数
  finalPrompt += `【技术参数】\n`
  finalPrompt += `图像质量：超高清，8K分辨率，\n`
  finalPrompt += `细节程度：极致精细，毛孔级细节，\n`
  finalPrompt += `光影效果：专业摄影布光，立体感强，\n`
  finalPrompt += `色彩还原：真实自然，色彩饱和度适中，\n`

  // 添加模特参数
  if (modelConfig) {
    finalPrompt += `【模特参数】\n`
    if (modelConfig.height) {
      finalPrompt += `身高：${modelConfig.height}cm，`
    }
    if (modelConfig.weight) {
      finalPrompt += `体重：${modelConfig.weight}kg，`
    }
    if (modelConfig.bodyType) {
      finalPrompt += `体型：${modelConfig.bodyType}，`
    }
    if (modelConfig.skinTone) {
      finalPrompt += `肤色：${modelConfig.skinTone}，`
    }
    finalPrompt += '\n'
  }

  // 添加风格和渲染要求
  finalPrompt += `【渲染要求】\n`
  finalPrompt += `渲染引擎：虚幻引擎5级别渲染，\n`
  finalPrompt += `后处理：专业级调色，增加电影感，\n`
  finalPrompt += `输出格式：适合AI绘画的标准格式，\n`
  finalPrompt += `一致性：确保多张图片风格统一。\n`

  return finalPrompt
}

/**
 * 健康检查函数
 */
exports.health_check = async (event, context, callback) => {
  try {
    console.log('🏥 执行健康检查...')

    // 检查配置加载器
    const configLoaderHealth = await configLoader.healthCheck()

    // 测试混元适配器
    const hunyuanAdapter = await configLoader.getAdapter('hunyuan')
    const hunyuanHealth = await hunyuanAdapter.healthCheck()

    callback(null, {
      status: 'healthy',
      function: 'prompt-generator',
      version: '2.0.0',
      architecture: 'adapter_based',
      adapters: {
        hunyuan: hunyuanHealth
      },
      config_loader: configLoaderHealth,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    callback(null, {
      status: 'unhealthy',
      function: 'prompt-generator',
      error: error.message,
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    })
  }
}