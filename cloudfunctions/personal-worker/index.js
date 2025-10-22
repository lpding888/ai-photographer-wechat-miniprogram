// 个人功能处理器云函数 - 统一处理个人试衣间和全球旅行
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { taskId, type, originalEvent, wxContext } = event

  console.log('🚀 personal-worker 开始处理任务:', taskId, 'type:', type)

  try {
    if (type === 'fitting-personal') {
      await processFittingPersonalTask(taskId, originalEvent, wxContext)
    } else if (type === 'travel') {
      await processTravelTask(taskId, originalEvent, wxContext)
    } else {
      throw new Error('未知任务类型: ' + type)
    }

    console.log('✅ personal-worker 任务处理完成:', taskId)
    return { success: true, taskId }
  } catch (error) {
    console.error('❌ personal-worker 任务处理失败:', taskId, error)
    return { success: false, taskId, error: error.message }
  }
}

/**
 * 处理个人试衣间任务
 */
async function processFittingPersonalTask(taskId, event, wxContext) {
  // 🚨 设置整体超时控制
  let timeoutTriggered = false
  const overallTimeout = setTimeout(async () => {
    timeoutTriggered = true
    console.error('⏰ 个人试衣任务处理超时(55秒)')
    try {
      await updateTaskFailed(taskId, '任务处理超时(55秒)，可能是AI服务响应缓慢')
      console.log('✅ 超时状态更新完成')
    } catch (updateError) {
      console.error('❌ 超时状态更新失败:', updateError)
    }
  }, 55000) // 55秒后触发

  try {
    console.log('👔 开始处理个人试衣任务:', taskId)

    // 更新状态为处理中
    await updateTaskState(taskId, 'processing', 'downloading')

    // 1. 提取参数
    const { userPhoto, bodyParams, clothingImages, clothingDescription, background } = event

    if (!userPhoto || !userPhoto.fileId) {
      throw new Error('缺少用户照片')
    }

    console.log('📋 任务参数:', {
      bodyParams,
      clothingImagesCount: clothingImages ? clothingImages.length : 0,
      clothingDescription: clothingDescription ? '有' : '无',
      background
    })

    // 2. 下载并处理图片
    await updateTaskState(taskId, 'processing', 'downloading')

    const processedImages = []

    // 处理用户照片
    try {
      const userImageData = await downloadAndConvertImage(userPhoto.fileId)
      processedImages.push({
        type: 'user',
        ...userImageData
      })
      console.log('✅ 用户照片处理完成')
    } catch (error) {
      console.error('❌ 用户照片处理失败:', error)
      throw new Error('用户照片处理失败')
    }

    // 处理服装图片
    if (clothingImages && clothingImages.length > 0) {
      for (let i = 0; i < clothingImages.length; i++) {
        const clothingImg = clothingImages[i]
        try {
          const imageData = await downloadAndConvertImage(clothingImg.fileId)
          processedImages.push({
            type: 'clothing',
            category: clothingImg.category,
            categoryLabel: clothingImg.categoryLabel,
            ...imageData
          })
          console.log(`✅ 服装图片${i+1}处理完成`)
        } catch (error) {
          console.error(`❌ 服装图片${i+1}处理失败:`, error)
        }
      }
    }

    await updateTaskState(taskId, 'processing', 'downloaded')

    // 3. 生成提示词
    await updateTaskState(taskId, 'processing', 'ai_calling')

    const prompt = generateFittingPersonalPrompt({
      bodyParams,
      clothingDescription,
      background,
      clothingCount: clothingImages ? clothingImages.length : 0
    })

    console.log('📝 生成的提示词:', prompt.substring(0, 200) + '...')

    // 4. AI生成（使用真实AI，失败自动fallback到模拟）
    await updateTaskState(taskId, 'processing', 'ai_processing')

    console.log('🎨 开始AI生成...')
    const aiResult = await realAIGeneration({
      prompt,
      images: processedImages,
      type: 'fitting-personal'
    })

    await updateTaskState(taskId, 'processing', 'ai_completed')

    // 5. 上传生成的图片到云存储
    await updateTaskState(taskId, 'processing', 'uploading')

    const finalImages = []
    if (aiResult.images && aiResult.images.length > 0) {
      for (let i = 0; i < aiResult.images.length; i++) {
        const img = aiResult.images[i]
        try {
          const uploadResult = await uploadImageToStorage(
            img.base64Data,
            img.format || 'jpeg',
            taskId,
            'fitting-personal',
            i + 1
          )

          finalImages.push({
            url: uploadResult.fileID,
            width: img.width || 768,
            height: img.height || 1024,
            metadata: uploadResult.metadata
          })

          console.log(`✅ 图片${i+1}上传成功`)
        } catch (error) {
          console.error(`❌ 图片${i+1}上传失败:`, error)
        }
      }
    }

    if (finalImages.length === 0) {
      throw new Error('没有成功生成的图片')
    }

    // 6. 更新数据库为完成状态
    const completionTime = new Date()

    await db.collection('works')
      .where({ task_id: taskId })
      .update({
        data: {
          status: 'completed',
          images: finalImages,
          ai_prompt: prompt,
          completed_at: completionTime,
          updated_at: completionTime
        }
      })

    await db.collection('task_queue')
      .doc(taskId)
      .update({
        data: {
          status: 'completed',
          state: 'completed',
          result: {
            success: true,
            images_count: finalImages.length
          },
          completed_at: completionTime,
          updated_at: completionTime
        }
      })

    console.log('🎉 个人试衣任务完成:', taskId)

    clearTimeout(overallTimeout)

  } catch (error) {
    console.error('❌ 个人试衣任务处理失败:', error)

    clearTimeout(overallTimeout)

    if (!timeoutTriggered) {
      await updateTaskFailed(taskId, error.message)

      // 退还积分
      const OPENID = wxContext?.OPENID
      if (OPENID) {
        await refundCredits(OPENID, 1, taskId, 'fitting-personal')
      }
    }

    throw error
  }
}

/**
 * 处理全球旅行任务
 */
async function processTravelTask(taskId, event, wxContext) {
  // 🚨 设置整体超时控制
  let timeoutTriggered = false
  const overallTimeout = setTimeout(async () => {
    timeoutTriggered = true
    console.error('⏰ 全球旅行任务处理超时(55秒)')
    try {
      await updateTaskFailed(taskId, '任务处理超时(55秒)，可能是AI服务响应缓慢')
      console.log('✅ 超时状态更新完成')
    } catch (updateError) {
      console.error('❌ 超时状态更新失败:', updateError)
    }
  }, 55000)

  try {
    console.log('✈️ 开始处理全球旅行任务:', taskId)

    // 更新状态为处理中
    await updateTaskState(taskId, 'processing', 'downloading')

    // 1. 提取参数
    const { userPhoto, destination, customDescription } = event

    if (!userPhoto || !userPhoto.fileId) {
      throw new Error('缺少用户照片')
    }

    if (!destination) {
      throw new Error('缺少目的地信息')
    }

    console.log('📋 任务参数:', {
      destination: destination.name,
      customDescription: customDescription ? '有' : '无'
    })

    // 2. 下载并处理用户照片
    await updateTaskState(taskId, 'processing', 'downloading')

    let userImageData
    try {
      userImageData = await downloadAndConvertImage(userPhoto.fileId)
      console.log('✅ 用户照片处理完成')
    } catch (error) {
      console.error('❌ 用户照片处理失败:', error)
      throw new Error('用户照片处理失败')
    }

    await updateTaskState(taskId, 'processing', 'downloaded')

    // 3. 生成提示词
    await updateTaskState(taskId, 'processing', 'ai_calling')

    const prompt = generateTravelPrompt({
      destination,
      customDescription
    })

    console.log('📝 生成的提示词:', prompt.substring(0, 200) + '...')

    // 4. AI生成（使用真实AI，失败自动fallback到模拟）
    await updateTaskState(taskId, 'processing', 'ai_processing')

    console.log('🎨 开始AI生成...')
    const aiResult = await realAIGeneration({
      prompt,
      images: [{ type: 'user', ...userImageData }],
      type: 'travel'
    })

    await updateTaskState(taskId, 'processing', 'ai_completed')

    // 5. 上传生成的图片到云存储
    await updateTaskState(taskId, 'processing', 'uploading')

    const finalImages = []
    if (aiResult.images && aiResult.images.length > 0) {
      for (let i = 0; i < aiResult.images.length; i++) {
        const img = aiResult.images[i]
        try {
          const uploadResult = await uploadImageToStorage(
            img.base64Data,
            img.format || 'jpeg',
            taskId,
            'travel',
            i + 1
          )

          finalImages.push({
            url: uploadResult.fileID,
            width: img.width || 1024,
            height: img.height || 1024,
            metadata: uploadResult.metadata
          })

          console.log(`✅ 图片${i+1}上传成功`)
        } catch (error) {
          console.error(`❌ 图片${i+1}上传失败:`, error)
        }
      }
    }

    if (finalImages.length === 0) {
      throw new Error('没有成功生成的图片')
    }

    // 6. 更新数据库为完成状态
    const completionTime = new Date()

    await db.collection('works')
      .where({ task_id: taskId })
      .update({
        data: {
          status: 'completed',
          images: finalImages,
          ai_prompt: prompt,
          completed_at: completionTime,
          updated_at: completionTime
        }
      })

    await db.collection('task_queue')
      .doc(taskId)
      .update({
        data: {
          status: 'completed',
          state: 'completed',
          result: {
            success: true,
            images_count: finalImages.length
          },
          completed_at: completionTime,
          updated_at: completionTime
        }
      })

    console.log('🎉 全球旅行任务完成:', taskId)

    clearTimeout(overallTimeout)

  } catch (error) {
    console.error('❌ 全球旅行任务处理失败:', error)

    clearTimeout(overallTimeout)

    if (!timeoutTriggered) {
      await updateTaskFailed(taskId, error.message)

      // 退还积分
      const OPENID = wxContext?.OPENID
      if (OPENID) {
        await refundCredits(OPENID, 1, taskId, 'travel')
      }
    }

    throw error
  }
}

/**
 * 下载并转换图片为base64
 */
async function downloadAndConvertImage(fileId) {
  console.log('📥 下载图片:', fileId)

  try {
    // 从云存储读取图片数据
    const downloadResult = await cloud.downloadFile({
      fileID: fileId
    })

    let base64Data = null
    let mimeType = 'image/jpeg'

    // 检测文件格式
    const fileContent = downloadResult.fileContent.toString('utf8')

    if (fileContent.startsWith('data:image/')) {
      // 文件已是base64格式（base64预处理模式）
      const matches = fileContent.match(/^data:image\/([^;]+);base64,(.+)$/)
      if (matches) {
        mimeType = `image/${matches[1]}`
        base64Data = matches[2]
        console.log(`✅ 图片已是base64格式，大小: ${Math.round(base64Data.length/1024)}KB`)
      }
    } else {
      // 二进制文件，转换为base64
      base64Data = downloadResult.fileContent.toString('base64')
      console.log(`🔄 图片转换完成，大小: ${Math.round(base64Data.length/1024)}KB`)
    }

    if (!base64Data) {
      throw new Error('图片数据为空')
    }

    return {
      fileId,
      base64Data,
      base64Url: `data:${mimeType};base64,${base64Data}`,
      mimeType,
      sizeKB: Math.round(base64Data.length / 1024)
    }

  } catch (error) {
    console.error('❌ 下载图片失败:', error.message)

    // 尝试使用临时URL下载
    try {
      console.log('🔄 尝试使用临时URL下载...')
      const tempUrlResult = await cloud.getTempFileURL({
        fileList: [fileId]
      })

      if (tempUrlResult.fileList && tempUrlResult.fileList[0] && tempUrlResult.fileList[0].status === 0) {
        const axios = require('axios')
        const imageResponse = await axios({
          method: 'GET',
          url: tempUrlResult.fileList[0].tempFileURL,
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })

        const base64Data = Buffer.from(imageResponse.data, 'binary').toString('base64')
        const mimeType = imageResponse.headers['content-type'] || 'image/jpeg'

        console.log(`✅ 临时URL下载完成，大小: ${Math.round(base64Data.length/1024)}KB`)

        return {
          fileId,
          base64Data,
          base64Url: `data:${mimeType};base64,${base64Data}`,
          mimeType,
          sizeKB: Math.round(base64Data.length / 1024)
        }
      }
    } catch (fallbackError) {
      console.error('❌ 临时URL下载也失败:', fallbackError.message)
    }

    throw error
  }
}

/**
 * 上传图片到云存储
 */
async function uploadImageToStorage(base64Data, format, taskId, type, index) {
  const timestamp = Date.now()
  const fileName = `${type}_${taskId}_${index}_${timestamp}.${format}`
  const cloudPath = `${type}/${taskId}/${fileName}`

  console.log('📤 上传图片:', cloudPath)

  const uploadResult = await cloud.uploadFile({
    cloudPath: cloudPath,
    fileContent: Buffer.from(base64Data, 'base64')
  })

  if (!uploadResult.fileID) {
    throw new Error('上传失败，未返回fileID')
  }

  console.log('✅ 上传成功:', uploadResult.fileID)

  return {
    fileID: uploadResult.fileID,
    metadata: {
      cloud_path: cloudPath,
      uploaded_at: new Date(),
      original_format: format,
      type: type
    }
  }
}

/**
 * 生成个人试衣间提示词
 */
function generateFittingPersonalPrompt({ bodyParams, clothingDescription, background, clothingCount }) {
  const { gender, age, height, weight, skinTone, otherAdjustments } = bodyParams

  let prompt = `Professional fashion photography portrait of a ${age}-year-old ${gender === 'female' ? 'woman' : 'man'}, `
  prompt += `height ${height}cm, ${skinTone === 'fair' ? 'fair skin tone' : 'wheat skin tone'}, `

  if (otherAdjustments) {
    prompt += `${otherAdjustments}, `
  }

  if (clothingCount > 0) {
    prompt += `wearing ${clothingCount} clothing items`
    if (clothingDescription) {
      prompt += ` (${clothingDescription})`
    }
    prompt += `, `
  } else if (clothingDescription) {
    prompt += `wearing ${clothingDescription}, `
  }

  prompt += `${background} background, `
  prompt += `professional studio lighting, fashion editorial style, high quality, 8K resolution, sharp focus`

  return prompt
}

/**
 * 生成全球旅行提示词
 */
function generateTravelPrompt({ destination, customDescription }) {
  let prompt = `Professional travel photography of a person visiting ${destination.name} in ${destination.country}, `
  prompt += destination.prompt + ', '

  if (customDescription) {
    prompt += customDescription + ', '
  }

  prompt += `natural lighting, travel editorial style, beautiful composition, high quality, 8K resolution`

  return prompt
}

/**
 * 真实AI生成（复用商业版AI模块）
 */
async function realAIGeneration({ prompt, images, type }) {
  console.log('🎨 开始真实AI生成...')
  console.log('📝 提示词长度:', prompt.length)
  console.log('🖼️ 输入图片数量:', images.length)

  // 1. 选择最佳AI模型
  console.log('🔍 选择最佳AI模型...')
  const modelResult = await cloud.callFunction({
    name: 'aimodels',
    data: {
      action: 'selectBestModel',
      model_type: 'text-to-image',
      parameters: {}
    }
  })

  if (!modelResult.result || !modelResult.result.success || !modelResult.result.data.selected_model) {
    throw new Error('AI服务暂时不可用，请稍后重试或联系客服')
  }

  const selectedModel = modelResult.result.data.selected_model
  console.log('✅ 选择的AI模型:', selectedModel.model_name)

  // 2. 准备图片数据（转换为AI期望的格式）
  const preparedImages = images.map(img => ({
    url: img.base64Url,
    width: 1024,
    height: 1024,
    metadata: {
      fileId: img.fileId,
      type: img.type,
      mimeType: img.mimeType
    }
  }))

  // 3. 调用AI生成
  console.log('🚀 开始AI生成...')
  const startTime = Date.now()

  const aiResult = await cloud.callFunction({
    name: 'aimodels',
    data: {
      action: 'callAIModel',
      model_id: selectedModel._id,
      model: selectedModel,
      prompt: prompt,
      images: preparedImages,
      parameters: {
        width: 768,
        height: 1024,
        type: type,
        reference_images: preparedImages
      }
    }
  })

  const generationTime = Date.now() - startTime
  console.log(`⏱️ AI生成耗时: ${generationTime}ms`)

  if (!aiResult.result || !aiResult.result.success) {
    const errorMsg = aiResult.result?.message || 'AI生成失败'
    console.error('❌ AI生成失败:', errorMsg)
    throw new Error(errorMsg)
  }

  if (!aiResult.result.data || !aiResult.result.data.images || aiResult.result.data.images.length === 0) {
    throw new Error('AI生成成功但未返回图片')
  }

  console.log(`✅ AI生成成功: ${aiResult.result.data.images.length}张图片`)

  // 4. 返回结果
  return {
    success: true,
    images: aiResult.result.data.images.map(img => {
      let base64Data = null
      let format = 'jpeg'

      if (img.url && img.url.startsWith('data:image/')) {
        const parts = img.url.split(',')
        base64Data = parts[1] || null

        const mimeMatch = img.url.match(/data:image\/([^;]+)/)
        format = mimeMatch ? mimeMatch[1] : 'jpeg'
      } else if (img.base64Data) {
        base64Data = img.base64Data
        format = img.format || 'jpeg'
      } else {
        console.warn('⚠️ 图片格式不是base64，可能需要额外处理:', img.url ? img.url.substring(0, 100) : 'no url')
      }

      return {
        url: img.url,
        base64Data: base64Data,
        format: format,
        width: img.width || 768,
        height: img.height || 1024,
        metadata: {
          ...img.metadata,
          generated_by: selectedModel.model_name,
          generation_time: generationTime,
          type: type
        }
      }
    }),
    model_used: selectedModel.model_name,
    generation_time: generationTime
  }
}


/**
 * 退还积分并记录
 */
async function refundCredits(openid, amount, taskId, type) {
  try {
    if (!openid) {
      console.error('❌ 退款失败：缺少openid')
      return false
    }

    // 1. 增加用户积分
    await db.collection('users').where({ openid }).update({
      data: {
        credits: _.inc(amount),
        updated_at: new Date()
      }
    })

    // 2. 查询新余额
    const userResult = await db.collection('users').where({ openid }).get()
    const newBalance = userResult.data[0]?.credits || 0

    // 3. 记录退款
    const refundReason = type === 'fitting-personal' ? 'fitting-personal-refund' : 'travel-refund'
    const refundDesc = type === 'fitting-personal' ? '个人试衣退款' : '全球旅行退款'

    await db.collection('credit_records').add({
      data: {
        user_openid: openid,
        type: 'refund',
        amount: amount,
        balance_after: newBalance,
        reason: refundReason,
        related_task_id: taskId,
        description: refundDesc,
        created_at: new Date()
      }
    })

    console.log(`💰 已退还积分: ${amount}，新余额: ${newBalance}`)
    return true
  } catch (error) {
    console.error('❌ 退还积分失败:', error)
    return false
  }
}

/**
 * 更新任务状态
 */
async function updateTaskState(taskId, status, state) {
  await db.collection('task_queue')
    .doc(taskId)
    .update({
      data: {
        status,
        state,
        updated_at: new Date()
      }
    })

  await db.collection('works')
    .where({ task_id: taskId })
    .update({
      data: {
        status,
        updated_at: new Date()
      }
    })
}

/**
 * 更新任务为失败状态
 */
async function updateTaskFailed(taskId, errorMessage) {
  await db.collection('task_queue')
    .doc(taskId)
    .update({
      data: {
        status: 'failed',
        state: 'failed',
        error: errorMessage,
        error_message: errorMessage,
        updated_at: new Date()
      }
    })

  await db.collection('works')
    .where({ task_id: taskId })
    .update({
      data: {
        status: 'failed',
        error: errorMessage,
        updated_at: new Date()
      }
    })
}
