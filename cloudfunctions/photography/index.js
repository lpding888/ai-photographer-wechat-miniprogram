// 服装摄影云函数
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

  console.log('📸 photography函数被调用, action:', action, 'event keys:', Object.keys(event))

  try {
    switch (action) {
      case 'generate':
        return await generatePhotography(event, wxContext)
      case 'getProgress':
        return await getProgress(event, wxContext)
      default:
        return {
          success: false,
          message: '未知操作: ' + action
        }
    }
  } catch (error) {
    console.error('摄影函数执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器错误'
    }
  }
}

/**
 * 生成服装摄影
 */
async function generatePhotography(event, wxContext) {
  const { mode = 'normal', images, parameters, sceneId, count = 1, referenceWorkId, poseDescription, posePresetId } = event
  const OPENID = wxContext && wxContext.OPENID ? wxContext.OPENID : null

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  try {
    // 🎭 姿势裂变模式：从原作品读取数据
    if (mode === 'pose_variation') {
      return await handlePoseVariation(event, wxContext, OPENID)
    }

    // 普通模式：验证参数
    if (!images || !Array.isArray(images) || images.length === 0) {
      return {
        success: false,
        message: '请上传服装图片'
      }
    }
    
    if (count < 1 || count > 5) {
      return {
        success: false,
        message: '生成数量必须在1-5之间'
      }
    }
    
    // 检查用户积分
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
    const requiredCredits = count
    
    if (user.credits < requiredCredits) {
      return {
        success: false,
        message: `积分不足，需要${requiredCredits}积分，当前${user.credits}积分`
      }
    }
    
    // 扣除积分
    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          credits: db.command.inc(-requiredCredits),
          total_consumed_credits: db.command.inc(requiredCredits),
          updated_at: new Date()
        }
      })

    // 生成任务ID
    const taskId = generateTaskId()

    // 记录积分消费
    await addCreditRecord({
      user_openid: OPENID,
      type: 'photography',
      amount: requiredCredits,
      description: `AI摄影生成(${count}张)`,
      task_id: taskId,
      balance_after: user.credits - requiredCredits
    })
    
    // 创建任务记录 - 安全处理可能为空的字段
    await db.collection('task_queue').add({
      data: {
        _id: taskId,
        user_openid: String(OPENID || ''),
        type: 'photography',
        status: 'pending',
        state: 'pending',  // 状态机字段
        state_data: {},    // 状态数据
        retry_count: 0,    // 重试计数
        params: {
          images: images || [],
          parameters: parameters || {},
          sceneId: sceneId || null,
          count: Number(count) || 1
        },
        created_at: new Date(),
        updated_at: new Date()
      }
    })
    
    // 创建作品记录 - 安全处理可能为空的字段
    const workResult = await db.collection('works').add({
      data: {
        user_openid: String(OPENID || ''),
        type: 'photography',
        status: 'pending',
        task_id: String(taskId || ''),
        images: [],
        parameters: {
          ...(parameters || {}),
          original_images: images || [],
          scene_id: sceneId || null,
          count: Number(count) || 1
        },
        is_favorite: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    })
    
    // 异步调用photography-worker（独立容器，不等待返回）
    console.log('🚀 异步调用photography-worker（独立容器）:', taskId)

    // 使用fire-and-forget模式：调用worker但不等待完成
    // worker会在独立容器中运行60-120秒，完成后自己更新数据库
    cloud.callFunction({
      name: 'photography-worker',
      data: {
        taskId: taskId,
        originalEvent: {
          images: images,
          parameters: parameters,
          sceneId: sceneId,
          count: count
        },
        wxContext: { OPENID: OPENID }
      }
    }).then(() => {
      console.log('✅ photography-worker调用成功（worker将在独立容器中运行）')
    }).catch(async (error) => {
      console.error('⚠️ photography-worker调用失败:', error.message)

      // 区分超时错误和真正的启动失败
      const isTimeout = error.message && (
        error.message.includes('ESOCKETTIMEDOUT') ||
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT')
      )

      if (isTimeout) {
        console.log('⚠️ Worker调用超时，但worker可能仍在独立容器中运行，不标记失败')
        console.log('💡 提示：worker会在完成后自己更新任务状态')
        return // 超时不算失败，让worker自己处理
      }

      // 真正的启动错误（如配额不足、权限错误）才标记失败
      console.log('❌ Worker真正启动失败（非超时），标记任务失败')

      db.collection('users').doc(user._id).update({
        data: {
          credits: db.command.inc(requiredCredits),
          total_consumed_credits: db.command.inc(-requiredCredits),
          updated_at: new Date()
        }
      }).then(() => {
        console.log('💰 已退还积分:', requiredCredits)
      }).catch(err => {
        console.error('退还积分失败:', err)
      })

      // 标记任务失败
      db.collection('task_queue').doc(taskId).update({
        data: {
          status: 'failed',
          error: 'Worker启动失败: ' + error.message,
          updated_at: new Date()
        }
      })

      db.collection('works').where({ task_id: taskId }).update({
        data: {
          status: 'failed',
          updated_at: new Date()
        }
      })
    })

    return {
      success: true,
      data: {
        task_id: taskId,
        work_id: workResult._id
      },
      message: '任务已提交，正在生成中...'
    }
    
  } catch (error) {
    console.error('生成摄影作品失败:', error)
    
    // 如果扣费后出错，需要退还积分
    try {
      await db.collection('users')
        .where({ openid: OPENID })
        .update({
          data: {
            credits: db.command.inc(count),
            total_consumed_credits: db.command.inc(-count),
            updated_at: new Date()
          }
        })
    } catch (refundError) {
      console.error('退还积分失败:', refundError)
    }
    
    return {
      success: false,
      message: '生成失败'
    }
  }
}

/**
 * 获取生成进度
 */
async function getProgress(event, wxContext) {
  const { task_id } = event
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  if (!task_id) {
    return {
      success: false,
      message: '任务ID不能为空'
    }
  }
  
  try {
    // 查询任务状态
    const taskResult = await db.collection('task_queue')
      .where({
        _id: task_id,
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
        task_id: task_id,
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
        task_id: task_id
      }
    }

    // 如果是AI处理中状态，提供更多信息
    if (task.status === 'ai_processing') {
      progressData.ai_model = task.ai_model
      progressData.processing_time = task.updated_at
    }
    
    return {
      success: true,
      data: progressData
    }
    
  } catch (error) {
    console.error('获取进度失败:', error)
    return {
      success: false,
      message: '获取进度失败'
    }
  }
}

// 注意：此函数已被废弃并删除，实际处理逻辑已迁移至photography-worker云函数
// 所有AI生成都应该通过真实的AI模型进行，不再支持模拟模式

/**
 * 生成默认摄影提示词
 */
function generateDefaultPhotographyPrompt(parameters = {}, sceneInfo = {}) {
  const {
    gender = 'female',
    age = 25,
    nationality = 'asian',
    skin_tone = 'medium',
    clothing_description = 'fashionable outfit',
    pose_type = 'dynamic',
    lighting_style = 'professional studio lighting'
  } = parameters
  
  let prompt = `A professional fashion photography of ${gender} model, age ${age}, ${nationality} ethnicity, ${skin_tone} skin tone, wearing ${clothing_description}`
  
  if (sceneInfo.name) {
    prompt += `, in ${sceneInfo.name} setting`
  }
  
  prompt += `, ${pose_type} pose, ${lighting_style}, high fashion, editorial style, 8K resolution, sharp focus`
  
  return prompt
}

/**
 * 根据状态获取进度百分比
 */
/**
 * 根据状态机state字段计算精确进度
 */
function getProgressByState(state, status) {
  // 优先使用详细状态
  const stateProgressMap = {
    'pending': 10,
    'downloading': 20,
    'downloaded': 25,
    'ai_calling': 30,
    'ai_processing': 70,  // AI生成占大部分时间
    'ai_completed': 85,
    'watermarking': 90,
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
    'watermarking': '正在添加水印...',
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

/**
 * 【已废弃】根据业务status计算进度（保留用于兼容）
 */
function getProgressByStatus(status) {
  const progressMap = {
    'pending': 10,
    'processing': 60,
    'completed': 100,
    'failed': 0
  }
  return progressMap[status] || 0
}

/**
 * 【已废弃】根据业务status获取提示（保留用于兼容）
 */
function getMessageByStatus(status) {
  const messageMap = {
    'pending': '任务排队中...',
    'processing': '正在生成中...',
    'completed': '生成完成！',
    'failed': '生成失败'
  }
  return messageMap[status] || '未知状态'
}

/**
 * 生成任务ID
 */
function generateTaskId() {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9)
  return `photo_${timestamp}_${random}`
}

/**
 * 🎭 处理姿势裂变模式
 */
async function handlePoseVariation(event, wxContext, OPENID) {
  const { referenceWorkId, poseDescription, posePresetId, count = 1 } = event

  console.log('🎭 姿势裂变模式，参考作品ID:', referenceWorkId)

  // 1. 验证参数
  if (!referenceWorkId) {
    return {
      success: false,
      message: '缺少参考作品ID'
    }
  }

  // 2. 查询原作品
  const originalWorkResult = await db.collection('works')
    .where({
      _id: referenceWorkId,
      user_openid: OPENID  // 确保是用户自己的作品
    })
    .get()

  if (originalWorkResult.data.length === 0) {
    return {
      success: false,
      message: '参考作品不存在或无权访问'
    }
  }

  const originalWork = originalWorkResult.data[0]

  // 3. 验证原作品必须已完成
  if (originalWork.status !== 'completed') {
    return {
      success: false,
      message: '参考作品还未生成完成，无法进行姿势裂变'
    }
  }

  // 4. 验证原作品有生成的图片
  if (!originalWork.images || originalWork.images.length === 0) {
    return {
      success: false,
      message: '参考作品没有生成的图片'
    }
  }

  // 5. 获取姿势描述
  let finalPoseDescription = poseDescription

  if (!finalPoseDescription && posePresetId) {
    // 从数据库读取预设姿势
    try {
      const poseResult = await db.collection('pose_presets')
        .doc(posePresetId)
        .get()

      if (poseResult.data && poseResult.data.is_active) {
        finalPoseDescription = poseResult.data.prompt
        console.log('✅ 使用预设姿势:', poseResult.data.name)
      }
    } catch (error) {
      console.error('读取预设姿势失败:', error)
    }
  }

  if (!finalPoseDescription) {
    return {
      success: false,
      message: '缺少姿势描述'
    }
  }

  // 6. 检查用户积分
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
  const requiredCredits = count

  if (user.credits < requiredCredits) {
    return {
      success: false,
      message: `积分不足，需要${requiredCredits}积分，当前${user.credits}积分`
    }
  }

  // 7. 扣除积分
  await db.collection('users')
    .doc(user._id)
    .update({
      data: {
        credits: db.command.inc(-requiredCredits),
        total_consumed_credits: db.command.inc(requiredCredits),
        updated_at: new Date()
      }
    })

  // 8. 生成新任务ID
  const taskId = generateTaskId()

  // 9. 记录积分消费
  await addCreditRecord({
    user_openid: OPENID,
    type: 'photography_pose_variation',
    amount: requiredCredits,
    description: `姿势裂变(${count}张)`,
    task_id: taskId,
    work_id: referenceWorkId,
    balance_after: user.credits - requiredCredits
  })

  // 10. 准备图片参数：[生成的模特图, 原始服装图1, 原始服装图2, ...]
  const modelImage = originalWork.images[0].url  // 已生成的模特图

  // 🎯 过滤掉之前裂变时混入的生成图，只保留真正的服装原图
  const allOriginalImages = originalWork.original_images || []
  const clothingImages = allOriginalImages.filter(imageUrl => {
    // 过滤条件：排除生成的图片路径（包含 /photography/ 或 /fitting/）
    if (typeof imageUrl !== 'string') return false
    const isGenerated = imageUrl.includes('/photography/') || imageUrl.includes('/fitting/')
    return !isGenerated  // 只保留非生成的图片（即服装原图）
  })

  const imagesForVariation = [modelImage, ...clothingImages]

  console.log('📸 姿势裂变图片参数:', {
    modelImage: modelImage,
    allOriginalImagesCount: allOriginalImages.length,
    filteredClothingImagesCount: clothingImages.length,
    totalImages: imagesForVariation.length,
    clothingImages: clothingImages.map(url => url.substring(url.lastIndexOf('/') + 1))
  })

  // 11. 创建任务记录
  await db.collection('task_queue').add({
    data: {
      _id: taskId,
      user_openid: String(OPENID || ''),
      type: 'photography',
      mode: 'pose_variation',  // 标记为姿势裂变
      status: 'pending',
      state: 'pending',
      state_data: {},
      retry_count: 0,
      params: {
        images: imagesForVariation,
        parameters: originalWork.parameters || {},
        sceneId: originalWork.scene_id || null,
        scene_info: originalWork.scene_info || null,  // 直接传递场景信息
        count: Number(count) || 1,
        pose_description: finalPoseDescription,  // 🎭 姿势描述
        reference_work_id: referenceWorkId  // 记录来源
      },
      created_at: new Date(),
      updated_at: new Date()
    }
  })

  // 12. 创建新作品记录（标记为姿势裂变作品）
  const workResult = await db.collection('works').add({
    data: {
      user_openid: String(OPENID || ''),
      type: 'photography',
      status: 'pending',
      task_id: String(taskId || ''),
      images: [],
      parameters: originalWork.parameters || {},
      original_images: originalWork.original_images || [],  // 继承原始服装图
      scene_id: originalWork.scene_id || null,
      scene_info: originalWork.scene_info || null,
      reference_work_id: referenceWorkId,  // 🎯 标记参考作品
      variation_type: 'pose',  // 🎯 标记为姿势裂变
      pose_description: finalPoseDescription,  // 🎯 保存姿势描述
      is_favorite: false,
      created_at: new Date(),
      updated_at: new Date()
    }
  })

  // 13. 调用photography-worker
  console.log('🚀 异步调用photography-worker（姿势裂变）:', taskId)

  cloud.callFunction({
    name: 'photography-worker',
    data: {
      taskId: taskId,
      originalEvent: {
        images: imagesForVariation,  // [模特图, 服装图1, 服装图2, ...]
        parameters: originalWork.parameters || {},
        sceneId: originalWork.scene_id || null,
        sceneInfo: originalWork.scene_info || null,  // 直接传递
        count: count,
        mode: 'pose_variation',  // 🎭 传递模式
        pose_description: finalPoseDescription  // 🎭 传递姿势描述
      },
      wxContext: { OPENID: OPENID }
    }
  }).then(() => {
    console.log('✅ photography-worker调用成功（姿势裂变）')
  }).catch(async (error) => {
    console.error('⚠️ photography-worker调用失败:', error.message)

    const isTimeout = error.message && (
      error.message.includes('ESOCKETTIMEDOUT') ||
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT')
    )

    if (isTimeout) {
      console.log('⚠️ Worker调用超时，但worker可能仍在运行')
    } else {
      console.error('❌ Worker真正失败，更新任务状态')
      await db.collection('task_queue').doc(taskId).update({
        data: {
          status: 'failed',
          error: 'Worker启动失败: ' + error.message,
          updated_at: new Date()
        }
      })

      await db.collection('works').doc(workResult._id).update({
        data: {
          status: 'failed',
          updated_at: new Date()
        }
      })
    }
  })

  return {
    success: true,
    data: {
      task_id: taskId,
      work_id: workResult._id,
      reference_work_id: referenceWorkId
    },
    message: '姿势裂变任务已提交，正在生成中...'
  }
}