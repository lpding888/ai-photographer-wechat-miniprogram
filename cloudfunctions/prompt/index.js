// 提示词管理云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action } = event
  
  try {
    switch (action) {
      case 'generatePrompt':
        return await generatePrompt(event)
      case 'getTemplates':
        return await getTemplates(event)
      case 'updateTemplate':
        return await updateTemplate(event)
      case 'deleteTemplate':
        return await deleteTemplate(event, context)
      case 'addTemplate':
        return await addTemplate(event, context)
      default:
        return {
          success: false,
          message: '未知操作类型'
        }
    }
  } catch (error) {
    console.error('提示词函数执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器内部错误'
    }
  }
}

/**
 * 生成AI提示词
 * @param {Object} event - 事件参数
 * @param {string} event.type - 类型: 'photography' | 'fitting'
 * @param {string} event.category - 分类: 可选，进一步细分类型
 * @param {Object} event.parameters - 用户参数
 * @param {Object} event.sceneInfo - 场景信息
 */
async function generatePrompt(event) {
  try {
    const { type, category, parameters = {}, sceneInfo = {}, mode, pose_description } = event

    console.log('🔍 提示词生成开始')
    console.log('🔍 请求参数:', JSON.stringify(event, null, 2))
    console.log('🔍 用户参数:', JSON.stringify(parameters, null, 2))
    console.log('🔍 场景信息:', JSON.stringify(sceneInfo, null, 2))
    console.log('🔍 模式:', mode)

    if (!type || !['photography', 'fitting'].includes(type)) {
      return {
        success: false,
        message: '提示词类型参数无效'
      }
    }

    // 🎭 姿势裂变模式：使用特殊提示词
    if (mode === 'pose_variation' && pose_description) {
      console.log('🎭 姿势裂变模式，生成特殊提示词')
      const poseVariationPrompt = generatePoseVariationPrompt(pose_description, sceneInfo, parameters)
      return {
        success: true,
        data: {
          prompt: poseVariationPrompt,
          template_id: 'pose_variation_builtin',
          template_category: 'pose_variation'
        },
        message: '姿势裂变提示词生成成功'
      }
    }

    // 1. 构建查询条件
    let query = {
      type: type,
      is_active: true
    }

    // 如果指定了分类，添加分类筛选
    if (category) {
      query.category = category
    }
    
    console.log('🔍 数据库查询条件:', query)
    
    // 2. 获取对应类型的提示词模板
    const templatesRes = await db.collection('prompt_templates')
      .where(query)
      .orderBy('priority', 'desc')
      .limit(1)
      .get()
    
    console.log('🔍 数据库查询结果:', templatesRes.data.length, '个模板')
    
    if (!templatesRes.data || templatesRes.data.length === 0) {
      console.warn('⚠️ 未找到可用的提示词模板')
      return {
        success: false,
        message: '未找到可用的提示词模板'
      }
    }
    
    const template = templatesRes.data[0]
    console.log('🔍 选择的模板:', template.name, 'ID:', template._id)
    console.log('🔍 模板原始内容预览:', template.template.substring(0, 200) + '...')
    
    // 2. 替换模板变量生成最终提示词
    const finalPrompt = replaceTemplateVariables(
      template.template,
      parameters,
      sceneInfo,
      template.default_params
    )
    
    console.log('🔍 最终提示词长度:', finalPrompt.length)
    console.log('🔍 最终提示词预览:', finalPrompt.substring(0, 200) + '...')
    
    // 3. 记录提示词生成日志
    await logPromptGeneration(type, parameters, finalPrompt)
    
    return {
      success: true,
      data: {
        prompt: finalPrompt,
        template_id: template._id,
        template_category: template.category
      },
      message: '提示词生成成功'
    }
    
  } catch (error) {
    console.error('生成提示词失败:', error)
    return {
      success: false,
      message: '生成提示词失败'
    }
  }
}

/**
 * 获取提示词模板列表
 */
async function getTemplates(event) {
  try {
    const { type, category } = event
    
    let query = { is_active: true }
    
    if (type) {
      query.type = type
    }
    
    if (category) {
      query.category = category
    }
    
    const result = await db.collection('prompt_templates')
      .where(query)
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'desc')
      .get()
    
    return {
      success: true,
      data: result.data,
      message: '获取模板列表成功'
    }
    
  } catch (error) {
    console.error('获取模板列表失败:', error)
    return {
      success: false,
      message: '获取模板列表失败'
    }
  }
}

/**
 * 添加新提示词模板（管理员功能）
 */
async function addTemplate(event, context) {
  try {
    const { OPENID } = cloud.getWXContext()
    const { template_data } = event
    
    // 临时硬编码管理员权限检查（快速解决方案）
    const hardcodedAdmins = ['oPCV81-CA12dIHv4KrUHcel-F02c']
    const envAdminUsers = process.env.ADMIN_USERS
    const adminUsers = envAdminUsers ? envAdminUsers.split(',') : hardcodedAdmins
    
    console.log('🔍 权限检查 - 当前用户:', OPENID)
    console.log('🔍 权限检查 - 管理员列表:', adminUsers)
    console.log('🔍 权限检查 - 是否有权限:', adminUsers.includes(OPENID))
    
    if (!adminUsers.includes(OPENID)) {
      return {
        success: false,
        message: `权限不足，仅管理员可添加模板。当前用户: ${OPENID}`
      }
    }
    
    if (!template_data) {
      return {
        success: false,
        message: '模板数据不能为空'
      }
    }
    
    // 验证必需字段
    const requiredFields = ['type', 'category', 'template']
    for (const field of requiredFields) {
      if (!template_data[field]) {
        return {
          success: false,
          message: `缺少必需字段: ${field}`
        }
      }
    }
    
    // 添加默认值
    const newTemplate = {
      ...template_data,
      variables: template_data.variables || [],
      default_params: template_data.default_params || {},
      is_active: template_data.is_active !== undefined ? template_data.is_active : true,
      priority: template_data.priority || 1,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: OPENID
    }
    
    const result = await db.collection('prompt_templates').add({
      data: newTemplate
    })
    
    return {
      success: true,
      data: { template_id: result._id },
      message: '提示词模板添加成功'
    }
    
  } catch (error) {
    console.error('添加提示词模板失败:', error)
    return {
      success: false,
      message: '添加提示词模板失败'
    }
  }
}

/**
 * 删除提示词模板（管理员功能）
 */
async function deleteTemplate(event, context) {
  try {
    const { OPENID } = cloud.getWXContext()
    const { template_id } = event
    
    // 临时硬编码管理员权限检查（快速解决方案）
    const hardcodedAdmins = ['oPCV81-CA12dIHv4KrUHcel-F02c']
    const envAdminUsers = process.env.ADMIN_USERS
    const adminUsers = envAdminUsers ? envAdminUsers.split(',') : hardcodedAdmins
    
    if (!adminUsers.includes(OPENID)) {
      return {
        success: false,
        message: `权限不足，仅管理员可删除模板。当前用户: ${OPENID}`
      }
    }
    
    if (!template_id) {
      return {
        success: false,
        message: '模板ID不能为空'
      }
    }
    
    const result = await db.collection('prompt_templates')
      .doc(template_id)
      .remove()
    
    return {
      success: true,
      data: result,
      message: '提示词模板删除成功'
    }
    
  } catch (error) {
    console.error('删除提示词模板失败:', error)
    return {
      success: false,
      message: '删除提示词模板失败'
    }
  }
}

/**
 * 更新提示词模板（管理员功能）
 */
async function updateTemplate(event) {
  try {
    const { templateId, updates } = event
    const { OPENID } = cloud.getWXContext()
    
    if (!templateId || !updates) {
      return {
        success: false,
        message: '参数不完整'
      }
    }
    
    // 临时硬编码管理员权限检查（快速解决方案）
    const hardcodedAdmins = ['oPCV81-CA12dIHv4KrUHcel-F02c']
    const envAdminUsers = process.env.ADMIN_USERS
    const adminUsers = envAdminUsers ? envAdminUsers.split(',') : hardcodedAdmins
    
    if (!adminUsers.includes(OPENID)) {
      return {
        success: false,
        message: `权限不足。当前用户: ${OPENID}`
      }
    }
    
    const updateData = {
      ...updates,
      updated_at: new Date()
    }
    
    const result = await db.collection('prompt_templates')
      .doc(templateId)
      .update({
        data: updateData
      })
    
    return {
      success: true,
      data: result,
      message: '模板更新成功'
    }
    
  } catch (error) {
    console.error('更新模板失败:', error)
    return {
      success: false,
      message: '更新模板失败'
    }
  }
}

/**
 * 替换模板变量
 * @param {string} template - 模板字符串
 * @param {Object} parameters - 用户参数
 * @param {Object} sceneInfo - 场景信息
 * @param {Object} defaultParams - 默认参数
 */
function replaceTemplateVariables(template, parameters, sceneInfo, defaultParams = {}) {
  let result = template
  
  // 合并参数，优先级：用户参数 > 默认参数
  const allParams = { ...defaultParams, ...parameters }
  
  console.log('🔧 替换模板变量开始')
  console.log('🔧 原始模板长度:', template.length)
  console.log('🔧 用户参数:', JSON.stringify(parameters, null, 2))
  console.log('🔧 场景信息:', JSON.stringify(sceneInfo, null, 2))
  console.log('🔧 默认参数:', JSON.stringify(defaultParams, null, 2))
  console.log('🔧 合并后参数:', JSON.stringify(allParams, null, 2))
  
  // 1. 处理单花括号变量替换 {variable}
  let replacementCount = 0
  result = result.replace(/\{([^}]+)\}/g, (match, variable) => {
    // 检查是否有默认值 {variable|default}
    const [varName, defaultValue] = variable.split('|').map(s => s.trim())
    
    // 检查是否是场景变量 {scene.property}
    if (varName.startsWith('scene.')) {
      const sceneProp = varName.replace('scene.', '')
      const value = sceneInfo[sceneProp] || defaultValue || ''
      console.log(`🔄 替换场景变量 ${varName}: "${value}"`)
      replacementCount++
      return value
    }
    
    // 处理特殊的场景变量映射
    if (varName === 'location') {
      const location = allParams.location || sceneInfo.name || sceneInfo.description || defaultValue || ''
      console.log(`🔄 替换地点变量: "${location}"`)
      replacementCount++
      return location
    }
    
    // 普通变量替换
    const value = allParams[varName] || defaultValue || ''
    console.log(`🔄 替换变量 ${varName}: "${value}" (源: ${allParams[varName] ? '用户参数' : defaultValue ? '默认值' : '空值'})`)
    replacementCount++
    return value
  })
  
  console.log(`🔄 单花括号替换完成，共替换 ${replacementCount} 个变量`)
  
  // 2. 处理双花括号变量替换 {{variable}}（兼容）
  let doubleReplacementCount = 0
  result = result.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
    const [varName, defaultValue] = variable.split('|').map(s => s.trim())
    
    if (varName.startsWith('scene.')) {
      const sceneProp = varName.replace('scene.', '')
      const value = sceneInfo[sceneProp] || defaultValue || ''
      console.log(`🔄 替换双花括号场景变量 ${varName}: "${value}"`)
      doubleReplacementCount++
      return value
    }
    
    const value = allParams[varName] || defaultValue || ''
    console.log(`🔄 替换双花括号变量 ${varName}: "${value}"`)
    doubleReplacementCount++
    return value
  })
  
  console.log(`🔄 双花括号替换完成，共替换 ${doubleReplacementCount} 个变量`)
  
  // 3. 处理条件语句 {{#if condition}}content{{/if}}
  result = result.replace(/\{\{#if\s+([^}]+)\}\}([^{]*)\{\{\/if\}\}/g, (match, condition, content) => {
    const conditionValue = getConditionValue(condition, allParams, sceneInfo)
    console.log(`🔄 条件语句 ${condition}: ${conditionValue ? '满足' : '不满足'}`)
    return conditionValue ? content : ''
  })
  
  // 4. 清理多余的空格和换行
  result = result.replace(/\s+/g, ' ').trim()
  
  console.log('🔧 替换模板变量完成')
  console.log('🔧 最终结果长度:', result.length)
  console.log('🔧 最终结果预览:', result.substring(0, 300) + '...')
  
  return result
}

/**
 * 获取条件值
 */
function getConditionValue(condition, parameters, sceneInfo) {
  const conditionKey = condition.trim()
  
  // 检查场景条件
  if (conditionKey.startsWith('scene.')) {
    const sceneProp = conditionKey.replace('scene.', '')
    return !!(sceneInfo[sceneProp])
  }
  
  // 检查参数条件
  return !!(parameters[conditionKey])
}

/**
 * 记录提示词生成日志
 */
async function logPromptGeneration(type, parameters, prompt) {
  try {
    const { OPENID } = cloud.getWXContext()
    
    await db.collection('logs').add({
      data: {
        user_openid: OPENID,
        action: 'prompt_generation',
        data: {
          type,
          parameters,
          prompt: prompt.substring(0, 500), // 截取前500字符
          prompt_length: prompt.length
        },
        created_at: new Date()
      }
    })
  } catch (error) {
    console.warn('记录提示词生成日志失败:', error)
  }
}

/**
 * 服装摄影专用提示词生成
 */
function generatePhotographyPrompt(parameters, sceneInfo) {
  const {
    gender = 'female',
    age = 25,
    nationality = 'asian',
    skin_tone = 'medium',
    clothing_description = 'fashionable outfit',
    pose_type = 'dynamic',
    lighting_style = 'professional studio lighting',
    clothing_material = '',
    outfit_description = '',
    accessories_style = '',
    mood_and_atmosphere = '',
    height = '',
    body_type = ''
  } = parameters
  
  let prompt = `A professional fashion photography of ${gender} model`
  
  if (age) prompt += `, age ${age}`
  if (nationality) prompt += `, ${nationality} ethnicity`
  if (skin_tone) prompt += `, ${skin_tone} skin tone`
  if (height) prompt += `, height ${height}`
  if (body_type) prompt += `, ${body_type} body type`
  
  prompt += `, wearing ${clothing_description}`
  
  if (clothing_material) prompt += ` made of ${clothing_material}`
  if (outfit_description) prompt += `, ${outfit_description}`
  if (accessories_style) prompt += `, ${accessories_style} accessories`
  
  if (sceneInfo.name) prompt += `, in ${sceneInfo.name} setting`
  if (sceneInfo.background) prompt += ` with ${sceneInfo.background} background`
  
  prompt += `, ${pose_type} pose, ${lighting_style}`
  
  if (mood_and_atmosphere) prompt += `, ${mood_and_atmosphere} atmosphere`
  
  prompt += ', high fashion, editorial style, 8K resolution, sharp focus, professional photography'
  
  return prompt
}

/**
 * 虚拟试衣专用提示词生成
 */
function generateFittingPrompt(parameters, sceneInfo) {
  const {
    clothing_type = 'outfit',
    model_description = 'person',
    fit_style = 'natural',
    clothing_description = ''
  } = parameters

  let prompt = `Virtual try-on of ${clothing_type}`

  if (clothing_description) prompt += ` (${clothing_description})`

  prompt += ` on ${model_description}`

  if (sceneInfo.background) prompt += ` with ${sceneInfo.background} background`
  if (sceneInfo.lighting) prompt += `, ${sceneInfo.lighting} lighting`

  prompt += `, realistic fit and draping, ${fit_style} style, high quality rendering, photorealistic result`

  return prompt
}

/**
 * 🎭 姿势裂变专用提示词生成
 * @param {string} poseDescription - 姿势描述
 * @param {Object} sceneInfo - 场景信息
 * @param {Object} parameters - 用户参数（用于获取location）
 */
function generatePoseVariationPrompt(poseDescription, sceneInfo = {}, parameters = {}) {
  console.log('🎭 生成姿势裂变提示词')
  console.log('🎭 姿势描述:', poseDescription)
  console.log('🎭 场景信息:', sceneInfo)
  console.log('🎭 参数信息:', parameters)

  // 拍摄地点
  let locationText = sceneInfo.name || parameters.location || ''

  // 用户动作
  let actionText = poseDescription || ''

  // 构建提示词（完全按照用户原文 + 明确要求生成图片）
  let prompt = `保持图片的主体不变，如果用户输入动作为空 你就以服装摄影师的身份设计出下一个展示服装的动作和角度  如果用户有输入动作，严格按照用户输入的动作指导继续拍摄  拍摄地点是${locationText} 用户输入动作${actionText}  输出图片输出给用户，作为摄影师想说什么就说什么吧`

  console.log('🎭 生成的提示词:', prompt)

  return prompt
}