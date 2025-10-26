/**
 * AI提示词生成云函数
 * 功能：使用混元大模型分析图片并生成AI绘画提示词
 *
 * 腾讯云SCF标准架构
 * 前端 -> server-api -> BullMQ Worker -> 腾讯云SCF SDK调用 -> 混元API
 *
 * @author 老王
 * @version 3.0.0 - 腾讯云SCF标准架构
 */

const tencentcloud = require('tencentcloud-sdk-nodejs')

// 初始化腾讯云SDK
const scf = new tencentcloud.SCF({
  secretId: process.env.TENCENTCLOUD_SECRET_ID,
  secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
  region: process.env.TENCENTCLOUD_REGION || 'ap-beijing'
})

/**
 * 主处理函数
 */
exports.main_handler = async (event, context) => {
  console.log('🚀 AI提示词生成云函数启动 (v3.0 - 腾讯云SCF标准架构)')
  console.log('📥 接收到的event:', JSON.stringify(event, null, 2))
  console.log('📊 请求ID:', context.request_id)

  try {
    // 1. 参数验证
    const {
      imageUrls,
      sceneId,
      sceneConfig,
      modelConfig = {},
      generationMode = 'NORMAL',
      referenceWorkId,
      analysisOptions = {}
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
    console.log(`🔄 生成模式: ${generationMode}`)

    // 2. 分析图片内容（调用混元API）
    console.log('🔍 开始分析图片内容...')
    const imageAnalysis = await analyzeImagesWithHunyuan(imageUrls, modelConfig, analysisOptions)

    // 3. 生成基础提示词
    console.log('✍️ 生成基础提示词...')
    const basePrompt = generateBasePrompt(imageAnalysis, sceneConfig)

    // 4. 根据生成模式优化提示词
    console.log('🎛️ 根据生成模式优化提示词...')
    const optimizedPrompt = optimizePromptForMode(basePrompt, generationMode, referenceWorkId)

    // 5. 最终格式化
    const finalPrompt = formatFinalPrompt(optimizedPrompt, sceneConfig, modelConfig)

    const result = {
      prompt: finalPrompt,
      analysis: imageAnalysis,
      sceneInfo: {
        id: sceneId,
        name: sceneConfig.name,
        category: sceneConfig.category
      },
      generationMode,
      modelInfo: {
        type: 'hunyuan',
        model: modelConfig.model || 'hunyuan-vision'
      },
      processingTime: Date.now() - (context.start_time || Date.now())
    }

    console.log('✅ AI提示词生成完成')
    console.log(`📝 提示词长度: ${finalPrompt.length} 字符`)

    const response = {
      success: true,
      data: result,
      message: 'AI提示词生成成功',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      request_id: context.request_id
    }

    return response

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
      version: '3.0.0',
      request_id: context.request_id
    }

    return errorResponse
  }
}

/**
 * 使用混元API分析图片内容
 */
async function analyzeImagesWithHunyuan(imageUrls, modelConfig = {}, analysisOptions = {}) {
  try {
    console.log('🤖 调用腾讯云混元API进行图像分析...')

    // 准备混元API调用参数
    const params = {
      Model: modelConfig.model || 'hunyuan-vision',
      Messages: [
        {
          Role: 'user',
          Contents: [
            { Text: analysisOptions.prompt || getImageAnalysisPrompt() }
          ]
        }
      ],
      Temperature: analysisOptions.temperature || modelConfig.temperature || 0.3,
      TopP: analysisOptions.topP || modelConfig.topP || 0.8
    }

    // 添加图片内容
    for (const imageUrl of imageUrls) {
      // 混元API的图片格式
      params.Messages[0].Contents.push({
        ImageUrl: { Url: imageUrl }
      })
    }

    // 调用混元API
    const response = await scf.hunyunganalyzer.ChatCompletions(params)

    if (!response || !response.Response || !response.Response.Choices || response.Response.Choices.length === 0) {
      throw new Error('混元API返回格式异常')
    }

    const analysisText = response.Response.Choices[0].Message.Content
    console.log('🤖 混元API分析结果长度:', analysisText.length)

    // 解析分析结果
    const analysisResult = parseAnalysisResult(analysisText)

    return analysisResult

  } catch (error) {
    console.error('❌ 混元API调用失败:', error)

    // 如果API调用失败，返回基础分析
    return createFallbackAnalysis(`混元API调用失败: ${error.message}`)
  }
}

/**
 * 获取图像分析提示词
 */
function getImageAnalysisPrompt() {
  return `请详细分析这些图片中的人物特征、服装信息、姿势动作和整体风格。请用JSON格式返回分析结果，包含以下字段：

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
}

/**
 * 解析分析结果
 */
function parseAnalysisResult(analysisText) {
  try {
    // 尝试从文本中提取JSON
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        person: parsed.person || {},
        clothing: parsed.clothing || {},
        pose: parsed.pose || {},
        style: parsed.style || {},
        rawAnalysis: analysisText
      }
    }

    // 如果JSON解析失败，返回基础分析
    return createFallbackAnalysis('JSON解析失败，返回基础分析')

  } catch (error) {
    console.error('解析分析结果失败:', error)
    return createFallbackAnalysis('解析失败: ' + error.message)
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
    rawAnalysis: reason
  }
}

/**
 * 生成基础提示词
 */
function generateBasePrompt(imageAnalysis, sceneConfig) {
  const { person, clothing, pose, style } = imageAnalysis
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

  // 4. 场景描述
  prompt += buildSceneDescription(sceneConfig)

  // 5. 技术参数
  prompt += buildTechnicalParameters()

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

  if (person.expression && person.expression !== '未知') {
    description += `，${person.expression}表情`
  }

  return description ? description + "，" : "人物，"
}

/**
 * 构建服装描述
 */
function buildClothingDescription(clothing) {
  let description = ""

  if (clothing.color && clothing.color !== '未知') {
    description += `穿着${clothing.color}色`
  }

  if (clothing.type && clothing.type !== '未知') {
    description += `${clothing.type}`
  }

  if (clothing.style && clothing.style !== '未知') {
    description += `，${clothing.style}风格`
  }

  return description ? description + "，" : "穿着服装，"
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

  return description ? description + "，" : "站立姿势，"
}

/**
 * 构建场景描述
 */
function buildSceneDescription(sceneConfig) {
  let description = ""

  if (sceneConfig.description) {
    description += `在${sceneConfig.description}中，`
  }

  if (sceneConfig.atmosphere) {
    description += `${sceneConfig.atmosphere}氛围，`
  }

  return description ? description + "。" : "在现代环境中。"
}

/**
 * 构建技术参数
 */
function buildTechnicalParameters() {
  return "专业摄影级别画质，8K超高分辨率，极致精细细节，电影级渲染效果，色彩真实自然。"
}

/**
 * 根据生成模式优化提示词
 */
function optimizePromptForMode(basePrompt, generationMode, referenceWorkId) {
  let optimizedPrompt = basePrompt

  switch (generationMode) {
    case 'POSE_VARIATION':
      optimizedPrompt += "【姿势裂变要求】保持人物面部特征和服装不变，重点改变身体姿势和动作角度。"
      break
    case 'STYLE_TRANSFER':
      optimizedPrompt += "【风格迁移要求】保持人物和服装的基本特征，重点改变艺术风格。"
      break
    case 'ENHANCEMENT':
      optimizedPrompt += "【图像增强要求】全面提升图像质量，增强细节清晰度和光影效果。"
      break
  }

  if (referenceWorkId) {
    optimizedPrompt += `参考作品ID：${referenceWorkId}，在保持核心特征相似的前提下重新演绎。`
  }

  return optimizedPrompt
}

/**
 * 格式化最终提示词
 */
function formatFinalPrompt(prompt, sceneConfig, modelConfig) {
  let finalPrompt = prompt

  finalPrompt += "【技术参数】图像质量：超高清，8K分辨率，细节程度：极致精细，光影效果：专业摄影布光。"

  if (modelConfig) {
    finalPrompt += `【模特参数】`
    if (modelConfig.height) finalPrompt += `身高：${modelConfig.height}cm，`
    if (modelConfig.weight) finalPrompt += `体重：${modelConfig.weight}kg，`
    finalPrompt += "体型：标准。"
  }

  finalPrompt += "【渲染要求】渲染引擎：专业级渲染，后处理：专业调色，输出格式：AI绘画标准格式。"

  return finalPrompt
}

/**
 * 健康检查函数
 */
exports.health_check = async (event, context, callback) => {
  try {
    console.log('🏥 执行健康检查...')

    // 检查环境变量
    const envStatus = {
      secretId: !!process.env.TENCENTCLOUD_SECRET_ID,
      secretKey: !!process.env.TENCENTCLOUD_SECRET_KEY,
      region: process.env.TENCENTCLOUD_REGION || 'ap-beijing'
    }

    return {
      status: 'healthy',
      function: 'prompt-generator',
      version: '3.0.0',
      architecture: 'tencent_cloud_scf',
      environment: envStatus,
      timestamp: new Date().toISOString(),
      request_id: context.request_id
    }

  } catch (error) {
    return {
      status: 'unhealthy',
      function: 'prompt-generator',
      error: error.message,
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      request_id: context.request_id
    }
  }
}