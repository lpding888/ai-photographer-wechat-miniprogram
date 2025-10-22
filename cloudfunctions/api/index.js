// 优化版API云函数 - 减少冷启动时间
const cloud = require('wx-server-sdk')

// 延迟初始化，按需加载
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  // 跳过不必要的初始化
  throwOnNotFound: false,
  // 使用更快的超时设置
  timeout: 5000
})

// 延迟获取数据库实例
let db = null
const getDb = () => {
  if (!db) {
    db = cloud.database()
  }
  return db
}

exports.main = async (event, context) => {
  const { action } = event

  // 快速响应预热请求
  if (action === 'ping') {
    return {
      success: true,
      message: 'pong',
      timestamp: Date.now()
    }
  }

  try {
    console.log('API云函数调用:', action)

    // 🔐 NAS专用接口（需要密钥认证，不需要OPENID）
    const nasActions = ['getPendingTasks', 'getTempFileURLs', 'uploadGeneratedImage', 'nasCallback']
    if (nasActions.includes(action)) {
      // 验证NAS密钥
      const nasSecret = event.nasSecret || event.headers?.['x-nas-secret']
      const expectedSecret = process.env.NAS_SECRET_KEY || 'default-secret-key-change-me'

      if (nasSecret !== expectedSecret) {
        return {
          success: false,
          message: 'NAS认证失败'
        }
      }

      // 处理NAS专用接口
      switch (action) {
        case 'getPendingTasks':
          return await getPendingTasks(event)
        case 'getTempFileURLs':
          return await getTempFileURLs(event)
        case 'uploadGeneratedImage':
          return await uploadGeneratedImage(event)
        case 'nasCallback':
          return await nasCallback(event)
      }
    }

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
      case 'updateWorkTitle':
        return await updateWorkTitle(event, OPENID)
      case 'updateWork':
        return await updateWork(event, OPENID)
      case 'getUserStats':
        return await getUserStats(event, OPENID)
      case 'updateUserPreferences':
        return await updateUserPreferences(event, OPENID)
      // 管理员专用接口
      case 'getUsers':
        return await getUsers(event, OPENID)
      case 'updateUserStatus':
        return await updateUserStatus(event, OPENID)
      case 'getStatistics':
        return await getStatistics(event, OPENID)
      case 'exportData':
        return await exportData(event, OPENID)
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
 * 获取作品列表
 */
async function listWorks(event, OPENID) {
  try {
    const { tab = 'all', onlyCompleted = false, pageSize = 12, last_id = null, last_created_at = null } = event
    const db = getDb() // 按需获取数据库实例

    // 构建查询条件
    let query = { user_openid: OPENID }

    if (tab === 'favorite') {
      // 收藏tab：只查询收藏的作品
      query.is_favorite = true
    } else if (tab !== 'all') {
      // 其他tab（photography, fitting）：按类型筛选
      query.type = tab
    }

    if (onlyCompleted) {
      query.status = 'completed'
    }

    // 分页查询 - 一次性应用所有查询条件
    let dbQuery = db.collection('works').where(query)

    // 分页逻辑：优先使用 last_created_at，兜底使用 last_id
    if (last_created_at) {
      // 直接使用传入的创建时间进行分页
      query.created_at = db.command.lt(new Date(last_created_at))
      dbQuery = db.collection('works').where(query)
    } else if (last_id) {
      // 兼容旧版：通过last_id获取created_at时间
      try {
        const lastWork = await db.collection('works').doc(last_id).get()
        if (lastWork.data && lastWork.data.created_at) {
          query.created_at = db.command.lt(lastWork.data.created_at)
          dbQuery = db.collection('works').where(query)
        }
      } catch (e) {
        console.warn('获取分页基准时间失败，使用_id分页:', e)
        query._id = db.command.lt(last_id)
        dbQuery = db.collection('works').where(query)
      }
    }

    // 尝试按created_at排序，如果失败则按_id排序（处理老数据）
    let result
    try {
      // 按更新时间排序，最新完成的排在最前
      result = await dbQuery
        .orderBy('updated_at', 'desc')
        .limit(pageSize)
        .get()
    } catch (e) {
      console.warn('按updated_at排序失败，尝试created_at:', e)
      try {
        result = await dbQuery
          .orderBy('created_at', 'desc')
          .limit(pageSize)
          .get()
      } catch (e2) {
        console.warn('按created_at排序也失败，使用_id排序:', e2)
        // 兜底：使用_id排序
        result = await dbQuery
          .orderBy('_id', 'desc')
          .limit(pageSize)
          .get()
      }
    }

    // 处理数据并检查大小
    const works = result.data.map(work => {
      // 处理images字段 - 列表页只返回第一张图片，但保持数组格式以兼容前端
      let processedImages = []
      let thumbnailUrl = ''

      if (work.images && Array.isArray(work.images) && work.images.length > 0) {
        const firstImg = work.images[0]

        // 处理第一张图片（列表页精简metadata）
        if (typeof firstImg === 'string') {
          processedImages = [firstImg]
          thumbnailUrl = firstImg
        } else if (firstImg.url && firstImg.url.startsWith('data:image/')) {
          // base64数据，只返回占位符URL
          const placeholderUrl = `cloud://temp-placeholder-${work._id}-0`
          processedImages = [{
            url: placeholderUrl,
            is_base64_placeholder: true
          }]
          thumbnailUrl = placeholderUrl
        } else {
          // 列表页只返回必要字段，减少数据传输
          processedImages = [{
            url: firstImg.url || firstImg.fileID || firstImg.file_id || '',
            width: firstImg.width,
            height: firstImg.height
            // metadata在详情页才返回
          }]
          thumbnailUrl = firstImg.url || firstImg.fileID || firstImg.file_id || ''
        }
      }

      // 返回精简但兼容的数据结构
      const workData = {
        id: work._id,
        type: work.type,
        status: work.status,
        images: processedImages, // 保留images字段，但只有第一张图片
        thumbnail: thumbnailUrl, // 新增：缩略图URL字符串，方便快速访问
        image_count: work.images ? work.images.length : 0, // 告诉前端实际有多少张图片
        is_favorite: work.is_favorite || false,
        created_at: work.created_at,
        title: work.title || work.parameters?.title || `${work.type}作品`,
        // 精简parameters，只保留必要字段
        parameters: {
          title: work.parameters?.title,
          scene_name: work.parameters?.scene_name
        }
      }

      // 调试：检查单个作品的数据大小
      const workSize = JSON.stringify(workData).length
      if (workSize > 50000) { // 超过50KB的记录
        console.log(`⚠️ 大数据记录 ${work._id}: ${workSize} bytes`)
        console.log(`  - images数量: ${workData.images.length}`)
        console.log(`  - images大小: ${JSON.stringify(workData.images).length} bytes`)
        if (workData.images.length > 0) {
          console.log(`  - 第一张图片URL长度: ${workData.images[0].url ? workData.images[0].url.length : 0}`)
        }
      }

      return workData
    })

    // 检查总响应大小
    const totalSize = JSON.stringify({ success: true, data: works, message: '获取作品列表成功' }).length
    console.log(`📊 API响应总大小: ${totalSize} bytes (${(totalSize/1024/1024).toFixed(2)}MB)`)
    console.log(`📊 返回作品数量: ${works.length}`)

    return {
      success: true,
      data: works,
      message: '获取作品列表成功'
    }

  } catch (error) {
    console.error('获取作品列表失败:', error)
    return {
      success: false,
      message: '获取作品列表失败'
    }
  }
}

/**
 * 获取作品详情
 */
async function getWorkDetail(event, OPENID) {
  try {
    const { workId } = event
    const db = getDb() // 按需获取数据库实例

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

    // 兼容处理images格式（数组或对象）
    let images = []
    if (Array.isArray(work.images)) {
      images = work.images
    } else if (work.images && typeof work.images === 'object') {
      images = Object.values(work.images)
    }

    return {
      success: true,
      data: {
        id: work._id,
        type: work.type,
        status: work.status,
        images: images,
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
        title: work.title || null,
        completed_at: work.completed_at || null,
        // 🎭 姿势裂变数据
        ai_pose_variations: work.ai_pose_variations || null,
        pose_variations_created_at: work.pose_variations_created_at || null,
        // 🔗 引用作品ID（用于姿势裂变继承）
        reference_work_id: work.reference_work_id || null
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
    const db = getDb() // 获取数据库实例
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

    const work = checkResult.data[0]
    console.log(`🗑️ 删除作品: ${workId}, 类型: ${work.type}`)

    // 清理云存储文件
    let deletedFilesCount = 0
    let failedFilesCount = 0

    if (work.images && work.images.length > 0) {
      console.log(`📁 清理 ${work.images.length} 个云存储文件`)

      for (let i = 0; i < work.images.length; i++) {
        const image = work.images[i]
        try {
          if (image.url && image.url.startsWith('cloud://')) {
            // 删除云存储文件
            await cloud.deleteFile({
              fileList: [image.url]
            })
            deletedFilesCount++
            console.log(`✅ 删除文件成功: ${image.url}`)
          } else {
            console.log(`⏭️ 跳过非云存储文件: ${image.url}`)
          }
        } catch (fileError) {
          failedFilesCount++
          console.error(`❌ 删除文件失败: ${image.url}`, fileError.message)
          // 继续处理其他文件，不因为单个文件删除失败而中断
        }
      }

      console.log(`📊 文件清理统计: 成功 ${deletedFilesCount}, 失败 ${failedFilesCount}`)
    }

    // 删除相关的任务记录
    if (work.task_id) {
      try {
        await db.collection('task_queue')
          .where({ _id: work.task_id })
          .remove()
        console.log(`✅ 删除任务记录: ${work.task_id}`)
      } catch (taskError) {
        console.warn(`⚠️ 删除任务记录失败: ${work.task_id}`, taskError.message)
      }
    }

    // 删除作品记录
    await db.collection('works')
      .doc(workId)
      .remove()

    console.log(`🎉 作品删除完成: ${workId}`)

    return {
      success: true,
      message: '作品删除成功',
      data: {
        deleted_files: deletedFilesCount,
        failed_files: failedFilesCount
      }
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
    const db = getDb() // 获取数据库实例
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
 * 更新作品标题
 */
async function updateWorkTitle(event, OPENID) {
  try {
    const db = getDb() // 获取数据库实例
    const { workId, title } = event

    if (!workId) {
      return {
        success: false,
        message: '作品ID不能为空'
      }
    }

    if (!title || typeof title !== 'string') {
      return {
        success: false,
        message: '标题不能为空'
      }
    }

    // 标题长度限制
    const trimmedTitle = title.trim()
    if (trimmedTitle.length > 50) {
      return {
        success: false,
        message: '标题长度不能超过50个字符'
      }
    }

    // 检查作品是否存在且属于当前用户
    const result = await db.collection('works')
      .where({
        _id: workId,
        user_openid: OPENID
      })
      .get()

    if (result.data.length === 0) {
      return {
        success: false,
        message: '作品不存在或无权限修改'
      }
    }

    // 更新作品标题
    await db.collection('works')
      .doc(workId)
      .update({
        data: {
          title: trimmedTitle,
          updated_at: new Date()
        }
      })

    return {
      success: true,
      data: {
        title: trimmedTitle
      },
      message: '标题更新成功'
    }

  } catch (error) {
    console.error('更新作品标题失败:', error)
    return {
      success: false,
      message: '更新标题失败'
    }
  }
}

/**
 * 更新作品数据（通用方法）
 */
async function updateWork(event, OPENID) {
  try {
    const db = getDb()
    const { workId, updates } = event

    if (!workId) {
      return {
        success: false,
        message: '作品ID不能为空'
      }
    }

    if (!updates || typeof updates !== 'object') {
      return {
        success: false,
        message: '更新数据不能为空'
      }
    }

    // 检查作品是否存在且属于当前用户
    const result = await db.collection('works')
      .where({
        _id: workId,
        user_openid: OPENID
      })
      .get()

    if (result.data.length === 0) {
      return {
        success: false,
        message: '作品不存在或无权限修改'
      }
    }

    // 添加更新时间
    const updateData = {
      ...updates,
      updated_at: new Date()
    }

    // 更新作品数据
    await db.collection('works')
      .doc(workId)
      .update({
        data: updateData
      })

    console.log(`✅ 作品更新成功: ${workId}, 更新字段:`, Object.keys(updates))

    return {
      success: true,
      data: updates,
      message: '作品更新成功'
    }

  } catch (error) {
    console.error('更新作品失败:', error)
    return {
      success: false,
      message: '更新作品失败'
    }
  }
}

/**
 * 获取用户统计信息
 */
async function getUserStats(event, OPENID) {
  try {
    const db = getDb() // 获取数据库实例

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
    const db = getDb() // 获取数据库实例
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

/**
 * 检查管理员权限
 */
async function checkAdminPermission(OPENID) {
  try {
    const result = await cloud.callFunction({
      name: 'aimodels',
      data: {
        action: 'checkAdminPermission',
        userOpenid: OPENID  // 传递用户OPENID给aimodels
      }
    })

    return result.result && result.result.success && result.result.data && result.result.data.isAdmin
  } catch (error) {
    console.error('检查管理员权限失败:', error)
    return false
  }
}

/**
 * 获取用户列表（管理员专用）
 */
async function getUsers(event, OPENID) {
  try {
    // 检查管理员权限
    const isAdmin = await checkAdminPermission(OPENID)
    if (!isAdmin) {
      return {
        success: false,
        message: '权限不足，需要管理员权限'
      }
    }

    const db = getDb() // 获取数据库实例
    const { filter = {} } = event
    let query = {}

    // 处理搜索关键词
    if (filter.keyword) {
      query.$or = [
        { nickname: { $regex: filter.keyword, $options: 'i' } },
        { _id: { $regex: filter.keyword, $options: 'i' } }
      ]
    }

    // 处理状态过滤
    if (filter.status && filter.status !== 'all') {
      query.status = filter.status
    }

    const result = await db.collection('users')
      .where(query)
      .orderBy('created_at', 'desc')
      .limit(100)
      .get()

    // 处理用户数据，添加作品统计
    const users = await Promise.all(result.data.map(async (user) => {
      try {
        const worksResult = await db.collection('works')
          .where({ user_openid: user.openid || user._openid })
          .count()

        return {
          ...user,
          work_count: worksResult.total,
          created_at: formatDate(user.created_at)
        }
      } catch (e) {
        return {
          ...user,
          work_count: 0,
          created_at: formatDate(user.created_at)
        }
      }
    }))

    return {
      success: true,
      data: users,
      message: '获取用户列表成功'
    }

  } catch (error) {
    console.error('获取用户列表失败:', error)
    return {
      success: false,
      message: '获取用户列表失败'
    }
  }
}

/**
 * 更新用户状态（管理员专用）
 */
async function updateUserStatus(event, OPENID) {
  try {
    // 检查管理员权限
    const isAdmin = await checkAdminPermission(OPENID)
    if (!isAdmin) {
      return {
        success: false,
        message: '权限不足，需要管理员权限'
      }
    }

    const db = getDb() // 获取数据库实例
    const { userId, status } = event

    if (!userId || !status) {
      return {
        success: false,
        message: '用户ID和状态不能为空'
      }
    }

    await db.collection('users')
      .doc(userId)
      .update({
        data: {
          status: status,
          updated_at: new Date()
        }
      })

    return {
      success: true,
      message: '用户状态更新成功'
    }

  } catch (error) {
    console.error('更新用户状态失败:', error)
    return {
      success: false,
      message: '更新用户状态失败'
    }
  }
}

/**
 * 获取统计数据（管理员专用）
 */
async function getStatistics(event, OPENID) {
  try {
    // 检查管理员权限
    const isAdmin = await checkAdminPermission(OPENID)
    if (!isAdmin) {
      return {
        success: false,
        message: '权限不足，需要管理员权限'
      }
    }

    const db = getDb() // 获取数据库实例

    // 并行获取统计数据
    const [
      totalUsersResult,
      activeUsersResult,
      totalWorksResult,
      todayWorksResult,
      totalCreditsResult
    ] = await Promise.all([
      // 总用户数
      db.collection('users').count(),
      // 活跃用户数（状态为active或未设置状态）
      db.collection('users').where({
        $or: [
          { status: 'active' },
          { status: db.command.exists(false) }
        ]
      }).count(),
      // 总作品数
      db.collection('works').count(),
      // 今日作品数
      db.collection('works').where({
        created_at: db.command.gte(new Date(new Date().toDateString()))
      }).count(),
      // 用户积分统计
      db.collection('users').field({ credits: true }).get()
    ])

    // 计算积分统计
    const totalCredits = totalCreditsResult.data.reduce((sum, user) => sum + (user.credits || 0), 0)

    // 获取今日积分变化（简化版，只统计今日注册用户的初始积分）
    const todayUsersResult = await db.collection('users')
      .where({
        created_at: db.command.gte(new Date(new Date().toDateString()))
      })
      .field({ credits: true })
      .get()

    const todayCredits = todayUsersResult.data.reduce((sum, user) => sum + (user.credits || 0), 0)

    return {
      success: true,
      data: {
        totalUsers: totalUsersResult.total,
        activeUsers: activeUsersResult.total,
        totalWorks: totalWorksResult.total,
        todayWorks: todayWorksResult.total,
        totalCredits: totalCredits,
        todayCredits: todayCredits
      },
      message: '获取统计数据成功'
    }

  } catch (error) {
    console.error('获取统计数据失败:', error)
    return {
      success: false,
      message: '获取统计数据失败'
    }
  }
}

/**
 * 导出数据（管理员专用）
 */
async function exportData(event, OPENID) {
  try {
    // 检查管理员权限
    const isAdmin = await checkAdminPermission(OPENID)
    if (!isAdmin) {
      return {
        success: false,
        message: '权限不足，需要管理员权限'
      }
    }

    const db = getDb() // 获取数据库实例
    const { dataType } = event

    if (!dataType) {
      return {
        success: false,
        message: '数据类型不能为空'
      }
    }

    let result
    const limit = 1000 // 限制导出数量，避免数据过大

    switch (dataType) {
      case 'users':
        result = await db.collection('users')
          .orderBy('created_at', 'desc')
          .limit(limit)
          .get()
        break

      case 'works':
        result = await db.collection('works')
          .orderBy('created_at', 'desc')
          .limit(limit)
          .get()
        break

      case 'orders':
        result = await db.collection('orders')
          .orderBy('created_at', 'desc')
          .limit(limit)
          .get()
        break

      default:
        return {
          success: false,
          message: '不支持的数据类型'
        }
    }

    // 处理导出数据，格式化时间
    const exportData = result.data.map(item => ({
      ...item,
      created_at: formatDate(item.created_at),
      updated_at: formatDate(item.updated_at)
    }))

    return {
      success: true,
      data: exportData,
      message: `导出 ${dataType} 数据成功，共 ${exportData.length} 条记录`
    }

  } catch (error) {
    console.error('导出数据失败:', error)
    return {
      success: false,
      message: '导出数据失败'
    }
  }
}

/**
 * 格式化日期
 */
function formatDate(date) {
  if (!date) return ''

  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return String(date)

    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}`
  } catch (e) {
    return String(date)
  }
}

/**
 * 格式化显示时间 - 用于作品列表显示
 */
function formatDisplayTime(date) {
  if (!date) return ''

  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return ''

    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      // 今天 - 显示时间
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      return `今天 ${hours}:${minutes}`
    } else if (diffDays === 1) {
      // 昨天
      return '昨天'
    } else if (diffDays < 7) {
      // 一周内 - 显示天数
      return `${diffDays}天前`
    } else {
      // 一周以上 - 显示日期
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${month}-${day}`
    }
  } catch (e) {
    return formatDate(date)
  }
}

// ============================================
// NAS专用接口实现（用于n8n workflow）
// ============================================

/**
 * 获取待处理任务（供NAS轮询）
 */
async function getPendingTasks(event) {
  try {
    const db = getDb()
    const { limit = 1 } = event

    // 查询pending状态的任务
    const result = await db.collection('task_queue')
      .where({
        state: 'pending',
        status: 'pending'
      })
      .orderBy('created_at', 'asc')
      .limit(limit)
      .get()

    if (result.data.length === 0) {
      return {
        success: true,
        data: {
          tasks: []
        },
        message: '暂无待处理任务'
      }
    }

    // 标记任务为nas_processing，防止重复处理
    for (const task of result.data) {
      await db.collection('task_queue')
        .doc(task._id)
        .update({
          data: {
            state: 'nas_processing',
            status: 'processing',
            nas_start_time: new Date(),
            updated_at: new Date()
          }
        })
    }

    console.log(`🎯 NAS获取到 ${result.data.length} 个待处理任务`)

    return {
      success: true,
      data: {
        tasks: result.data
      },
      message: `获取到 ${result.data.length} 个待处理任务`
    }

  } catch (error) {
    console.error('获取待处理任务失败:', error)
    return {
      success: false,
      message: '获取待处理任务失败: ' + error.message
    }
  }
}

/**
 * 获取云存储文件的临时URL（供NAS下载图片）
 */
async function getTempFileURLs(event) {
  try {
    const { fileIds } = event

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return {
        success: false,
        message: '文件ID列表不能为空'
      }
    }

    // 批量获取临时URL
    const result = await cloud.getTempFileURL({
      fileList: fileIds
    })

    // 提取成功的URL
    const tempUrls = result.fileList
      .filter(file => file.status === 0)
      .map(file => file.tempFileURL)

    console.log(`📥 生成了 ${tempUrls.length} 个临时URL`)

    return {
      success: true,
      data: {
        tempUrls: tempUrls,
        fileList: result.fileList
      },
      message: '获取临时URL成功'
    }

  } catch (error) {
    console.error('获取临时URL失败:', error)
    return {
      success: false,
      message: '获取临时URL失败: ' + error.message
    }
  }
}

/**
 * 上传生成的图片到云存储（供NAS上传结果）
 */
async function uploadGeneratedImage(event) {
  try {
    const { taskId, imageData } = event

    if (!taskId || !imageData) {
      return {
        success: false,
        message: '任务ID和图片数据不能为空'
      }
    }

    // 解析base64图片数据
    let buffer
    let format = 'png'

    if (imageData.startsWith('data:image/')) {
      // data:image/png;base64,xxxxx 格式
      const matches = imageData.match(/^data:image\/([^;]+);base64,(.+)$/)
      if (matches) {
        format = matches[1]
        buffer = Buffer.from(matches[2], 'base64')
      } else {
        throw new Error('无效的base64图片格式')
      }
    } else {
      // 纯base64数据
      buffer = Buffer.from(imageData, 'base64')
    }

    // 生成文件路径
    const timestamp = Date.now()
    const cloudPath = `photography/${taskId}/${timestamp}.${format}`

    // 上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: buffer
    })

    console.log(`📤 图片上传成功: ${uploadResult.fileID}`)

    return {
      success: true,
      data: {
        fileID: uploadResult.fileID,
        cloudPath: cloudPath,
        size: buffer.length
      },
      message: '图片上传成功'
    }

  } catch (error) {
    console.error('上传图片失败:', error)
    return {
      success: false,
      message: '上传图片失败: ' + error.message
    }
  }
}

/**
 * NAS任务完成回调（供NAS通知任务完成）
 */
async function nasCallback(event) {
  try {
    const db = getDb()
    const { taskId, status, result, error } = event

    if (!taskId || !status) {
      return {
        success: false,
        message: '任务ID和状态不能为空'
      }
    }

    console.log(`📞 收到NAS回调: taskId=${taskId}, status=${status}`)

    // 获取任务信息
    const taskResult = await db.collection('task_queue')
      .doc(taskId)
      .get()

    if (!taskResult.data) {
      return {
        success: false,
        message: '任务不存在'
      }
    }

    const task = taskResult.data
    const completionTime = new Date()

    if (status === 'completed') {
      // 任务成功完成
      const fileID = result?.data?.fileID

      if (!fileID) {
        return {
          success: false,
          message: '缺少生成的图片文件ID'
        }
      }

      // 更新task_queue
      await db.collection('task_queue')
        .doc(taskId)
        .update({
          data: {
            status: 'completed',
            state: 'completed',
            result: {
              success: true,
              fileID: fileID,
              nas_processing_time: Date.now() - new Date(task.nas_start_time).getTime()
            },
            completed_at: completionTime,
            updated_at: completionTime
          }
        })

      // 更新works
      await db.collection('works')
        .where({ task_id: taskId })
        .update({
          data: {
            status: 'completed',
            images: [{
              url: fileID,
              width: result?.data?.width || 1024,
              height: result?.data?.height || 1024
            }],
            ai_model: result?.ai_model || 'gemini-2.0-flash-exp',
            ai_prompt: result?.ai_prompt || '',
            ai_description: result?.ai_description || null,
            completed_at: completionTime,
            created_at: completionTime,  // 更新为完成时间，确保排在最前面
            updated_at: completionTime
          }
        })

      console.log(`✅ 任务完成: ${taskId}`)

      return {
        success: true,
        message: '任务状态更新成功'
      }

    } else if (status === 'failed') {
      // 任务失败
      await db.collection('task_queue')
        .doc(taskId)
        .update({
          data: {
            status: 'failed',
            state: 'failed',
            error: error || 'NAS处理失败',
            updated_at: completionTime
          }
        })

      await db.collection('works')
        .where({ task_id: taskId })
        .update({
          data: {
            status: 'failed',
            error: error || 'NAS处理失败',
            updated_at: completionTime
          }
        })

      // 退还积分
      if (task.user_openid && task.params) {
        const credits = task.params.count || 1
        try {
          await db.collection('users')
            .where({ openid: task.user_openid })
            .update({
              data: {
                credits: db.command.inc(credits),
                total_consumed_credits: db.command.inc(-credits),
                updated_at: completionTime
              }
            })
          console.log(`💰 已退还 ${credits} 积分给用户 ${task.user_openid}`)
        } catch (refundError) {
          console.error('❌ 退还积分失败:', refundError)
        }
      }

      console.log(`❌ 任务失败: ${taskId}, 原因: ${error}`)

      return {
        success: true,
        message: '任务失败状态更新成功'
      }
    }

    return {
      success: false,
      message: '未知的任务状态'
    }

  } catch (error) {
    console.error('NAS回调处理失败:', error)
    return {
      success: false,
      message: 'NAS回调处理失败: ' + error.message
    }
  }
}