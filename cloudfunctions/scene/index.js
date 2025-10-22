// 场景管理云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  
  try {
    switch (action) {
      case 'getScenePrompt':
        return await getScenePrompt(event, wxContext)
      case 'getScenes':
        return await getScenes(event, wxContext)
      case 'getSceneDetail':
        return await getSceneDetail(event, wxContext)
      case 'createScene':
        return await createScene(event, wxContext)
      case 'addScene':
        return await addScene(event, wxContext)
      case 'updateScene':
        return await updateScene(event, wxContext)
      case 'deleteScene':
        return await deleteScene(event, wxContext)
      case 'toggleSceneStatus':
        return await toggleSceneStatus(event, wxContext)
      default:
        return {
          success: false,
          message: '未知操作: ' + action
        }
    }
  } catch (error) {
    console.error('场景函数执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器错误'
    }
  }
}

/**
 * 获取场景列表
 */
async function getScenes(event, wxContext) {
  const { category = 'all' } = event
  
  try {
    console.log('getScenes: 开始查询场景数据, category:', category)
    
    // 先从数据库查询场景
    let query = { is_active: true }
    
    if (category !== 'all') {
      query.category = category
    }
    
    console.log('getScenes: 查询条件:', query)
    
    const result = await db.collection('scenes')
      .where(query)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .get()
    
    console.log('getScenes: 数据库查询结果:', {
      total: result.data.length,
      scenes: result.data.map(s => ({ id: s._id, name: s.name, category: s.category }))
    })
    
    let scenes = result.data
    
    // 只返回数据库查询结果，不使用默认场景
    console.log('getScenes: 返回数据库查询结果')
    
    return {
      success: true,
      data: scenes,
      message: '获取场景成功'
    }
    
  } catch (error) {
    console.error('getScenes: 获取场景失败:', error)
    
    // 出错时不返回默认场景，直接返回错误
    return {
      success: false,
      message: '获取场景失败: ' + error.message
    }
  }
}

/**
 * 添加新场景（管理员功能）
 */
async function addScene(event, wxContext) {
  const { OPENID } = wxContext
  const { scene_data } = event
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  // 检查管理员权限
  const isAdmin = await checkAdminPermission(OPENID)
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限执行此操作'
    }
  }
  
  if (!scene_data || !scene_data.name) {
    return {
      success: false,
      message: '场景数据不完整'
    }
  }
  
  try {
    // 生成自定义ID
    const sceneId = 'scene_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    
    const sceneRecord = {
      id: sceneId,
      name: scene_data.name,
      category: scene_data.category || 'custom',
      description: scene_data.description || '',
      tags: scene_data.tags || [],
      icon: scene_data.icon || '📸',
      enabled: scene_data.enabled !== undefined ? scene_data.enabled : true,
      is_active: scene_data.enabled !== undefined ? scene_data.enabled : true,
      thumbnail_url: scene_data.thumbnail_url || '/images/default-scene.png',
      parameters: {
        background: scene_data.category,
        lighting: 'natural',
        mood: 'professional'
      },
      sort_order: scene_data.sort_order || 0,
      created_by: OPENID,
      created_at: new Date(),
      updated_at: new Date()
    }
    
    const result = await db.collection('scenes').add({
      data: sceneRecord
    })
    
    return {
      success: true,
      data: {
        ...sceneRecord,
        _id: result._id
      },
      message: '场景添加成功'
    }
    
  } catch (error) {
    console.error('添加场景失败:', error)
    return {
      success: false,
      message: '添加场景失败: ' + error.message
    }
  }
}

/**
 * 获取场景详情
 */
async function getSceneDetail(event, wxContext) {
  const { sceneId } = event
  
  if (!sceneId) {
    return {
      success: false,
      message: '场景ID不能为空'
    }
  }
  
  try {
    const result = await db.collection('scenes')
      .doc(sceneId)
      .get()
    
    if (!result.data) {
      return {
        success: false,
        message: '场景不存在'
      }
    }
    
    return {
      success: true,
      data: result.data,
      message: '获取场景详情成功'
    }
    
  } catch (error) {
    console.error('获取场景详情失败:', error)
    return {
      success: false,
      message: '获取场景详情失败'
    }
  }
}

/**
 * 创建场景（管理员功能）
 */
async function createScene(event, wxContext) {
  const { OPENID } = wxContext
  const {
    name,
    category,
    thumbnail_url,
    description,
    parameters = {},
    sort_order = 0
  } = event
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  // 检查管理员权限
  const isAdmin = await checkAdminPermission(OPENID)
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限执行此操作'
    }
  }
  
  if (!name || !category) {
    return {
      success: false,
      message: '场景名称和分类不能为空'
    }
  }
  
  try {
    const sceneData = {
      name,
      category,
      thumbnail_url: thumbnail_url || '/images/default-scene.png',
      description: description || '',
      parameters,
      sort_order,
      is_active: true,
      created_by: OPENID,
      created_at: new Date(),
      updated_at: new Date()
    }
    
    const result = await db.collection('scenes').add({
      data: sceneData
    })
    
    return {
      success: true,
      data: {
        scene_id: result._id,
        ...sceneData
      },
      message: '创建场景成功'
    }
    
  } catch (error) {
    console.error('创建场景失败:', error)
    return {
      success: false,
      message: '创建场景失败'
    }
  }
}

/**
 * 更新场景（管理员功能）
 */
async function updateScene(event, wxContext) {
  const { OPENID } = wxContext
  const { sceneId, ...updateData } = event
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  // 检查管理员权限
  const isAdmin = await checkAdminPermission(OPENID)
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限执行此操作'
    }
  }
  
  if (!sceneId) {
    return {
      success: false,
      message: '场景ID不能为空'
    }
  }
  
  try {
    // 过滤不允许更新的字段
    const allowedFields = [
      'name', 'category', 'thumbnail_url', 'description', 
      'parameters', 'sort_order', 'is_active'
    ]
    
    const filteredData = {}
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        filteredData[key] = value
      }
    }
    
    filteredData.updated_at = new Date()
    
    const result = await db.collection('scenes')
      .doc(sceneId)
      .update({
        data: filteredData
      })
    
    if (result.stats.updated === 0) {
      return {
        success: false,
        message: '场景不存在'
      }
    }
    
    return {
      success: true,
      message: '更新场景成功'
    }
    
  } catch (error) {
    console.error('更新场景失败:', error)
    return {
      success: false,
      message: '更新场景失败'
    }
  }
}

/**
 * 删除场景（管理员功能）
 */
async function deleteScene(event, wxContext) {
  const { OPENID } = wxContext
  const { sceneId } = event
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  // 检查管理员权限
  const isAdmin = await checkAdminPermission(OPENID)
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限执行此操作'
    }
  }
  
  if (!sceneId) {
    return {
      success: false,
      message: '场景ID不能为空'
    }
  }
  
  try {
    // 先通过id查找场景
    const sceneResult = await db.collection('scenes')
      .where({ id: sceneId })
      .get()
      
    if (sceneResult.data.length > 0) {
      // 通过id删除
      const result = await db.collection('scenes')
        .where({ id: sceneId })
        .remove()
      
      if (result.stats.removed === 0) {
        return {
          success: false,
          message: '删除失败'
        }
      }
    } else {
      // 如果通过id找不到，尝试通过_id删除
      const result = await db.collection('scenes')
        .doc(sceneId)
        .remove()
      
      if (result.stats.removed === 0) {
        return {
          success: false,
          message: '场景不存在或删除失败'
        }
      }
    }
    
    return {
      success: true,
      message: '删除场景成功'
    }
    
  } catch (error) {
    console.error('删除场景失败:', error)
    return {
      success: false,
      message: '删除场景失败: ' + error.message
    }
  }
}

/**
 * 切换场景状态（管理员功能）
 */
async function toggleSceneStatus(event, wxContext) {
  const { OPENID } = wxContext
  const { sceneId, enabled } = event
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  // 检查管理员权限
  const isAdmin = await checkAdminPermission(OPENID)
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限执行此操作'
    }
  }
  
  if (!sceneId || enabled === undefined) {
    return {
      success: false,
      message: '参数不完整'
    }
  }
  
  try {
    // 先通过id查找场景
    const sceneResult = await db.collection('scenes')
      .where({ id: sceneId })
      .get()
      
    if (sceneResult.data.length === 0) {
      // 如果通过id找不到，尝试通过_id查找
      const result = await db.collection('scenes')
        .doc(sceneId)
        .update({
          data: {
            enabled: enabled,
            is_active: enabled,
            updated_at: new Date()
          }
        })
      
      if (result.stats.updated === 0) {
        return {
          success: false,
          message: '场景不存在'
        }
      }
    } else {
      // 通过id更新
      const result = await db.collection('scenes')
        .where({ id: sceneId })
        .update({
          data: {
            enabled: enabled,
            is_active: enabled,
            updated_at: new Date()
          }
        })
      
      if (result.stats.updated === 0) {
        return {
          success: false,
          message: '更新失败'
        }
      }
    }
    
    return {
      success: true,
      message: `场景已${enabled ? '启用' : '禁用'}`
    }
    
  } catch (error) {
    console.error('切换场景状态失败:', error)
    return {
      success: false,
      message: '切换场景状态失败: ' + error.message
    }
  }
}

/**
 * 获取默认场景
 */
function getDefaultScenes() {
  return [
    {
      _id: 'scene_studio_white',
      name: '白色工作室',
      category: 'studio',
      thumbnail_url: '/images/scenes/studio-white.jpg',
      description: '简约白色背景，专业摄影工作室风格',
      parameters: {
        background: 'white',
        lighting: 'studio',
        mood: 'professional'
      },
      sort_order: 1,
      is_active: true
    },
    {
      _id: 'scene_ai_creative',
      name: 'AI创意场景',
      category: 'creative',
      thumbnail_url: '/images/scenes/ai-creative.jpg',
      description: '充满想象力的AI创意环境，适合奇幻和概念艺术风格，支持复杂的场景描述和创意组合',
      parameters: {
        background: 'creative',
        lighting: 'dramatic',
        mood: 'imaginative',
        style: 'conceptual'
      },
      sort_order: 2,
      is_active: true
    },
    {
      _id: 'scene_outdoor_garden',
      name: '户外花园',
      category: 'outdoor',
      thumbnail_url: '/images/scenes/garden.jpg',
      description: '自然花园环境，阳光充足，适合休闲风格',
      parameters: {
        background: 'garden',
        lighting: 'natural',
        mood: 'relaxed'
      },
      sort_order: 3,
      is_active: true
    },
    {
      _id: 'scene_urban_street',
      name: '城市街道',
      category: 'urban',
      thumbnail_url: '/images/scenes/street.jpg',
      description: '现代都市街头风格，适合时尚摄影',
      parameters: {
        background: 'street',
        lighting: 'natural',
        mood: 'urban'
      },
      sort_order: 4,
      is_active: true
    },
    {
      _id: 'scene_fantasy_restaurant',
      name: '奇幻餐厅',
      category: 'fantasy',
      thumbnail_url: '/images/scenes/fantasy-restaurant.jpg',
      description: '高档奇幻餐厅环境，星空背景，适合创意美食和动物主题的AI图像生成',
      parameters: {
        background: 'fancy_restaurant',
        lighting: 'constellation',
        mood: 'whimsical',
        theme: 'fantasy_dining'
      },
      sort_order: 5,
      is_active: true
    },
    {
      _id: 'scene_beach_sunset',
      name: '海滩日落',
      category: 'outdoor',
      thumbnail_url: '/images/scenes/beach.jpg',
      description: '海滩日落美景，浪漫温馨氛围',
      parameters: {
        background: 'beach',
        lighting: 'sunset',
        mood: 'romantic'
      },
      sort_order: 6,
      is_active: true
    },
    {
      _id: 'scene_cafe_interior',
      name: '咖啡厅',
      category: 'indoor',
      thumbnail_url: '/images/scenes/cafe.jpg',
      description: '温馨咖啡厅环境，适合日常风格拍摄',
      parameters: {
        background: 'cafe',
        lighting: 'warm',
        mood: 'cozy'
      },
      sort_order: 7,
      is_active: true
    },
    {
      _id: 'scene_luxury_hotel',
      name: '豪华酒店',
      category: 'indoor',
      thumbnail_url: '/images/scenes/hotel.jpg',
      description: '奢华酒店环境，高端商务风格',
      parameters: {
        background: 'luxury',
        lighting: 'elegant',
        mood: 'sophisticated'
      },
      sort_order: 8,
      is_active: true
    }
  ]
}

/**
 * 检查管理员权限
 */
async function checkAdminPermission(openid) {
  try {
    // 使用环境变量 ADMIN_USERS 配置管理员权限
    const envAdminUsers = process.env.ADMIN_USERS
    if (!envAdminUsers) {
      console.error('⚠️ ADMIN_USERS 环境变量未设置')
      return false
    }
    
    const adminUsers = envAdminUsers.split(',')
    
    console.log('🔍 场景权限检查 - 当前用户:', openid)
    console.log('🔍 场景权限检查 - 环境变量:', envAdminUsers)
    console.log('🔍 场景权限检查 - 管理员列表:', adminUsers)
    console.log('🔍 场景权限检查 - 是否匹配:', adminUsers.includes(openid))
    
    const isAdmin = adminUsers.includes(openid)
    
    return isAdmin
    
  } catch (error) {
    console.error('检查管理员权限失败:', error)
    return false
  }
}