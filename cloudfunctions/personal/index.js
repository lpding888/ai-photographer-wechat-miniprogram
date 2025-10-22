// 个人功能云函数 - 统一处理个人试衣间和全球旅行
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

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
        created_at: new Date()
      }
    })
  } catch (error) {
    console.error('添加积分记录失败:', error)
  }
}

exports.main = async (event, context) => {
  const { action, type } = event
  const wxContext = cloud.getWXContext()

  console.log('✨ personal函数被调用, action:', action, 'type:', type, 'event keys:', Object.keys(event))

  try {
    switch (action) {
      case 'create':
        // 创建任务（个人试衣间或全球旅行）
        return await createTask(event, wxContext)

      case 'getProgress':
        // 查询任务进度
        return await getProgress(event, wxContext)

      default:
        return {
          success: false,
          message: '未知操作: ' + action
        }
    }
  } catch (error) {
    console.error('personal函数执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器错误'
    }
  }
}

/**
 * 创建任务
 */
async function createTask(event, wxContext) {
  const { type, data } = event
  const { OPENID } = wxContext

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  console.log('创建任务, type:', type, 'OPENID:', OPENID)

  try {
    // 根据type分发到不同的处理函数
    switch (type) {
      case 'fitting-personal':
        return await createFittingPersonalTask(data, OPENID)

      case 'travel':
        return await createTravelTask(data, OPENID)

      default:
        return {
          success: false,
          message: '未知任务类型: ' + type
        }
    }
  } catch (error) {
    console.error('创建任务失败:', error)
    return {
      success: false,
      message: error.message || '创建任务失败'
    }
  }
}

/**
 * 创建个人试衣间任务
 */
async function createFittingPersonalTask(data, openid) {
  const {
    userPhoto,
    bodyParams,
    clothingImages,
    clothingDescription,
    background
  } = data

  // 参数验证
  if (!userPhoto || !userPhoto.fileId) {
    return {
      success: false,
      message: '请上传个人照片'
    }
  }

  if (!bodyParams) {
    return {
      success: false,
      message: '请填写身体参数'
    }
  }

  const hasImages = clothingImages && clothingImages.length > 0
  const hasDescription = clothingDescription && clothingDescription.trim()
  if (!hasImages && !hasDescription) {
    return {
      success: false,
      message: '请上传服装图片或输入服装描述'
    }
  }

  // 查询用户积分
  const userResult = await db.collection('users').where({
    openid: openid
  }).get()

  if (!userResult.data || userResult.data.length === 0) {
    return {
      success: false,
      message: '用户不存在'
    }
  }

  const user = userResult.data[0]
  const currentCredits = user.credits || 0

  // 检查积分（1张照片=1积分）
  const costCredits = 1

  if (currentCredits < costCredits) {
    return {
      success: false,
      message: '积分不足，请先充值',
      code: 'INSUFFICIENT_CREDITS'
    }
  }

  // 扣除积分
  await db.collection('users').where({
    openid: openid
  }).update({
    data: {
      credits: _.inc(-costCredits)
    }
  })

  const newBalance = currentCredits - costCredits

  // 创建任务ID
  const taskId = `fitting_personal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // 创建任务队列记录（先创建，方便worker查询）
  await db.collection('task_queue').add({
    data: {
      _id: taskId,
      user_openid: String(openid || ''),
      type: 'fitting-personal',
      status: 'pending',
      state: 'pending',  // 状态机字段
      state_data: {},    // 状态数据
      retry_count: 0,    // 重试计数
      params: {
        userPhoto,
        bodyParams,
        clothingImages: clothingImages || [],
        clothingDescription: clothingDescription || '',
        background: background || 'studio'
      },
      created_at: new Date(),
      updated_at: new Date()
    }
  })

  // 创建work记录
  const workResult = await db.collection('works').add({
    data: {
      user_openid: String(openid || ''),
      task_id: String(taskId || ''),
      type: 'fitting-personal',
      status: 'pending',
      title: '个人试衣照片',
      description: `身高${bodyParams.height}cm，体重${bodyParams.weight}kg`,
      parameters: {
        bodyParams,
        background,
        clothingDescription,
        count: 1
      },
      original_images: [
        userPhoto.fileId,
        ...(clothingImages || []).map(img => img.fileId)
      ].filter(Boolean),
      images: [],
      is_favorite: false,
      created_at: new Date(),
      updated_at: new Date()
    }
  })

  const workId = workResult._id

  // 添加积分消费记录
  await addCreditRecord({
    user_openid: openid,
    type: 'fitting-personal',
    amount: costCredits,
    description: '个人试衣间',
    work_id: workId,
    task_id: taskId,
    balance_after: newBalance
  })

  // 异步调用personal-worker（独立容器，不等待返回）
  console.log('🚀 异步调用personal-worker（个人试衣）:', taskId)

  cloud.callFunction({
    name: 'personal-worker',
    data: {
      taskId: taskId,
      type: 'fitting-personal',
      originalEvent: {
        userPhoto,
        bodyParams,
        clothingImages: clothingImages || [],
        clothingDescription: clothingDescription || '',
        background: background || 'studio'
      },
      wxContext: { OPENID: openid }
    }
  }).then(() => {
    console.log('✅ personal-worker调用成功（个人试衣）')
  }).catch(async (error) => {
    console.error('⚠️ personal-worker调用失败:', error.message)

    // 区分超时错误和真正的启动失败
    const isTimeout = error.message && (
      error.message.includes('ESOCKETTIMEDOUT') ||
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT')
    )

    if (isTimeout) {
      console.log('⚠️ Worker调用超时，但worker可能仍在独立容器中运行')
      return // 超时不算失败，让worker自己处理
    }

    // 真正的启动失败才标记失败并退款
    console.error('❌ Worker真正失败，退还积分')

    await db.collection('users').where({ openid: openid }).update({
      data: {
        credits: _.inc(costCredits),
        updated_at: new Date()
      }
    })

    await db.collection('task_queue').doc(taskId).update({
      data: {
        status: 'failed',
        error: 'Worker启动失败: ' + error.message,
        updated_at: new Date()
      }
    })

    await db.collection('works').doc(workId).update({
      data: {
        status: 'failed',
        updated_at: new Date()
      }
    })
  })

  console.log('✅ 个人试衣任务创建成功:', taskId)

  return {
    success: true,
    data: {
      taskId,
      workId,
      creditsUsed: costCredits,
      creditsRemaining: newBalance
    },
    message: '任务已提交，正在生成中...'
  }
}

/**
 * 创建全球旅行任务
 */
async function createTravelTask(data, openid) {
  const {
    userPhoto,
    destination,
    customDescription
  } = data

  // 参数验证
  if (!userPhoto || !userPhoto.fileId) {
    return {
      success: false,
      message: '请上传个人照片'
    }
  }

  if (!destination || !destination.id) {
    return {
      success: false,
      message: '请选择旅行目的地'
    }
  }

  // 查询用户积分
  const userResult = await db.collection('users').where({
    openid: openid
  }).get()

  if (!userResult.data || userResult.data.length === 0) {
    return {
      success: false,
      message: '用户不存在'
    }
  }

  const user = userResult.data[0]
  const currentCredits = user.credits || 0

  // 检查积分（1张照片=1积分）
  const costCredits = 1

  if (currentCredits < costCredits) {
    return {
      success: false,
      message: '积分不足，请先充值',
      code: 'INSUFFICIENT_CREDITS'
    }
  }

  // 扣除积分
  await db.collection('users').where({
    openid: openid
  }).update({
    data: {
      credits: _.inc(-costCredits)
    }
  })

  const newBalance = currentCredits - costCredits

  // 创建任务ID
  const taskId = `travel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // 创建任务队列记录（先创建，方便worker查询）
  await db.collection('task_queue').add({
    data: {
      _id: taskId,
      user_openid: String(openid || ''),
      type: 'travel',
      status: 'pending',
      state: 'pending',  // 状态机字段
      state_data: {},    // 状态数据
      retry_count: 0,    // 重试计数
      params: {
        userPhoto,
        destination,
        customDescription: customDescription || ''
      },
      created_at: new Date(),
      updated_at: new Date()
    }
  })

  // 创建work记录
  const workResult = await db.collection('works').add({
    data: {
      user_openid: String(openid || ''),
      task_id: String(taskId || ''),
      type: 'travel',
      status: 'pending',
      title: `全球旅行 - ${destination.name}`,
      description: destination.country,
      parameters: {
        destination,
        customDescription: customDescription || '',
        count: 1
      },
      original_images: [userPhoto.fileId].filter(Boolean),
      images: [],
      is_favorite: false,
      created_at: new Date(),
      updated_at: new Date()
    }
  })

  const workId = workResult._id

  // 添加积分消费记录
  await addCreditRecord({
    user_openid: openid,
    type: 'travel',
    amount: costCredits,
    description: `全球旅行 - ${destination.name}`,
    work_id: workId,
    task_id: taskId,
    balance_after: newBalance
  })

  // 异步调用personal-worker（独立容器，不等待返回）
  console.log('🚀 异步调用personal-worker（全球旅行）:', taskId)

  cloud.callFunction({
    name: 'personal-worker',
    data: {
      taskId: taskId,
      type: 'travel',
      originalEvent: {
        userPhoto,
        destination,
        customDescription: customDescription || ''
      },
      wxContext: { OPENID: openid }
    }
  }).then(() => {
    console.log('✅ personal-worker调用成功（全球旅行）')
  }).catch(async (error) => {
    console.error('⚠️ personal-worker调用失败:', error.message)

    // 区分超时错误和真正的启动失败
    const isTimeout = error.message && (
      error.message.includes('ESOCKETTIMEDOUT') ||
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT')
    )

    if (isTimeout) {
      console.log('⚠️ Worker调用超时，但worker可能仍在独立容器中运行')
      return // 超时不算失败，让worker自己处理
    }

    // 真正的启动失败才标记失败并退款
    console.error('❌ Worker真正失败，退还积分')

    await db.collection('users').where({ openid: openid }).update({
      data: {
        credits: _.inc(costCredits),
        updated_at: new Date()
      }
    })

    await db.collection('task_queue').doc(taskId).update({
      data: {
        status: 'failed',
        error: 'Worker启动失败: ' + error.message,
        updated_at: new Date()
      }
    })

    await db.collection('works').doc(workId).update({
      data: {
        status: 'failed',
        updated_at: new Date()
      }
    })
  })

  console.log('✅ 全球旅行任务创建成功:', taskId)

  return {
    success: true,
    data: {
      taskId,
      workId,
      creditsUsed: costCredits,
      creditsRemaining: newBalance
    },
    message: '任务已提交，正在生成中...'
  }
}

/**
 * 查询任务进度
 */
async function getProgress(event, wxContext) {
  const { taskId } = event
  const { OPENID } = wxContext

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  if (!taskId) {
    return {
      success: false,
      message: '缺少任务ID'
    }
  }

  try {
    // 查询任务状态
    const taskResult = await db.collection('task_queue')
      .where({
        _id: taskId,
        user_openid: OPENID
      })
      .get()

    if (taskResult.data.length === 0) {
      return {
        success: false,
        message: '任务不存在'
      }
    }

    const task = taskResult.data[0]

    // 查询作品信息
    const workResult = await db.collection('works')
      .where({
        task_id: taskId,
        user_openid: OPENID
      })
      .get()

    // 使用state字段计算精确进度
    let progressData = {
      status: task.status,
      state: task.state,
      progress: getProgressByState(task.state, task.status),
      message: getMessageByState(task.state, task.status)
    }

    // 如果任务完成，返回生成的图片
    if (task.status === 'completed' && workResult.data.length > 0) {
      const work = workResult.data[0]
      progressData.images = work.images
      progressData.work_id = work._id
    }

    // 如果任务失败，返回详细错误信息
    if (task.status === 'failed') {
      progressData.error_message = task.error_message || task.error || '生成失败，请重试'
      progressData.error_details = {
        task_error: task.error_message,
        timestamp: task.updated_at,
        task_id: taskId
      }
    }

    // 如果是AI处理中状态，提供更多信息
    if (task.state === 'ai_processing' || task.state === 'ai_calling') {
      progressData.ai_model = task.ai_model
      progressData.processing_time = task.updated_at
    }

    return {
      success: true,
      data: progressData
    }
  } catch (error) {
    console.error('查询进度失败:', error)
    return {
      success: false,
      message: error.message || '查询失败'
    }
  }
}

/**
 * 根据状态机state字段计算精确进度
 */
function getProgressByState(state, status) {
  // 优先使用详细状态
  const stateProgressMap = {
    'pending': 10,
    'downloading': 20,
    'downloaded': 30,
    'ai_calling': 40,
    'ai_processing': 70,  // AI生成占大部分时间
    'ai_completed': 85,
    'uploading': 95,
    'completed': 100,
    'failed': 0
  }

  if (state && stateProgressMap[state] !== undefined) {
    return stateProgressMap[state]
  }

  // 回退到业务状态
  const statusProgressMap = {
    'pending': 10,
    'processing': 60,
    'completed': 100,
    'failed': 0
  }
  return statusProgressMap[status] || 0
}

/**
 * 根据状态机state字段获取提示信息
 */
function getMessageByState(state, status) {
  // 优先使用详细状态
  const stateMessageMap = {
    'pending': '任务排队中...',
    'downloading': '正在下载图片...',
    'downloaded': '图片下载完成',
    'ai_calling': '正在调用AI...',
    'ai_processing': '正在生成中...',
    'ai_completed': 'AI生成完成',
    'uploading': '正在上传图片...',
    'completed': '生成完成！',
    'failed': '生成失败'
  }

  if (state && stateMessageMap[state]) {
    return stateMessageMap[state]
  }

  // 回退到业务状态
  const statusMessageMap = {
    'pending': '任务排队中...',
    'processing': '正在生成中...',
    'completed': '生成完成！',
    'failed': '生成失败'
  }
  return statusMessageMap[status] || '未知状态'
}
