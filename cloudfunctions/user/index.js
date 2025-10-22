// 用户管理云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 添加积分记录
 */
async function addCreditRecord(data) {
  try {
    await db.collection('credit_records').add({
      data: {
        user_openid: data.user_openid,
        type: data.type,
        amount: Math.abs(data.amount),
        description: data.description || '',
        order_id: data.order_id || '',
        work_id: data.work_id || '',
        task_id: data.task_id || '',
        balance_after: data.balance_after || 0,
        created_at: new Date(),
        createdAt: new Date(),
        created_time: Date.now()
      }
    })
  } catch (error) {
    console.error('添加积分记录失败:', error)
  }
}

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  
  try {
    switch (action) {
      case 'register':
        return await registerUser(event, wxContext)
      case 'getUserInfo':
        return await getUserInfo(event, wxContext)
      case 'updateUserInfo':
        return await updateUserInfo(event, wxContext)
      case 'dailyCheckin':
        return await dailyCheckin(event, wxContext)
      case 'adjustCredits':
        return await adjustCredits(event, wxContext)
      default:
        return {
          success: false,
          message: '未知操作: ' + action
        }
    }
  } catch (error) {
    console.error('用户函数执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器错误'
    }
  }
}

/**
 * 用户注册
 */
async function registerUser(event, wxContext) {
  const { nickname, avatar_url, invite_code } = event
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  try {
    // 检查用户是否已存在
    const existingUser = await db.collection('users')
      .where({ openid: OPENID })
      .get()
    
    if (existingUser.data.length > 0) {
      return {
        success: true,
        data: {
          user_info: existingUser.data[0]
        },
        message: '用户已存在'
      }
    }
    
    // 创建新用户
    const userData = {
      openid: OPENID,
      nickname: nickname || '微信用户',
      avatar_url: avatar_url || '',
      credits: 10, // 新用户赠送10积分
      invite_code: invite_code || '',
      total_earned_credits: 10,
      total_consumed_credits: 0,
      created_at: new Date(),
      updated_at: new Date()
    }
    
    const result = await db.collection('users').add({
      data: userData
    })

    userData._id = result._id

    // 记录注册奖励
    await addCreditRecord({
      user_openid: OPENID,
      type: 'signup_bonus',
      amount: 10,
      description: '新用户注册奖励',
      balance_after: 10
    })

    // 处理邀请奖励
    if (invite_code) {
      await handleInviteReward(invite_code, OPENID)
    }
    
    return {
      success: true,
      data: {
        user_info: userData
      },
      message: '注册成功'
    }
    
  } catch (error) {
    console.error('用户注册失败:', error)
    return {
      success: false,
      message: '注册失败'
    }
  }
}

/**
 * 获取用户信息
 */
async function getUserInfo(event, wxContext) {
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  try {
    const result = await db.collection('users')
      .where({ openid: OPENID })
      .get()
    
    if (result.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }
    
    return {
      success: true,
      data: {
        user_info: result.data[0]
      },
      message: '获取成功'
    }
    
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return {
      success: false,
      message: '获取用户信息失败'
    }
  }
}

/**
 * 更新用户信息
 */
async function updateUserInfo(event, wxContext) {
  const { nickname, avatar_url } = event
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  try {
    const updateData = {
      updated_at: new Date()
    }
    
    if (nickname) updateData.nickname = nickname
    if (avatar_url) updateData.avatar_url = avatar_url
    
    const result = await db.collection('users')
      .where({ openid: OPENID })
      .update({
        data: updateData
      })
    
    if (result.stats.updated === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }
    
    // 获取更新后的用户信息
    const userResult = await db.collection('users')
      .where({ openid: OPENID })
      .get()
    
    return {
      success: true,
      data: {
        user_info: userResult.data[0]
      },
      message: '更新成功'
    }
    
  } catch (error) {
    console.error('更新用户信息失败:', error)
    return {
      success: false,
      message: '更新失败'
    }
  }
}

/**
 * 每日签到
 */
async function dailyCheckin(event, wxContext) {
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  try {
    // 检查今天是否已签到
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const checkinResult = await db.collection('daily_checkins')
      .where({
        user_openid: OPENID,
        checkin_date: db.command.gte(today).and(db.command.lt(tomorrow))
      })
      .get()
    
    if (checkinResult.data.length > 0) {
      return {
        success: false,
        message: '今日已签到'
      }
    }
    
    // 记录签到
    await db.collection('daily_checkins').add({
      data: {
        user_openid: OPENID,
        checkin_date: new Date(),
        reward_credits: 1
      }
    })

    // 获取当前用户信息以获取签到后的积分余额
    const userResult = await db.collection('users')
      .where({ openid: OPENID })
      .get()

    const currentCredits = userResult.data.length > 0 ? (userResult.data[0].credits || 0) : 0

    // 增加用户积分
    await db.collection('users')
      .where({ openid: OPENID })
      .update({
        data: {
          credits: db.command.inc(1),
          total_earned_credits: db.command.inc(1),
          updated_at: new Date()
        }
      })

    // 添加积分记录
    await addCreditRecord({
      user_openid: OPENID,
      type: 'daily_checkin',
      amount: 1,
      description: '每日签到奖励',
      balance_after: currentCredits + 1
    })

    return {
      success: true,
      data: {
        reward_credits: 1
      },
      message: '签到成功，获得1积分'
    }
    
  } catch (error) {
    console.error('签到失败:', error)
    return {
      success: false,
      message: '签到失败'
    }
  }
}

/**
 * 处理邀请奖励
 */
async function handleInviteReward(inviteCode, newUserOpenId) {
  try {
    // 查找邀请人
    const inviterResult = await db.collection('users')
      .where({ invite_code: inviteCode })
      .get()

    if (inviterResult.data.length > 0) {
      const inviter = inviterResult.data[0]

      // 给邀请人奖励积分
      await db.collection('users')
        .doc(inviter._id)
        .update({
          data: {
            credits: db.command.inc(5),
            total_earned_credits: db.command.inc(5),
            updated_at: new Date()
          }
        })

      // 记录积分变动
      await addCreditRecord({
        user_openid: inviter.openid,
        type: 'invite_reward',
        amount: 5,
        description: '邀请好友注册奖励',
        balance_after: (inviter.credits || 0) + 5
      })

      // 记录邀请记录
      await db.collection('invite_records').add({
        data: {
          inviter_openid: inviter.openid,
          invitee_openid: newUserOpenId,
          reward_credits: 5,
          created_at: new Date()
        }
      })
    }

  } catch (error) {
    console.error('处理邀请奖励失败:', error)
  }
}

/**
 * 管理员调整用户积分
 */
async function adjustCredits(event, wxContext) {
  const { userId, adjustType, amount, reason } = event
  const { OPENID } = wxContext

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  // 检查管理员权限
  try {
    const adminCheckResult = await cloud.callFunction({
      name: 'aimodels',
      data: {
        action: 'checkAdminPermission'
      }
    })

    if (!adminCheckResult.result || !adminCheckResult.result.success || !adminCheckResult.result.data.isAdmin) {
      return {
        success: false,
        message: '无管理员权限'
      }
    }
  } catch (error) {
    console.error('检查管理员权限失败:', error)
    return {
      success: false,
      message: '权限验证失败'
    }
  }

  // 验证参数
  if (!userId) {
    return {
      success: false,
      message: '缺少用户ID'
    }
  }

  if (!adjustType || !['add', 'deduct', 'set'].includes(adjustType)) {
    return {
      success: false,
      message: '调整类型无效'
    }
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return {
      success: false,
      message: '积分数量无效'
    }
  }

  try {
    // 获取目标用户信息
    const userResult = await db.collection('users')
      .doc(userId)
      .get()

    if (!userResult.data) {
      return {
        success: false,
        message: '用户不存在'
      }
    }

    const user = userResult.data
    const currentCredits = user.credits || 0
    let newCredits = currentCredits
    let description = reason || '管理员调整'
    let recordType = 'admin_adjust'
    let creditChange = 0

    // 根据调整类型计算新积分
    if (adjustType === 'add') {
      newCredits = currentCredits + amount
      creditChange = amount
      description = `管理员增加: ${reason || '无原因说明'}`
      recordType = 'admin_add'
    } else if (adjustType === 'deduct') {
      newCredits = currentCredits - amount
      creditChange = -amount
      description = `管理员扣除: ${reason || '无原因说明'}`
      recordType = 'admin_deduct'

      if (newCredits < 0) {
        return {
          success: false,
          message: '扣除后积分不能为负数'
        }
      }
    } else if (adjustType === 'set') {
      newCredits = amount
      creditChange = amount - currentCredits
      description = `管理员设置: ${reason || '无原因说明'}`
      recordType = 'admin_set'
    }

    // 更新用户积分
    const updateData = {
      credits: newCredits,
      updated_at: new Date()
    }

    // 更新总获得或总消费积分
    if (creditChange > 0) {
      updateData.total_earned_credits = db.command.inc(creditChange)
    } else if (creditChange < 0) {
      updateData.total_consumed_credits = db.command.inc(Math.abs(creditChange))
    }

    await db.collection('users')
      .doc(userId)
      .update({
        data: updateData
      })

    // 记录积分变动
    await addCreditRecord({
      user_openid: user.openid,
      type: recordType,
      amount: Math.abs(creditChange),
      description: description,
      balance_after: newCredits
    })

    // 获取更新后的用户信息
    const updatedUserResult = await db.collection('users')
      .doc(userId)
      .get()

    return {
      success: true,
      data: {
        user_info: updatedUserResult.data,
        old_credits: currentCredits,
        new_credits: newCredits,
        change: creditChange
      },
      message: '积分调整成功'
    }

  } catch (error) {
    console.error('调整积分失败:', error)
    return {
      success: false,
      message: '调整积分失败: ' + error.message
    }
  }
}