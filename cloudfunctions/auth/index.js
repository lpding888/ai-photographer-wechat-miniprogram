const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 管理员权限验证云函数
 * 用于验证用户是否具有管理员权限
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, permission } = event

  try {
    switch (action) {
      case 'checkPermission':
        return await checkAdminPermission(OPENID, permission)
      
      case 'getAdminInfo':
        return await getAdminInfo(OPENID)
      
      case 'updateLastLogin':
        return await updateLastLogin(OPENID)
      
      case 'addAdmin':
        return await addAdmin(event.adminData, OPENID)
      
      case 'removeAdmin':
        return await removeAdmin(event.targetOpenId, OPENID)
      
      default:
        throw new Error('不支持的操作类型')
    }
  } catch (error) {
    console.error('管理员权限验证失败:', error)
    return {
      success: false,
      error: error.message,
      code: 'PERMISSION_DENIED'
    }
  }
}

/**
 * 检查管理员权限
 */
async function checkAdminPermission(openid, requiredPermission = null) {
  try {
    console.log('🔍 auth权限检查 - 当前用户:', openid)
    
    // 临时硬编码管理员权限检查（快速解决方案）
    const hardcodedAdmins = ['oPCV81-CA12dIHv4KrUHcel-F02c'] // 修正后的正确openid
    
    // 先检查硬编码列表
    if (hardcodedAdmins.includes(openid)) {
      console.log('✅ 硬编码管理员验证成功')
      return {
        success: true,
        data: {
          role: 'super_admin',
          permissions: ['manage_models', 'manage_prompts', 'manage_scenes', 'view_users', 'manage_works'],
          username: 'admin'
        }
      }
    }
    
    // 查询管理员信息
    const adminResult = await db.collection('admin_users')
      .where({
        _openid: openid,
        is_active: true
      })
      .get()

    if (adminResult.data.length === 0) {
      console.log('❌ 没有找到管理员记录')
      throw new Error(`无管理员权限。当前用户: ${openid}`)
    }

    const admin = adminResult.data[0]

    // 检查特定权限
    if (requiredPermission && !admin.permissions.includes(requiredPermission)) {
      throw new Error(`缺少权限: ${requiredPermission}`)
    }

    // 更新最后登录时间
    await updateLastLogin(openid)

    return {
      success: true,
      data: {
        role: admin.role,
        permissions: admin.permissions,
        username: admin.username
      }
    }
    
  } catch (error) {
    console.error('管理员权限检查失败:', error)
    throw error
  }
}

/**
 * 获取管理员信息
 */
async function getAdminInfo(openid) {
  const adminResult = await db.collection('admin_users')
    .where({
      _openid: openid,
      is_active: true
    })
    .get()

  if (adminResult.data.length === 0) {
    throw new Error('管理员不存在')
  }

  const admin = adminResult.data[0]
  
  // 不返回敏感信息
  return {
    success: true,
    data: {
      username: admin.username,
      role: admin.role,
      permissions: admin.permissions,
      created_time: admin.created_time,
      last_login: admin.last_login
    }
  }
}

/**
 * 更新最后登录时间
 */
async function updateLastLogin(openid) {
  const now = new Date().toISOString().replace('T', ' ').substr(0, 19)
  
  await db.collection('admin_users')
    .where({
      _openid: openid
    })
    .update({
      data: {
        last_login: now,
        updated_time: now
      }
    })
}

/**
 * 添加管理员（需要超级管理员权限）
 */
async function addAdmin(adminData, operatorOpenId) {
  // 检查操作者是否为超级管理员
  const operatorResult = await db.collection('admin_users')
    .where({
      _openid: operatorOpenId,
      role: 'super_admin',
      is_active: true
    })
    .get()

  if (operatorResult.data.length === 0) {
    throw new Error('只有超级管理员可以添加管理员')
  }

  // 检查目标用户是否已是管理员
  const existingAdmin = await db.collection('admin_users')
    .where({
      _openid: adminData.openid
    })
    .get()

  if (existingAdmin.data.length > 0) {
    throw new Error('该用户已是管理员')
  }

  const now = new Date().toISOString().replace('T', ' ').substr(0, 19)

  // 添加新管理员
  const result = await db.collection('admin_users').add({
    data: {
      _openid: adminData.openid,
      username: adminData.username || 'admin',
      role: adminData.role || 'admin',
      permissions: adminData.permissions || [
        'manage_models',
        'manage_prompts',
        'manage_scenes'
      ],
      created_time: now,
      updated_time: now,
      is_active: true,
      last_login: null
    }
  })

  return {
    success: true,
    data: {
      id: result._id,
      message: '管理员添加成功'
    }
  }
}

/**
 * 移除管理员（需要超级管理员权限）
 */
async function removeAdmin(targetOpenId, operatorOpenId) {
  // 检查操作者是否为超级管理员
  const operatorResult = await db.collection('admin_users')
    .where({
      _openid: operatorOpenId,
      role: 'super_admin',
      is_active: true
    })
    .get()

  if (operatorResult.data.length === 0) {
    throw new Error('只有超级管理员可以移除管理员')
  }

  // 不能移除自己
  if (targetOpenId === operatorOpenId) {
    throw new Error('不能移除自己的管理员权限')
  }

  // 软删除：设置为非激活状态
  await db.collection('admin_users')
    .where({
      _openid: targetOpenId
    })
    .update({
      data: {
        is_active: false,
        updated_time: new Date().toISOString().replace('T', ' ').substr(0, 19)
      }
    })

  return {
    success: true,
    message: '管理员权限已移除'
  }
}