// 服装摄影处理器云函数 - 高并发独立处理版本
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 导入AI处理模块
const AICaller = require('./modules/aiCaller')
const ImageProcessor = require('./modules/imageProcessor')
const StorageManager = require('./modules/storageManager')

exports.main = async (event, context) => {
  const { taskId, originalEvent, wxContext } = event

  console.log('🚀 photography-worker 开始处理任务:', taskId)

  try {
    await processPhotographyTask(taskId, originalEvent, wxContext)
    console.log('✅ photography-worker 任务处理完成:', taskId)
    return { success: true, taskId }
  } catch (error) {
    console.error('❌ photography-worker 任务处理失败:', taskId, error)
    return { success: false, taskId, error: error.message }
  }
}

/**
 * 处理摄影任务的核心逻辑
 */
async function processPhotographyTask(taskId, event, wxContext) {
  // 🚨 设置整体超时控制，确保在云函数被强制终止前更新状态
  let timeoutTriggered = false
  const overallTimeout = setTimeout(async () => {
    timeoutTriggered = true
    console.error('⏰ 任务处理超时(55秒)，主动更新状态为失败')
    try {
      await db.collection('task_queue').doc(taskId).update({
        data: {
          status: 'failed',
          error: '任务处理超时(55秒)，可能是AI服务响应缓慢',
          updated_at: new Date()
        }
      })
      await db.collection('works').where({ task_id: taskId }).update({
        data: {
          status: 'failed',
          error: '任务处理超时',
          updated_at: new Date()
        }
      })
      console.log('✅ 超时状态更新完成')
    } catch (updateError) {
      console.error('❌ 超时状态更新失败:', updateError)
    }
  }, 55000) // 55秒后触发，留5秒给云函数清理

  try {
    console.log('📸 processPhotographyTask 开始执行, taskId:', taskId)

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

    // 🎭 优先使用传递过来的场景信息（姿势裂变等模式）
    if (event.sceneInfo && typeof event.sceneInfo === 'object') {
      sceneInfo = event.sceneInfo
      console.log('✅ 使用传递的场景信息:', sceneInfo.name || '(空场景)')
    }
    // 否则，如果有场景ID，从数据库查询
    else if (event.sceneId) {
      try {
        const sceneResult = await db.collection('scenes')
          .doc(event.sceneId)
          .get()
        if (sceneResult.data) {
          sceneInfo = sceneResult.data
          console.log('✅ 从数据库获取场景信息:', sceneInfo.name)
        }
      } catch (error) {
        console.warn('⚠️ 场景信息查询失败:', error)
      }
    } else {
      console.log('📍 无场景信息')
    }

    // 2. 处理用户上传的服装图片
    let processedImages = []
    let imagePromptText = ''
    if (event.images && event.images.length > 0) {
      try {
        console.log('🖼️ 开始处理用户上传的服装图片，数量:', event.images.length)

        // 处理每张图片
        for (let i = 0; i < event.images.length; i++) {
          const fileId = event.images[i]
          console.log(`📥 处理第${i+1}张图片: ${fileId}`)

          try {
            // 从云存储读取图片数据
            let base64Data = null
            let mimeType = 'image/jpeg'

            try {
              const downloadResult = await cloud.downloadFile({
                fileID: fileId
              })

              // 检测文件格式
              const fileContent = downloadResult.fileContent.toString('utf8')
              if (fileContent.startsWith('data:image/')) {
                // 文件已是base64格式
                const matches = fileContent.match(/^data:image\/([^;]+);base64,(.+)$/)
                if (matches) {
                  mimeType = `image/${matches[1]}`
                  base64Data = matches[2]
                  console.log(`✅ 第${i+1}张图片读取完成，大小: ${Math.round(base64Data.length/1024)}KB`)
                }
              } else {
                // 二进制文件，转换为base64
                base64Data = downloadResult.fileContent.toString('base64')
                console.log(`🔄 第${i+1}张图片转换完成，大小: ${Math.round(base64Data.length/1024)}KB`)
              }
            } catch (downloadError) {
              console.warn(`❌ 直接下载失败，尝试临时URL: ${downloadError.message}`)
              // 使用临时URL下载
              const tempUrlResult = await cloud.getTempFileURL({
                fileList: [fileId]
              })

              if (tempUrlResult.fileList && tempUrlResult.fileList[0] && tempUrlResult.fileList[0].status === 0) {
                const axios = require('axios')
                const imageResponse = await axios({
                  method: 'GET',
                  url: tempUrlResult.fileList[0].tempFileURL,
                  responseType: 'arraybuffer',
                  timeout: 30000,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                })

                base64Data = Buffer.from(imageResponse.data, 'binary').toString('base64')
                mimeType = imageResponse.headers['content-type'] || 'image/jpeg'
                console.log(`🔄 第${i+1}张图片临时URL下载转换完成，大小: ${Math.round(base64Data.length/1024)}KB`)
              } else {
                throw new Error('无法获取图片临时URL')
              }
            }

            // 构建处理后的图片数据
            const base64Url = `data:${mimeType};base64,${base64Data}`
            processedImages.push({
              fileId: fileId,
              base64Url: base64Url,
              base64Data: base64Data,
              mimeType: mimeType,
              size: base64Data.length,
              sizeKB: Math.round(base64Data.length / 1024)
            })

            console.log(`✅ 第${i+1}张图片处理完成`)

          } catch (error) {
            console.error(`❌ 第${i+1}张图片处理失败:`, error.message)
            // 继续处理下一张图片
          }
        }
      } catch (error) {
        console.error('处理服装图片失败:', error)
      }
    }

    // 为AI提示词添加图片信息
    if (processedImages.length > 0) {
      const convertedCount = processedImages.filter(img => img.base64Data).length
      imagePromptText = '\n\n### 服装参考图片:\n' +
        processedImages.map((img, index) =>
          `图片${index + 1}: ${img.base64Data ? '已转换为base64格式' : '处理失败'}`
        ).join('\n')

      console.log('📊 图片处理统计:', {
        total: processedImages.length,
        converted: convertedCount,
        failed: processedImages.length - convertedCount
      })

      // 如果没有任何图片转换成功，记录警告
      if (convertedCount === 0) {
        console.warn('⚠️ 警告：没有任何图片成功转换为base64，AI将只使用文字提示词')
      }
    }

    // 3. 生成提示词
    let generatedPrompt = ''
    try {
      const promptResult = await cloud.callFunction({
        name: 'prompt',
        data: {
          action: 'generatePrompt',
          type: 'photography',
          parameters: {
            ...event.parameters,
            // 添加图片信息到参数中
            image_count: processedImages.length,
            has_images: processedImages.length > 0
          },
          sceneInfo: sceneInfo,
          mode: event.mode,  // 🎭 传递模式（pose_variation）
          pose_description: event.pose_description  // 🎭 传递姿势描述
        }
      })

      if (promptResult.result && promptResult.result.success) {
        generatedPrompt = promptResult.result.data.prompt
        // 在提示词末尾添加图片信息
        if (imagePromptText) {
          generatedPrompt += imagePromptText
        }
        console.log('生成的完整提示词:', generatedPrompt.substring(0, 300) + '...')
      } else {
        console.warn('提示词生成失败，使用默认提示词')
        generatedPrompt = generateDefaultPhotographyPrompt(event.parameters, sceneInfo)
        if (imagePromptText) {
          generatedPrompt += imagePromptText
        }
      }
    } catch (error) {
      console.warn('提示词生成异常，使用默认提示词:', error)
      generatedPrompt = generateDefaultPhotographyPrompt(event.parameters, sceneInfo)
      if (imagePromptText) {
        generatedPrompt += imagePromptText
      }
    }

    // 4. 选择最佳AI模型（轻量查询）
    console.log('🔍 选择最佳AI模型...')
    const modelResult = await cloud.callFunction({
      name: 'aimodels',
      data: {
        action: 'selectBestModel',
        model_type: 'text-to-image',
        parameters: event.parameters
      }
    })

    if (!modelResult.result || !modelResult.result.success || !modelResult.result.data.selected_model) {
      throw new Error('没有可用的AI模型')
    }

    const selectedModel = modelResult.result.data.selected_model
    console.log('✅ 选择的AI模型:', selectedModel.model_name)

    // 5. 在独立容器中执行AI生成（每个用户独立容器，支持高并发）
    console.log('🚀 开始AI生成任务（在独立容器中，等待完成）...')

    // 初始化AI处理模块
    const aiCaller = new AICaller()
    const imageProcessor = new ImageProcessor()
    const storageManager = new StorageManager()

    // 下载并处理图片
    const aiProcessedImages = await imageProcessor.downloadAndConvert(event.images || [])

    // 🚀 调用AI生成（56秒超时，失败直接抛错给前端）
    console.log('🚀 开始AI生成...')
    const aiResult = await aiCaller.generateImages({
      model: selectedModel,
      prompt: generatedPrompt,
      images: aiProcessedImages,
      parameters: event.parameters || {}
    })

    if (!aiResult || !aiResult.success) {
      throw new Error(aiResult?.message || 'AI生成失败')
    }

    console.log(`✅ AI生成完成: ${aiResult.data.images?.length || 0}张图片`)

    // 直接上传到云存储（水印由前端Canvas添加）
    const finalImages = []
    if (aiResult.data?.images) {
      for (let i = 0; i < aiResult.data.images.length; i++) {
        const img = aiResult.data.images[i]

        if (img.url && img.url.startsWith('data:image/')) {
          // 解析base64
          const matches = img.url.match(/^data:image\/([^;]+);base64,(.+)$/)
          if (matches) {
            const [, format, base64Data] = matches

            // 上传到云存储
            const uploadResult = await storageManager.uploadSingleImage(
              { buffer: Buffer.from(base64Data, 'base64'), format },
              taskId,
              'photography',
              i + 1
            )

            finalImages.push({
              url: uploadResult.fileID,
              width: img.width || 1024,
              height: img.height || 1024,
              metadata: uploadResult.metadata
            })
          }
        }
      }
    }

    console.log(`📤 图片上传完成: ${finalImages.length}张`)

    // 更新works和task_queue（只存fileID）
    const completionTime = new Date()

    // 🎯 提取AI返回的文字描述（摄影师说）
    const aiDescription = aiResult.data?.text_response || null

    await db.collection('works')
      .where({ task_id: taskId })
      .update({
        data: {
          status: 'completed',
          images: finalImages,
          ai_model: selectedModel.model_name,
          ai_prompt: generatedPrompt,
          ai_description: aiDescription,  // 🎯 保存AI返回的文字描述（摄影师说，仅用于展示）
          original_images: event.images || [],  // 🎯 保存用户上传的原图fileID
          scene_id: event.sceneId || null,  // 🎯 保存场景ID
          scene_info: sceneInfo,  // 🎯 保存完整场景信息（用于姿势裂变，包含场景描述）
          completed_at: completionTime,
          created_at: completionTime,  // 🎯 更新created_at为完成时间，确保排在最前面
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
          completed_at: new Date(),
          updated_at: new Date()
        }
      })

    console.log('🎉 photography-worker完成: ' + taskId)

    // 清理超时定时器
    clearTimeout(overallTimeout)

  } catch (error) {
    console.error('摄影任务处理失败:', error)

    // 清理超时定时器
    clearTimeout(overallTimeout)

    // 更新任务状态为失败（如果超时未触发）
    if (!timeoutTriggered) {
      try {
        await db.collection('task_queue')
          .doc(taskId)
          .update({
            data: {
              status: 'failed',
              error: error.message,
              updated_at: new Date()
            }
          })

        await db.collection('works')
          .where({ task_id: taskId })
          .update({
            data: {
              status: 'failed',
              error: error.message,
              updated_at: new Date()
            }
          })
        console.log('✅ 错误状态更新完成')
      } catch (updateError) {
        console.error('❌ 更新失败状态失败:', updateError)
      }
    } else {
      console.log('⚠️ 超时已触发，跳过错误状态更新')
    }

    throw error
  }
}

/**
 * 生成默认摄影提示词
 */
function generateDefaultPhotographyPrompt(parameters, sceneInfo) {
  const { gender = 'female', age = 25, nationality = 'asian', skin_tone = 'medium' } = parameters
  const sceneName = sceneInfo.name || '摄影棚'

  return `专业时尚摄影，${age}岁${nationality}${gender === 'female' ? '女性' : '男性'}模特，${skin_tone}肤色，在${sceneName}环境中展示服装。高质量摄影，专业打光，时尚风格，1024x1024分辨率。`
}

