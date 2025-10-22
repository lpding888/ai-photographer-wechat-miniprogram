// 数据库场景数据检查和修复工具
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 数据库数据检查和修复云函数
 * 支持场景、AI模型、提示词模板的统一检查
 */
exports.main = async (event, context) => {
  const { action, collection } = event

  try {
    switch (action) {
      case 'checkScenesData':
        return await checkScenesData()
      
      case 'repairScenesData':
        return await repairScenesData()
      
      case 'addTestScenes':
        return await addTestScenes()
        
      // 新增：AI模型检查
      case 'checkAIModelsData':
        return await checkAIModelsData()
        
      case 'addTestAIModels':
        return await addTestAIModels()
        
      // 新增：提示词模板检查
      case 'checkPromptTemplatesData':
        return await checkPromptTemplatesData()
        
      case 'addTestPromptTemplates':
        return await addTestPromptTemplates()
        
      case 'debugAdminPermission':
        return await debugAdminPermission(event)
        
      // 统一检查所有集合
      case 'checkAllCollections':
        return await checkAllCollections()
      
      default:
        throw new Error('不支持的操作类型')
    }
  } catch (error) {
    console.error('数据检查修复失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 检查场景数据
 */
async function checkScenesData() {
  try {
    console.log('开始检查场景数据...')
    
    // 检查集合是否存在
    const collections = await db.listCollections()
    const hasScenes = collections.some(col => col.name === 'scenes')
    
    if (!hasScenes) {
      return {
        success: true,
        data: {
          hasCollection: false,
          count: 0,
          scenes: [],
          message: 'scenes集合不存在'
        }
      }
    }
    
    // 查询所有场景数据
    const result = await db.collection('scenes').get()
    const scenes = result.data
    
    console.log('场景数据检查结果:', {
      总数量: scenes.length,
      活跃场景: scenes.filter(s => s.is_active === true).length,
      非活跃场景: scenes.filter(s => s.is_active === false).length
    })
    
    // 检查数据结构
    const structureCheck = scenes.map(scene => ({
      _id: scene._id,
      name: scene.name || '无名称',
      category: scene.category || '无分类',
      is_active: scene.is_active,
      has_thumbnail: !!scene.thumbnail_url,
      created_at: scene.created_at,
      fields: Object.keys(scene)
    }))
    
    return {
      success: true,
      data: {
        hasCollection: true,
        count: scenes.length,
        activeCount: scenes.filter(s => s.is_active === true).length,
        scenes: structureCheck,
        message: `发现${scenes.length}个场景，其中${scenes.filter(s => s.is_active === true).length}个活跃`
      }
    }
    
  } catch (error) {
    console.error('检查场景数据失败:', error)
    return {
      success: false,
      error: error.message,
      message: '检查场景数据失败'
    }
  }
}

/**
 * 修复场景数据
 */
async function repairScenesData() {
  try {
    console.log('开始修复场景数据...')
    
    const result = await db.collection('scenes').get()
    const scenes = result.data
    
    if (scenes.length === 0) {
      return await addTestScenes()
    }
    
    // 修复缺失字段
    const repairs = []
    
    for (const scene of scenes) {
      const updates = {}
      let needsUpdate = false
      
      // 确保必需字段存在
      if (!scene.is_active) {
        updates.is_active = true
        needsUpdate = true
      }
      
      if (!scene.sort_order) {
        updates.sort_order = 0
        needsUpdate = true
      }
      
      if (!scene.category) {
        updates.category = 'general'
        needsUpdate = true
      }
      
      if (!scene.thumbnail_url) {
        updates.thumbnail_url = '/images/default-scene.png'
        needsUpdate = true
      }
      
      if (!scene.created_at) {
        updates.created_at = new Date()
        needsUpdate = true
      }
      
      if (!scene.updated_at) {
        updates.updated_at = new Date()
        needsUpdate = true
      }
      
      if (needsUpdate) {
        await db.collection('scenes').doc(scene._id).update({
          data: updates
        })
        repairs.push({
          id: scene._id,
          name: scene.name,
          updates: Object.keys(updates)
        })
      }
    }
    
    return {
      success: true,
      data: {
        repaired: repairs.length,
        repairs: repairs,
        message: `修复了${repairs.length}个场景的数据结构`
      }
    }
    
  } catch (error) {
    console.error('修复场景数据失败:', error)
    return {
      success: false,
      error: error.message,
      message: '修复场景数据失败'
    }
  }
}

/**
 * 添加测试场景数据
 */
async function addTestScenes() {
  try {
    console.log('开始添加测试场景数据...')
    
    const testScenes = [
      {
        name: '白色工作室',
        category: 'studio',
        description: '简约白色背景，专业摄影工作室风格',
        thumbnail_url: '/images/scenes/studio-white.jpg',
        is_active: true,
        sort_order: 1,
        parameters: {
          background: 'white',
          lighting: 'studio',
          mood: 'professional'
        },
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: '户外花园',
        category: 'outdoor',
        description: '自然花园环境，阳光充足，适合休闲风格',
        thumbnail_url: '/images/scenes/garden.jpg',
        is_active: true,
        sort_order: 2,
        parameters: {
          background: 'garden',
          lighting: 'natural',
          mood: 'relaxed'
        },
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: '城市街道',
        category: 'urban',
        description: '现代都市街头风格，适合时尚摄影',
        thumbnail_url: '/images/scenes/street.jpg',
        is_active: true,
        sort_order: 3,
        parameters: {
          background: 'street',
          lighting: 'natural',
          mood: 'urban'
        },
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: '海滩日落',
        category: 'outdoor',
        description: '海滩日落美景，浪漫温馨氛围',
        thumbnail_url: '/images/scenes/beach.jpg',
        is_active: true,
        sort_order: 4,
        parameters: {
          background: 'beach',
          lighting: 'sunset',
          mood: 'romantic'
        },
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: '咖啡厅',
        category: 'indoor',
        description: '温馨咖啡厅环境，适合日常风格拍摄',
        thumbnail_url: '/images/scenes/cafe.jpg',
        is_active: true,
        sort_order: 5,
        parameters: {
          background: 'cafe',
          lighting: 'warm',
          mood: 'cozy'
        },
        created_at: new Date(),
        updated_at: new Date()
      }
    ]
    
    const addedScenes = []
    for (const sceneData of testScenes) {
      const result = await db.collection('scenes').add({
        data: sceneData
      })
      addedScenes.push({
        _id: result._id,
        name: sceneData.name,
        category: sceneData.category
      })
    }
    
    return {
      success: true,
      data: {
        added: addedScenes.length,
        scenes: addedScenes,
        message: `成功添加${addedScenes.length}个测试场景`
      }
    }
    
  } catch (error) {
    console.error('添加测试场景失败:', error)
    return {
      success: false,
      error: error.message,
      message: '添加测试场景失败'
    }
  }
}

/**
 * 检查管理员权限
 */
async function checkAdminPermission(openid) {
  try {
    // 从环境变量或配置中获取管理员列表
    const adminUsers = process.env.ADMIN_USERS ? process.env.ADMIN_USERS.split(',') : []
    
    // 也可以从数据库查询管理员权限
    if (adminUsers.length === 0) {
      const adminResult = await db.collection('admin_users')
        .where({ openid, is_active: true })
        .get()
      
      return adminResult.data.length > 0
    }
    
    return adminUsers.includes(openid)
    
  } catch (error) {
    console.error('检查管理员权限失败:', error)
    return false
  }
}

/**
 * 检查AI模型数据
 */
async function checkAIModelsData() {
  try {
    console.log('开始检查AI模型数据...')
    
    // 检查api_configs集合
    const collections = await db.listCollections()
    const hasApiConfigs = collections.some(col => col.name === 'api_configs')
    
    if (!hasApiConfigs) {
      return {
        success: true,
        data: {
          hasCollection: false,
          count: 0,
          models: [],
          message: 'api_configs集合不存在'
        }
      }
    }
    
    // 查询所有AI模型数据
    const result = await db.collection('api_configs').get()
    const models = result.data
    
    console.log('AI模型数据检查结果:', {
      总数量: models.length,
      活跃模型: models.filter(m => m.is_active === true).length,
      非活跃模型: models.filter(m => m.is_active === false).length
    })
    
    // 检查数据结构
    const structureCheck = models.map(model => ({
      _id: model._id,
      name: model.name || '无名称',
      provider: model.provider || '无提供商',
      model_type: model.model_type || '无类型',
      is_active: model.is_active,
      has_api_config: !!model.api_config,
      created_at: model.created_at,
      fields: Object.keys(model)
    }))
    
    return {
      success: true,
      data: {
        hasCollection: true,
        count: models.length,
        activeCount: models.filter(m => m.is_active === true).length,
        models: structureCheck,
        message: `发现${models.length}个AI模型，其中${models.filter(m => m.is_active === true).length}个活跃`
      }
    }
    
  } catch (error) {
    console.error('检查AI模型数据失败:', error)
    return {
      success: false,
      error: error.message,
      message: '检查AI模型数据失败'
    }
  }
}

/**
 * 检查提示词模板数据
 */
async function checkPromptTemplatesData() {
  try {
    console.log('开始检查提示词模板数据...')
    
    // 检查prompt_templates集合
    const collections = await db.listCollections()
    const hasPromptTemplates = collections.some(col => col.name === 'prompt_templates')
    
    if (!hasPromptTemplates) {
      return {
        success: true,
        data: {
          hasCollection: false,
          count: 0,
          templates: [],
          message: 'prompt_templates集合不存在'
        }
      }
    }
    
    // 查询所有提示词模板数据
    const result = await db.collection('prompt_templates').get()
    const templates = result.data
    
    console.log('提示词模板数据检查结果:', {
      总数量: templates.length,
      活跃模板: templates.filter(t => t.is_active === true).length,
      摄影模板: templates.filter(t => t.type === 'photography').length,
      试衣模板: templates.filter(t => t.type === 'fitting').length
    })
    
    // 检查数据结构
    const structureCheck = templates.map(template => ({
      _id: template._id,
      type: template.type || '无类型',
      category: template.category || '无分类',
      is_active: template.is_active,
      has_template: !!template.template,
      variables_count: (template.variables || []).length,
      created_at: template.created_at,
      fields: Object.keys(template)
    }))
    
    return {
      success: true,
      data: {
        hasCollection: true,
        count: templates.length,
        activeCount: templates.filter(t => t.is_active === true).length,
        templates: structureCheck,
        message: `发现${templates.length}个提示词模板，其中${templates.filter(t => t.is_active === true).length}个活跃`
      }
    }
    
  } catch (error) {
    console.error('检查提示词模板数据失败:', error)
    return {
      success: false,
      error: error.message,
      message: '检查提示词模板数据失败'
    }
  }
}

/**
 * 检查所有集合数据
 */
async function checkAllCollections() {
  try {
    console.log('开始检查所有集合数据...')
    
    const results = {
      scenes: await checkScenesData(),
      aiModels: await checkAIModelsData(),
      promptTemplates: await checkPromptTemplatesData()
    }
    
    const summary = {
      totalCollections: 3,
      existingCollections: 0,
      totalRecords: 0,
      activeRecords: 0
    }
    
    Object.keys(results).forEach(key => {
      const result = results[key]
      if (result.success && result.data.hasCollection) {
        summary.existingCollections++
        summary.totalRecords += result.data.count
        summary.activeRecords += result.data.activeCount
      }
    })
    
    return {
      success: true,
      data: {
        summary,
        details: results,
        message: `检查完成：${summary.existingCollections}/${summary.totalCollections}个集合存在，共${summary.totalRecords}条记录，${summary.activeRecords}条活跃`
      }
    }
    
  } catch (error) {
    console.error('检查所有集合失败:', error)
    return {
      success: false,
      error: error.message,
      message: '检查所有集合失败'
    }
  }
}

/**
 * 添加测试AI模型数据
 */
async function addTestAIModels() {
  try {
    console.log('开始添加测试AI模型数据...')
    
    const testModels = [
      {
        name: 'Stable Diffusion XL',
        provider: 'stability-ai',
        model_type: 'text-to-image',
        capabilities: ['text-to-image', 'image-to-image'],
        api_config: {
          endpoint: 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
          headers: {
            'Authorization': 'Bearer {{API_KEY}}',
            'Content-Type': 'application/json'
          },
          method: 'POST'
        },
        parameters: {
          default: {
            width: 1024,
            height: 1024,
            steps: 30,
            cfg_scale: 7
          }
        },
        pricing: {
          cost_per_image: 0.02,
          currency: 'USD'
        },
        is_active: true,
        priority: 8,
        weight: 8,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'DALL-E 3',
        provider: 'openai',
        model_type: 'text-to-image',
        capabilities: ['text-to-image'],
        api_config: {
          endpoint: 'https://api.openai.com/v1/images/generations',
          headers: {
            'Authorization': 'Bearer {{API_KEY}}',
            'Content-Type': 'application/json'
          },
          method: 'POST'
        },
        parameters: {
          default: {
            size: '1024x1024',
            quality: 'standard',
            n: 1
          }
        },
        pricing: {
          cost_per_image: 0.04,
          currency: 'USD'
        },
        is_active: true,
        priority: 9,
        weight: 7,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]
    
    const addedModels = []
    for (const modelData of testModels) {
      const result = await db.collection('api_configs').add({
        data: modelData
      })
      addedModels.push({
        _id: result._id,
        name: modelData.name,
        provider: modelData.provider
      })
    }
    
    return {
      success: true,
      data: {
        added: addedModels.length,
        models: addedModels,
        message: `成功添加${addedModels.length}个测试AI模型`
      }
    }
    
  } catch (error) {
    console.error('添加测试AI模型失败:', error)
    return {
      success: false,
      error: error.message,
      message: '添加测试AI模型失败'
    }
  }
}

/**
 * 添加测试提示词模板
 */
async function addTestPromptTemplates() {
  try {
    console.log('开始添加测试提示词模板数据...')
    
    const testTemplates = [
      {
        type: 'photography',
        category: 'portrait',
        name: '人像摄影提示词',
        description: '专业人像摄影的AI提示词模板',
        template: 'professional portrait photography of {{gender}} model, {{age}} years old, wearing {{clothing_description}}, in {{location}}, {{lighting_style}} lighting, high quality, detailed, photorealistic',
        variables: [
          { name: 'gender', type: 'select', options: ['female', 'male'], default: 'female' },
          { name: 'age', type: 'number', min: 18, max: 60, default: 25 },
          { name: 'clothing_description', type: 'text', default: 'elegant dress' },
          { name: 'location', type: 'text', default: 'studio' },
          { name: 'lighting_style', type: 'select', options: ['natural', 'studio', 'dramatic'], default: 'natural' }
        ],
        default_params: {
          negative_prompt: 'blurry, low quality, distorted',
          steps: 30,
          cfg_scale: 7
        },
        is_active: true,
        priority: 5,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        type: 'fitting',
        category: 'virtual_fitting',
        name: '虚拟试衣提示词',
        description: '虚拟试衣的AI提示词模板',
        template: 'virtual clothing fitting, person wearing {{clothing_items}}, in {{location}}, realistic fitting, natural appearance, high quality',
        variables: [
          { name: 'clothing_items', type: 'text', default: 'casual outfit' },
          { name: 'location', type: 'text', default: 'indoor' }
        ],
        default_params: {
          negative_prompt: 'unrealistic fitting, distorted proportions',
          steps: 25,
          cfg_scale: 6
        },
        is_active: true,
        priority: 5,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]
    
    const addedTemplates = []
    for (const templateData of testTemplates) {
      const result = await db.collection('prompt_templates').add({
        data: templateData
      })
      addedTemplates.push({
        _id: result._id,
        type: templateData.type,
        category: templateData.category,
        name: templateData.name
      })
    }
    
    return {
      success: true,
      data: {
        added: addedTemplates.length,
        templates: addedTemplates,
        message: `成功添加${addedTemplates.length}个测试提示词模板`
      }
    }
    
  } catch (error) {
    console.error('添加测试提示词模板失败:', error)
    return {
      success: false,
      error: error.message,
      message: '添加测试提示词模板失败'
    }
  }
}

/**
 * 调试管理员权限问题
 */
async function debugAdminPermission(event) {
  try {
    const { targetOpenid } = event
    const { OPENID } = cloud.getWXContext()
    
    console.log('🔍 开始调试管理员权限问题...')
    
    const debugInfo = {
      currentUser: OPENID,
      targetUser: targetOpenid || OPENID,
      timestamp: new Date().toISOString()
    }
    
    // 1. 检查环境变量
    const envAdminUsers = process.env.ADMIN_USERS
    debugInfo.envCheck = {
      hasEnvVar: !!envAdminUsers,
      envValue: envAdminUsers || '未设置',
      envLength: envAdminUsers ? envAdminUsers.length : 0,
      adminList: envAdminUsers ? envAdminUsers.split(',') : []
    }
    
    // 2. 检查当前用户在环境变量中的状态
    const adminList = envAdminUsers ? envAdminUsers.split(',') : []
    debugInfo.permissionCheck = {
      isInEnvList: adminList.includes(debugInfo.currentUser),
      userOpenid: debugInfo.currentUser,
      exactMatch: adminList.find(admin => admin === debugInfo.currentUser),
      adminListArray: adminList
    }
    
    // 3. 检查 admin_users 集合
    let dbCheck = { hasCollection: false, adminRecord: null }
    try {
      const adminResult = await db.collection('admin_users')
        .where({
          _openid: debugInfo.currentUser,
          is_active: true
        })
        .get()
      
      dbCheck = {
        hasCollection: true,
        recordExists: adminResult.data.length > 0,
        adminRecord: adminResult.data[0] || null,
        recordCount: adminResult.data.length
      }
    } catch (error) {
      dbCheck.error = error.message
    }
    debugInfo.dbCheck = dbCheck
    
    // 4. 模拟权限检查逻辑
    debugInfo.simulatedCheck = {
      envMethod: adminList.includes(debugInfo.currentUser),
      dbMethod: dbCheck.recordExists,
      finalResult: adminList.length > 0 ? 
        adminList.includes(debugInfo.currentUser) : 
        dbCheck.recordExists
    }
    
    // 5. 检查 openid 格式
    debugInfo.openidAnalysis = {
      length: debugInfo.currentUser ? debugInfo.currentUser.length : 0,
      startsWithO: debugInfo.currentUser ? debugInfo.currentUser.startsWith('o') : false,
      hasSpecialChars: debugInfo.currentUser ? /[-_]/.test(debugInfo.currentUser) : false,
      format: debugInfo.currentUser ? 'valid' : 'invalid'
    }
    
    console.log('📊 调试信息:', debugInfo)
    
    return {
      success: true,
      data: debugInfo,
      message: '管理员权限调试完成',
      recommendations: generateRecommendations(debugInfo)
    }
    
  } catch (error) {
    console.error('😱 调试管理员权限失败:', error)
    return {
      success: false,
      error: error.message,
      message: '调试管理员权限失败'
    }
  }
}

/**
 * 生成修复建议
 */
function generateRecommendations(debugInfo) {
  const recommendations = []
  
  // 检查环境变量
  if (!debugInfo.envCheck.hasEnvVar) {
    recommendations.push('⚠️ 未设置 ADMIN_USERS 环境变量')
  } else if (!debugInfo.permissionCheck.isInEnvList) {
    recommendations.push(`⚠️ 您的 openid (${debugInfo.currentUser}) 不在 ADMIN_USERS 列表中`)
    recommendations.push(`🔧 请检查环境变量 ADMIN_USERS 的完整性`)
    recommendations.push(`🔧 现在的环境变量值: ${debugInfo.envCheck.envValue}`)
  }
  
  // 检查数据库记录
  if (!debugInfo.dbCheck.hasCollection) {
    recommendations.push('⚠️ admin_users 集合不存在')
  } else if (!debugInfo.dbCheck.recordExists) {
    recommendations.push('⚠️ 您在 admin_users 集合中没有管理员记录')
  }
  
  // 检查 openid 格式
  if (debugInfo.openidAnalysis.length < 20) {
    recommendations.push('⚠️ openid 长度可能不正确')
  }
  
  if (!debugInfo.openidAnalysis.startsWithO) {
    recommendations.push('⚠️ openid 应该以 "o" 开始')
  }
  
  // 提供解决方案
  if (recommendations.length === 0) {
    recommendations.push('✅ 配置看起来正确，请检查云函数是否已重新部署')
    recommendations.push('✅ 请尝试直接调用云函数测试权限')
  } else {
    recommendations.push('🚑 请按照上述建议修复后重新部署相关云函数')
  }
  
  return recommendations
}