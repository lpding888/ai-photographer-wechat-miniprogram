// 简化版API云函数 - 避免复杂依赖问题
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action } = event

  try {
    console.log('API云函数调用:', action)

    // 安全获取微信上下文
    let wxContext = null
    let OPENID = null

    try {
      wxContext = cloud.getWXContext()
      OPENID = wxContext ? wxContext.OPENID : null
    } catch (e) {
      console.error('获取微信上下文失败:', e)
      return {
        success: false,
        message: '用户身份验证失败'
      }
    }

    if (!OPENID) {
      return {
        success: false,
        message: '用户未登录'
      }
    }

    switch (action) {
      case 'listWorks':
        return await listWorks(event, OPENID)
      case 'getWorkDetail':
        return await getWorkDetail(event, OPENID)
      case 'deleteWork':
        return await deleteWork(event, OPENID)
      case 'toggleFavorite':
        return await toggleFavorite(event, OPENID)
      case 'getUserStats':
        return await getUserStats(event, OPENID)
      case 'updateUserPreferences':
        return await updateUserPreferences(event, OPENID)
      default:
        return {
          success: false,
          message: `未知操作: ${action}`
        }
    }
  } catch (error) {
    console.error('API云函数执行错误:', error)
    return {
      success: false,
      message: '服务器内部错误'
    }
  }
}

/**
 * 获取作品列表（优化版：游标分页 + 字段精简）
 */
async function listWorks(event, OPENID) {
  try {
    const {
      tab = 'all',
      onlyCompleted = false,
      pageSize = 12,
      last_id = null,
      last_created_at = null
    } = event

    console.log('📊 listWorks调用:', { tab, onlyCompleted, pageSize, last_id, last_created_at })

    // 🎯 优化：构建查询条件
    let query = { user_openid: OPENID }

    if (tab !== 'all') {
      query.type = tab
    }

    if (onlyCompleted) {
      query.status = 'completed'
    }

    // 🚀 性能优化1：游标分页（last_id + last_created_at）
    // 避免skip导致的全表扫描，使用created_at + _id双重游标
    if (last_id && last_created_at) {
      // 时间戳可能是字符串或Date对象，统一转换
      const lastTime = last_created_at instanceof Date
        ? last_created_at
        : new Date(last_created_at)

      // 使用复合条件：时间小于last_created_at，或时间相等但_id小于last_id
      query.$or = [
        { created_at: db.command.lt(lastTime) },
        {
          created_at: lastTime,
          _id: db.command.lt(last_id)
        }
      ]
    }

    // 🚀 性能优化2：字段精简，只返回必要字段（减少50%数据传输）
    const result = await db.collection('works')
      .where(query)
      .field({
        _id: true,
        type: true,
        status: true,
        cover_url: true,      // 封面图（优先）
        thumbnail: true,       // 缩略图（备用）
        is_favorite: true,
        created_at: true,
        created_time: true,    // 兼容字段
        // 🎯 优化：不返回完整images数组和parameters，减少数据量
        // 详情页再获取完整数据
      })
      .orderBy('created_at', 'desc')
      .orderBy('_id', 'desc')  // 🎯 二级排序，确保游标分页准确
      .limit(pageSize)
      .get()

    console.log(`✅ 查询到 ${result.data.length} 条作品`)

    // 🎯 优化：精简数据处理
    const works = result.data.map(work => ({
      id: work._id,
      type: work.type,
      status: work.status,
      cover_url: work.cover_url,
      thumbnail: work.thumbnail,
      is_favorite: work.is_favorite || false,
      created_at: work.created_at,
      created_time: work.created_time || work.created_at
    }))

    return {
      success: true,
      data: works,
      message: '获取作品列表成功',
      // 🎯 返回分页信息，方便前端判断
      pagination: {
        hasMore: works.length >= pageSize,
        count: works.length
      }
    }

  } catch (error) {
    console.error('❌ 获取作品列表失败:', error)
    return {
      success: false,
      message: '获取作品列表失败: ' + (error.message || '未知错误')
    }
  }
}

/**
 * 获取作品详情
 */
async function getWorkDetail(event, OPENID) {
  try {
    const { workId } = event

    if (!workId) {
      return {
        success: false,
        message: '作品ID不能为空'
      }
    }

    const result = await db.collection('works')
      .where({
        _id: workId,
        user_openid: OPENID
      })
      .get()

    if (result.data.length === 0) {
      return {
        success: false,
        message: '作品不存在'
      }
    }

    const work = result.data[0]

    return {
      success: true,
      data: {
        id: work._id,
        type: work.type,
        status: work.status,
        images: work.images || [],
        is_favorite: work.is_favorite || false,
        created_at: work.created_at,
        parameters: work.parameters || {},
        task_id: work.task_id,
        // 🎯 新增字段：原图和AI描述
        original_images: work.original_images || [],
        ai_description: work.ai_description || null,
        ai_model: work.ai_model || null,
        ai_prompt: work.ai_prompt || null,
        scene_id: work.scene_id || null,
        scene_name: work.scene_name || null,
        title: work.title || null
      },
      message: '获取作品详情成功'
    }

  } catch (error) {
    console.error('获取作品详情失败:', error)
    return {
      success: false,
      message: '获取作品详情失败'
    }
  }
}

/**
 * 删除作品
 */
async function deleteWork(event, OPENID) {
  try {
    const { workId } = event

    if (!workId) {
      return {
        success: false,
        message: '作品ID不能为空'
      }
    }

    // 检查作品是否存在且属于当前用户
    const checkResult = await db.collection('works')
      .where({
        _id: workId,
        user_openid: OPENID
      })
      .get()

    if (checkResult.data.length === 0) {
      return {
        success: false,
        message: '作品不存在或无权删除'
      }
    }

    // 删除作品
    await db.collection('works')
      .doc(workId)
      .remove()

    return {
      success: true,
      message: '作品删除成功'
    }

  } catch (error) {
    console.error('删除作品失败:', error)
    return {
      success: false,
      message: '删除作品失败'
    }
  }
}

/**
 * 切换收藏状态
 */
async function toggleFavorite(event, OPENID) {
  try {
    const { workId } = event

    if (!workId) {
      return {
        success: false,
        message: '作品ID不能为空'
      }
    }

    // 获取当前收藏状态
    const result = await db.collection('works')
      .where({
        _id: workId,
        user_openid: OPENID
      })
      .get()

    if (result.data.length === 0) {
      return {
        success: false,
        message: '作品不存在'
      }
    }

    const work = result.data[0]
    const currentFavorite = work.is_favorite || false

    // 切换收藏状态
    await db.collection('works')
      .doc(workId)
      .update({
        data: {
          is_favorite: !currentFavorite,
          updated_at: new Date()
        }
      })

    return {
      success: true,
      data: {
        is_favorite: !currentFavorite
      },
      message: `已${!currentFavorite ? '收藏' : '取消收藏'}作品`
    }

  } catch (error) {
    console.error('切换收藏状态失败:', error)
    return {
      success: false,
      message: '切换收藏状态失败'
    }
  }
}

/**
 * 获取用户统计信息
 */
async function getUserStats(event, OPENID) {
  try {
    // 获取用户信息
    const userResult = await db.collection('users')
      .where({ openid: OPENID })
      .get()

    if (userResult.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }

    const user = userResult.data[0]

    // 获取作品统计
    const worksResult = await db.collection('works')
      .where({ user_openid: OPENID })
      .get()

    const totalWorks = worksResult.data.length
    const completedWorks = worksResult.data.filter(work => work.status === 'completed').length

    return {
      success: true,
      data: {
        credits: user.credits || 0,
        total_works: totalWorks,
        completed_works: completedWorks,
        favorite_works: worksResult.data.filter(work => work.is_favorite).length,
        total_consumed_credits: user.total_consumed_credits || 0
      },
      message: '获取用户统计成功'
    }

  } catch (error) {
    console.error('获取用户统计失败:', error)
    return {
      success: false,
      message: '获取用户统计失败'
    }
  }
}

/**
 * 更新用户偏好设置
 */
async function updateUserPreferences(event, OPENID) {
  try {
    const { preferences } = event

    if (!preferences) {
      return {
        success: false,
        message: '偏好设置不能为空'
      }
    }

    // 更新用户偏好
    await db.collection('users')
      .where({ openid: OPENID })
      .update({
        data: {
          preferences: preferences,
          updated_at: new Date()
        }
      })

    return {
      success: true,
      message: '偏好设置更新成功'
    }

  } catch (error) {
    console.error('更新用户偏好失败:', error)
    return {
      success: false,
      message: '更新用户偏好失败'
    }
  }
}