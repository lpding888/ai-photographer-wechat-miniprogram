// 虚拟试衣云函数
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

  console.log('👗 fitting函数被调用, action:', action, 'event keys:', Object.keys(event))

  try {
    switch (action) {
      case 'generate':
        return await generateFitting(event, wxContext)
      case 'getProgress':
        return await getProgress(event, wxContext)
      default:
        return {
          success: false,
          message: '未知操作: ' + action
        }
    }
  } catch (error) {
    console.error('试衣函数执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器错误'
    }
  }
}

/**
 * 生成虚拟试衣
 */
async function generateFitting(event, wxContext) {
  const {
    mode = 'normal',
    model_image,
    clothing_images,
    parameters = {},
    sceneId,
    count = 1,
    referenceWorkId,
    poseDescription,
    posePresetId
  } = event
  const { OPENID } = wxContext

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
    if (!model_image) {
      return {
        success: false,
        message: '请上传个人照片'
      }
    }
    
    if (!clothing_images || Object.keys(clothing_images).length === 0) {
      return {
        success: false,
        message: '请至少上传一件服装'
      }
    }
    
    if (count < 1 || count > 3) {
      return {
        success: false,
        message: '试衣生成数量必须在1-3之间'
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
      type: 'fitting',
      amount: requiredCredits,
      description: `虚拟试衣生成(${count}张)`,
      task_id: taskId,
      balance_after: user.credits - requiredCredits
    })
    
    // 创建任务记录
    await db.collection('task_queue').add({
      data: {
        _id: taskId,
        user_openid: OPENID,
        type: 'fitting',
        status: 'pending',
        state: 'pending',  // 状态机字段
        state_data: {},    // 状态数据
        retry_count: 0,    // 重试计数
        params: {
          model_image,
          clothing_images,
          parameters,
          sceneId,
          count
        },
        created_at: new Date(),
        updated_at: new Date()
      }
    })
    
    // 创建作品记录
    const workResult = await db.collection('works').add({
      data: {
        user_openid: OPENID,
        type: 'fitting',
        status: 'pending',
        task_id: taskId,
        images: [],
        parameters: {
          ...(parameters || {}),
          original_images: [model_image, ...Object.values(clothing_images || {})].filter(Boolean),
          scene_id: sceneId || null,
          count: Number(count) || 1
        },
        is_favorite: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    })
    
    // 异步调用fitting-worker（独立容器，不等待返回）
    console.log('🚀 异步调用fitting-worker（独立容器）:', taskId)

    // 使用fire-and-forget模式：调用worker但不等待完成
    // worker会在独立容器中运行60-120秒，完成后自己更新数据库
    cloud.callFunction({
      name: 'fitting-worker',
      data: {
        taskId: taskId,
        originalEvent: {
          model_image: model_image,
          clothing_images: clothing_images,
          parameters: parameters,
          sceneId: sceneId,
          count: count
        },
        wxContext: { OPENID: OPENID }
      }
    }).then(() => {
      console.log('✅ fitting-worker调用成功（worker将在独立容器中运行）')
    }).catch(async (error) => {
      console.error('⚠️ fitting-worker调用失败:', error.message)

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
      message: '试衣任务已提交，正在生成中...'
    }
    
  } catch (error) {
    console.error('生成试衣作品失败:', error)
    
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
    
    let progressData = {
      status: task.status,
      progress: getProgressByStatus(task.status),
      message: getMessageByStatus(task.status)
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

/**
 * 异步处理试衣任务
 */
async function processFittingTask(taskId, event, wxContext) {
  try {
    console.log('👗 processFittingTask 开始执行, taskId:', taskId)
    // 更新任务状态为处理中
    await db.collection('task_queue')
      .doc(taskId)
      .update({
        data: {
          status: 'processing',
          updated_at: new Date()
        }
      })
    
    // 更新作品状态
    await db.collection('works')
      .where({ task_id: taskId })
      .update({
        data: {
          status: 'processing',
          updated_at: new Date()
        }
      })
    
    // 1. 获取场景信息
    let sceneInfo = {}
    if (event.sceneId) {
      try {
        const sceneResult = await db.collection('scenes')
          .doc(event.sceneId)
          .get()
        if (sceneResult.data) {
          sceneInfo = sceneResult.data
        }
      } catch (error) {
        console.warn('获取场景信息失败，使用默认场景:', error)
      }
    }
    
    // 2. 调用prompt云函数生成提示词
    let generatedPrompt = ''
    try {
      const promptResult = await cloud.callFunction({
        name: 'prompt',
        data: {
          action: 'generatePrompt',
          type: 'fitting',
          parameters: event.parameters || {},
          sceneInfo: sceneInfo
        }
      })
      
      if (promptResult.result && promptResult.result.success) {
        generatedPrompt = promptResult.result.data.prompt
        console.log('生成的试衣提示词:', generatedPrompt)
      } else {
        console.warn('提示词生成失败，使用默认提示词')
        generatedPrompt = generateDefaultFittingPrompt(event.parameters, sceneInfo)
      }
    } catch (error) {
      console.warn('调用提示词云函数失败，使用默认提示词:', error)
      generatedPrompt = generateDefaultFittingPrompt(event.parameters, sceneInfo)
    }
    
    // 3. 选择最佳AI模型
    let selectedModel
    try {
      const modelResult = await cloud.callFunction({
        name: 'aimodels',
        data: {
          action: 'selectBestModel',
          model_type: 'text-to-image',
          capabilities: ['text-to-image', 'image-to-image'],
          preferred_providers: ['stability-ai', 'flux']
        }
      })
      
      if (modelResult.result && modelResult.result.success) {
        selectedModel = modelResult.result.data.selected_model
        console.log('选择的试衣AI模型:', selectedModel.name)
      } else {
        console.warn('AI模型选择失败，使用默认模拟模式')
        selectedModel = null
      }
    } catch (error) {
      console.warn('调用AI模型选择失败:', error)
      selectedModel = null
    }
    
    // 4. 调用AI试衣服务
    let result
    if (selectedModel) {
      // 使用选中的AI模型
      try {
        const aiResult = await cloud.callFunction({
          name: 'aimodels',
          data: {
            action: 'callAIModel',
            model_id: selectedModel._id,
            prompt: generatedPrompt,
            parameters: {
              count: event.count || 1,
              width: 768,
              height: 1024
            },
            images: [
              event.model_image,
              ...Object.values(event.clothing_images || {})
            ]
          }
        })
        
        console.log('🔍 试衣AI调用原始结果:', JSON.stringify(aiResult, null, 2))
        console.log('🔍 试衣AI调用结果分析:', {
          success: !!(aiResult.result && aiResult.result.success),
          hasResult: !!aiResult.result,
          hasData: !!(aiResult.result && aiResult.result.data),
          hasImages: !!(aiResult.result && aiResult.result.data && aiResult.result.data.images),
          imageCount: aiResult.result?.data?.images?.length || 0,
          firstImageUrlLength: aiResult.result?.data?.images?.[0]?.url?.length || 0
        })

        if (aiResult.result && aiResult.result.success && aiResult.result.data && aiResult.result.data.images) {
          result = aiResult.result
          console.log('✅ 试衣AI模型生成成功，图片数量:', aiResult.result.data.images.length)
          console.log('🎨 第一张试衣图片URL前50字符:', aiResult.result.data.images[0]?.url?.substring(0, 50) + '...')
          console.log('🎨 第一张试衣图片URL总长度:', aiResult.result.data.images[0]?.url?.length)
        } else {
          console.warn('❌ 试衣AI模型调用失败，使用模拟模式')
          console.warn('判断条件分析:', {
            hasResult: !!aiResult.result,
            hasSuccess: !!(aiResult.result && aiResult.result.success),
            hasData: !!(aiResult.result && aiResult.result.data),
            hasImages: !!(aiResult.result && aiResult.result.data && aiResult.result.data.images)
          })
          result = await mockFittingGeneration(event, generatedPrompt)
        }
      } catch (error) {
        console.warn('试衣AI模型调用异常，使用模拟模式:', error)
        result = await mockFittingGeneration(event, generatedPrompt)
      }
    } else {
      // 使用模拟模式
      result = await mockFittingGeneration(event, generatedPrompt)
    }
    
    if (result.success) {
      // 处理生成的试衣图片 - 上传到云存储
      let processedImages = []

      if (result.data.images && result.data.images.length > 0) {
        console.log('👗 开始处理试衣图片上传，图片数量:', result.data.images.length)

        for (let i = 0; i < result.data.images.length; i++) {
          const image = result.data.images[i]
          try {
            // 检查是否为base64格式
            if (image.url && image.url.startsWith('data:image/')) {
              console.log(`🎨 处理第${i+1}张试衣图片，格式: base64`)

              // 提取base64数据
              const matches = image.url.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/)
              if (matches) {
                const [, imageFormat, base64Data] = matches

                // 生成文件名
                const timestamp = Date.now()
                const fileName = `fitting_${taskId}_${i+1}_${timestamp}.${imageFormat}`
                const cloudPath = `fitting/${taskId}/${fileName}`

                // 上传到云存储
                const uploadResult = await cloud.uploadFile({
                  cloudPath: cloudPath,
                  fileContent: Buffer.from(base64Data, 'base64')
                })

                if (uploadResult.fileID) {
                  console.log(`✅ 第${i+1}张试衣图片上传成功:`, uploadResult.fileID)
                  processedImages.push({
                    url: uploadResult.fileID,  // 使用云存储ID
                    width: image.width || 768,
                    height: image.height || 1024,
                    metadata: {
                      ...image.metadata,
                      cloud_path: cloudPath,
                      uploaded_at: new Date(),
                      original_format: imageFormat,
                      type: 'fitting'
                    }
                  })
                } else {
                  console.warn(`❌ 第${i+1}张试衣图片上传失败`)
                  processedImages.push(image) // 保留原始数据作为备份
                }
              } else {
                console.warn(`❌ 第${i+1}张试衣图片base64格式错误`)
                processedImages.push(image)
              }
            } else {
              // 非base64格式，直接保存
              console.log(`🎨 第${i+1}张试衣图片为URL格式，直接保存`)
              processedImages.push(image)
            }
          } catch (uploadError) {
            console.error(`❌ 第${i+1}张试衣图片处理失败:`, uploadError)
            processedImages.push(image) // 保留原始数据作为备份
          }
        }
      }

      // 生成成功
      await db.collection('task_queue')
        .doc(taskId)
        .update({
          data: {
            status: 'completed',
            result: { ...result.data, images: processedImages },
            prompt: generatedPrompt, // 保存使用的提示词
            model_used: selectedModel ? selectedModel.name : 'mock', // 保存使用的模型
            updated_at: new Date()
          }
        })

      await db.collection('works')
        .where({ task_id: taskId })
        .update({
          data: {
            status: 'completed',
            images: processedImages, // 使用处理后的图片数据
            updated_at: new Date()
          }
        })
      
    } else {
      // 生成失败
      await db.collection('task_queue')
        .doc(taskId)
        .update({
          data: {
            status: 'failed',
            error_message: result.message,
            updated_at: new Date()
          }
        })
      
      await db.collection('works')
        .where({ task_id: taskId })
        .update({
          data: {
            status: 'failed',
            updated_at: new Date()
          }
        })
      
      // 失败时退还积分
      await db.collection('users')
        .where({ openid: wxContext.OPENID })
        .update({
          data: {
            credits: db.command.inc(event.count || 1),
            total_consumed_credits: db.command.inc(-(event.count || 1)),
            updated_at: new Date()
          }
        })
    }
    
  } catch (error) {
    console.error('处理试衣任务失败:', error)
    
    // 处理异常时标记任务失败
    await db.collection('task_queue')
      .doc(taskId)
      .update({
        data: {
          status: 'failed',
          error_message: '处理异常: ' + error.message,
          updated_at: new Date()
        }
      })
  }
}

/**
 * 模拟AI试衣生成过程
 */
async function mockFittingGeneration(event, prompt, processedImages = []) {
  return new Promise((resolve) => {
    // 模拟AI处理延迟
    setTimeout(() => {
      const mockImages = []
      const count = event.count || 1
      
      // 使用可访问的示例图片URL，为试衣结果使用不同的颜色
      const fittingColors = ['9B59B6', 'E67E22', '27AE60', 'E74C3C', 'F39C12']
      const hasUserImages = processedImages && processedImages.length > 0
      
      for (let i = 0; i < count; i++) {
        const color = fittingColors[i % fittingColors.length]
        const imageText = hasUserImages 
          ? `Virtual+Fitting+${i + 1}+with+${processedImages.length}+ref+images`
          : `AI+Virtual+Fitting+Result+${i + 1}`
          
        mockImages.push({
          url: `https://via.placeholder.com/768x1024/${color}/FFFFFF?text=${imageText}`,
          width: 768,
          height: 1024,
          // 添加模拟的元数据
          metadata: {
            generated_at: new Date().toISOString(),
            prompt_length: prompt ? prompt.length : 0,
            reference_images_count: processedImages.length,
            model: 'mock-fitting-ai-v1.0'
          }
        })
      }
      
      console.log(`模拟试衣生成完成: ${count}张图片，参考图片: ${processedImages.length}张`)
      
      resolve({
        success: true,
        data: {
          images: mockImages,
          prompt: prompt, // 返回使用的提示词
          generation_time: 8000 + Math.random() * 15000,
          reference_images: processedImages,
          processing_info: {
            total_images_generated: count,
            reference_images_used: processedImages.length,
            prompt_processed: !!prompt
          }
        }
      })
    }, 8000) // 8秒后完成
  })
}

/**
 * 生成默认试衣提示词
 */
function generateDefaultFittingPrompt(parameters = {}, sceneInfo = {}) {
  const {
    clothing_type = 'outfit',
    model_description = 'person',
    fit_style = 'natural'
  } = parameters
  
  let prompt = `Virtual try-on of ${clothing_type} on ${model_description}`
  
  if (sceneInfo.background) {
    prompt += ` with ${sceneInfo.background} background`
  }
  
  if (sceneInfo.lighting) {
    prompt += `, ${sceneInfo.lighting} lighting`
  }
  
  prompt += `, realistic fit and draping, ${fit_style} style, high quality rendering, photorealistic result`
  
  return prompt
}

/**
 * 根据状态获取进度百分比
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
 * 根据状态获取提示信息
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
  return `fitting_${timestamp}_${random}`
}

/**
 * 🎭 处理姿势裂变模式（试衣间）
 */
async function handlePoseVariation(event, wxContext, OPENID) {
  const { referenceWorkId, poseDescription, posePresetId, count = 1 } = event

  console.log('🎭 试衣间姿势裂变模式，参考作品ID:', referenceWorkId)

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
      user_openid: OPENID
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
    type: 'fitting_pose_variation',
    amount: requiredCredits,
    description: `试衣姿势裂变(${count}张)`,
    task_id: taskId,
    work_id: referenceWorkId,
    balance_after: user.credits - requiredCredits
  })

  // 10. 准备图片参数
  // fitting的原始图片格式：original_images: [{ type: 'person', fileId: 'xxx' }, { type: 'clothing', clothingType: 'top', fileId: 'xxx' }]
  const generatedImage = originalWork.images[0].url  // 已生成的试衣图
  const allOriginalImages = originalWork.original_images || []

  // 🎯 提取人物图和服装图，并过滤掉可能混入的生成图
  let modelImageFileId = null
  const clothingImageFileIds = []

  allOriginalImages.forEach(img => {
    if (!img || !img.fileId || typeof img.fileId !== 'string') return

    // 🎯 过滤条件：排除生成的图片路径（包含 /photography/ 或 /fitting/）
    const isGenerated = img.fileId.includes('/photography/') || img.fileId.includes('/fitting/')
    if (isGenerated) {
      console.log('⚠️ 过滤掉混入的生成图:', img.fileId.substring(img.fileId.lastIndexOf('/') + 1))
      return
    }

    if (img.type === 'person') {
      modelImageFileId = img.fileId
    } else if (img.type === 'clothing') {
      clothingImageFileIds.push(img.fileId)
    }
  })

  // 构建姿势裂变的图片数组：[生成图, 人物图, 服装图1, 服装图2, ...]
  const imagesForVariation = [generatedImage, modelImageFileId, ...clothingImageFileIds].filter(Boolean)

  console.log('📸 试衣姿势裂变图片参数:', {
    generatedImage: generatedImage,
    modelImage: modelImageFileId,
    allOriginalImagesCount: allOriginalImages.length,
    filteredClothingImagesCount: clothingImageFileIds.length,
    totalImages: imagesForVariation.length
  })

  // 11. 重建clothing_images对象（fitting-worker需要的格式）
  const clothingImages = {}
  const clothingTypes = ['top', 'bottom', 'shoes', 'accessory']
  originalImages.forEach((img, index) => {
    if (img.type === 'clothing' && img.fileId) {
      const type = img.clothingType || clothingTypes[index - 1] || `item${index}`
      clothingImages[type] = img.fileId
    }
  })

  // 12. 创建任务记录
  await db.collection('task_queue').add({
    data: {
      _id: taskId,
      user_openid: String(OPENID || ''),
      type: 'fitting',
      mode: 'pose_variation',
      status: 'pending',
      state: 'pending',
      state_data: {},
      retry_count: 0,
      params: {
        model_image: modelImageFileId,
        clothing_images: clothingImages,
        parameters: originalWork.parameters || {},
        sceneId: originalWork.scene_id || null,
        scene_info: originalWork.scene_info || null,
        count: Number(count) || 1,
        pose_description: finalPoseDescription,
        reference_work_id: referenceWorkId
      },
      created_at: new Date(),
      updated_at: new Date()
    }
  })

  // 13. 创建新作品记录
  const workResult = await db.collection('works').add({
    data: {
      user_openid: String(OPENID || ''),
      type: 'fitting',
      status: 'pending',
      task_id: String(taskId || ''),
      images: [],
      parameters: originalWork.parameters || {},
      original_images: originalWork.original_images || [],
      scene_id: originalWork.scene_id || null,
      scene_info: originalWork.scene_info || null,
      reference_work_id: referenceWorkId,
      variation_type: 'pose',
      pose_description: finalPoseDescription,
      is_favorite: false,
      created_at: new Date(),
      updated_at: new Date()
    }
  })

  // 14. 调用fitting-worker
  console.log('🚀 异步调用fitting-worker（姿势裂变）:', taskId)

  cloud.callFunction({
    name: 'fitting-worker',
    data: {
      taskId: taskId,
      originalEvent: {
        model_image: modelImageFileId,
        clothing_images: clothingImages,
        parameters: originalWork.parameters || {},
        sceneId: originalWork.scene_id || null,
        sceneInfo: originalWork.scene_info || null,
        count: count,
        mode: 'pose_variation',
        pose_description: finalPoseDescription,
        reference_images: imagesForVariation  // 传递完整的参考图片数组
      },
      wxContext: { OPENID: OPENID }
    }
  }).then(() => {
    console.log('✅ fitting-worker调用成功（姿势裂变）')
  }).catch(async (error) => {
    console.error('⚠️ fitting-worker调用失败:', error.message)

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