// 虚拟试衣处理器云函数 - 高并发独立处理版本
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

  console.log('🚀 fitting-worker 开始处理任务:', taskId)

  try {
    await processFittingTask(taskId, originalEvent, wxContext)
    console.log('✅ fitting-worker 任务处理完成:', taskId)
    return { success: true, taskId }
  } catch (error) {
    console.error('❌ fitting-worker 任务处理失败:', taskId, error)
    return { success: false, taskId, error: error.message }
  }
}

/**
 * 处理试衣任务的核心逻辑
 */
async function processFittingTask(taskId, originalEvent, wxContext) {
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
    console.log('👗 processFittingTask 开始执行, taskId:', taskId)

    // 从originalEvent中提取实际的event数据
    const event = originalEvent.originalEvent || originalEvent

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
    let sceneInfo = {
      name: '试衣间·简约风格',
      description: '简约试衣间，自然光线',
      lighting: '柔和自然光',
      atmosphere: '舒适自然'
    }

    if (event.sceneId) {
      try {
        const sceneResult = await db.collection('scenes')
          .doc(event.sceneId)
          .get()
        if (sceneResult.data) {
          sceneInfo = sceneResult.data
          console.log('✅ 成功获取场景信息:', sceneInfo.name)
        }
      } catch (error) {
        console.warn('获取场景信息失败，使用默认场景:', error)
      }
    } else {
      console.log('📍 未指定场景ID，使用默认场景')
    }

    // 2. 处理人物图片和服装图片
    let processedPersonImages = []
    let processedClothingImages = []
    let imagePromptText = ''

    // 处理人物图片 - 转换为base64格式
    // 支持两种格式：model_image（单个图片）和 person_images（数组）
    let personImageList = []
    if (event.model_image) {
      personImageList.push(event.model_image)
    }
    if (event.person_images && event.person_images.length > 0) {
      personImageList = personImageList.concat(event.person_images)
    }

    // 处理人物图片 - 支持base64预处理模式
    if (personImageList.length > 0) {
      try {
        console.log('👤 开始处理人物图片，数量:', personImageList.length)

        for (let i = 0; i < personImageList.length; i++) {
          const fileId = personImageList[i]
          console.log(`📥 处理第${i+1}张人物图片: ${fileId}`)

          try {
            // 尝试从云存储直接读取base64数据（新模式）
            let base64Data = null
            let mimeType = 'image/jpeg'
            let isBase64Mode = false

            try {
              const downloadResult = await cloud.downloadFile({
                fileID: fileId
              })

              // 检查是否为base64格式存储
              const fileContent = downloadResult.fileContent.toString('utf8')
              if (fileContent.startsWith('data:image/')) {
                // 新模式：直接是base64格式
                const matches = fileContent.match(/^data:image\/([^;]+);base64,(.+)$/)
                if (matches) {
                  mimeType = `image/${matches[1]}`
                  base64Data = matches[2]
                  isBase64Mode = true
                  console.log(`✅ 第${i+1}张人物图片使用base64预处理模式，大小: ${Math.round(base64Data.length/1024)}KB`)
                }
              } else {
                // 传统模式：二进制文件，需要转换
                base64Data = downloadResult.fileContent.toString('base64')
                isBase64Mode = false
                console.log(`🔄 第${i+1}张人物图片使用传统模式转换，大小: ${Math.round(base64Data.length/1024)}KB`)
              }
            } catch (downloadError) {
              console.warn(`❌ 直接下载失败，回退到临时URL模式: ${downloadError.message}`)
              // 回退到临时URL模式
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
                console.log(`🔄 第${i+1}张人物图片临时URL下载转换完成，大小: ${Math.round(base64Data.length/1024)}KB`)
              } else {
                throw new Error('无法获取图片临时URL')
              }
            }

            // 构建处理后的图片数据
            const base64Url = `data:${mimeType};base64,${base64Data}`
            processedPersonImages.push({
              fileId: fileId,
              base64Url: base64Url,
              base64Data: base64Data,
              mimeType: mimeType,
              size: base64Data.length,
              status: 'converted',
              type: 'person',
              mode: isBase64Mode ? 'base64_preprocessed' : 'traditional_converted',
              sizeKB: Math.round(base64Data.length / 1024)
            })

            console.log(`✅ 第${i+1}张人物图片处理完成`)
          } catch (error) {
            console.error(`❌ 第${i+1}张人物图片处理失败:`, error.message)
            processedPersonImages.push({
              fileId: fileId,
              status: 'processing_failed',
              type: 'person',
              error: error.message
            })
          }
        }
      } catch (error) {
        console.error('处理人物图片失败:', error)
      }
    }

    // 处理服装图片 - 支持base64预处理模式
    if (event.clothing_images) {
      try {
        const clothingFileList = Object.values(event.clothing_images).filter(Boolean)
        if (clothingFileList.length > 0) {
          console.log('👕 开始处理服装图片，数量:', clothingFileList.length)

          for (let i = 0; i < clothingFileList.length; i++) {
            const fileId = clothingFileList[i]
            console.log(`📥 处理第${i+1}张服装图片: ${fileId}`)

            try {
              // 尝试从云存储直接读取base64数据（新模式）
              let base64Data = null
              let mimeType = 'image/jpeg'
              let isBase64Mode = false

              try {
                const downloadResult = await cloud.downloadFile({
                  fileID: fileId
                })

                // 检查是否为base64格式存储
                const fileContent = downloadResult.fileContent.toString('utf8')
                if (fileContent.startsWith('data:image/')) {
                  // 新模式：直接是base64格式
                  const matches = fileContent.match(/^data:image\/([^;]+);base64,(.+)$/)
                  if (matches) {
                    mimeType = `image/${matches[1]}`
                    base64Data = matches[2]
                    isBase64Mode = true
                    console.log(`✅ 第${i+1}张服装图片使用base64预处理模式，大小: ${Math.round(base64Data.length/1024)}KB`)
                  }
                } else {
                  // 传统模式：二进制文件，需要转换
                  base64Data = downloadResult.fileContent.toString('base64')
                  isBase64Mode = false
                  console.log(`🔄 第${i+1}张服装图片使用传统模式转换，大小: ${Math.round(base64Data.length/1024)}KB`)
                }
              } catch (downloadError) {
                console.warn(`❌ 直接下载失败，回退到临时URL模式: ${downloadError.message}`)
                // 回退到临时URL模式
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
                  console.log(`🔄 第${i+1}张服装图片临时URL下载转换完成，大小: ${Math.round(base64Data.length/1024)}KB`)
                } else {
                  throw new Error('无法获取图片临时URL')
                }
              }

              // 构建处理后的图片数据
              const base64Url = `data:${mimeType};base64,${base64Data}`
              processedClothingImages.push({
                fileId: fileId,
                base64Url: base64Url,
                base64Data: base64Data,
                mimeType: mimeType,
                size: base64Data.length,
                status: 'converted',
                type: 'clothing',
                mode: isBase64Mode ? 'base64_preprocessed' : 'traditional_converted',
                sizeKB: Math.round(base64Data.length / 1024)
              })

              console.log(`✅ 第${i+1}张服装图片处理完成`)
            } catch (error) {
              console.error(`❌ 第${i+1}张服装图片处理失败:`, error.message)
              processedClothingImages.push({
                fileId: fileId,
                status: 'processing_failed',
                type: 'clothing',
                error: error.message
              })
            }
          }
        }
      } catch (error) {
        console.error('处理服装图片失败:', error)
      }
    }

    // 为AI提示词添加图片信息
    if (processedPersonImages.length > 0 || processedClothingImages.length > 0) {
      imagePromptText = '\n\n### 试衣参考图片:\n'

      processedPersonImages.forEach((img, index) => {
        imagePromptText += `人物图片${index + 1}: ${img.status === 'converted' ? '已转换为base64格式' : '处理失败'}\n`
      })

      processedClothingImages.forEach((img, index) => {
        imagePromptText += `服装图片${index + 1}: ${img.status === 'converted' ? '已转换为base64格式' : '处理失败'}\n`
      })

      const personConverted = processedPersonImages.filter(img => img.status === 'converted').length
      const clothingConverted = processedClothingImages.filter(img => img.status === 'converted').length

      console.log('📊 图片处理统计:', {
        personImages: { total: processedPersonImages.length, converted: personConverted },
        clothingImages: { total: processedClothingImages.length, converted: clothingConverted }
      })

      // 如果没有任何图片转换成功，记录警告
      if (personConverted === 0 && clothingConverted === 0) {
        console.warn('⚠️ 警告：没有任何图片成功转换为base64，AI将只使用文字提示词')
      }
    }

    // 3. 生成提示词
    let generatedPrompt = ''
    try {
      // 准备图片变量 - 获取成功转换的图片URL
      const modelImages = processedPersonImages.filter(img => img.status === 'converted')
      const topImages = processedClothingImages.filter(img => img.status === 'converted' && img.fileId.includes('top'))
      const bottomImages = processedClothingImages.filter(img => img.status === 'converted' && img.fileId.includes('bottom'))
      const shoeImages = processedClothingImages.filter(img => img.status === 'converted' && img.fileId.includes('shoes'))

      const promptResult = await cloud.callFunction({
        name: 'prompt',
        data: {
          action: 'generatePrompt',
          type: 'fitting',
          parameters: {
            ...event.parameters,
            person_image_count: processedPersonImages.length,
            clothing_image_count: processedClothingImages.length,
            has_person_images: processedPersonImages.length > 0,
            has_clothing_images: processedClothingImages.length > 0,
            // 添加图片变量（不传递base64数据，只传递标识）
            HAS_MODEL_IMAGE: modelImages.length > 0,
            HAS_TOP_IMAGE: topImages.length > 0 || processedClothingImages.length > 0,
            HAS_BOTTOM_IMAGE: bottomImages.length > 0,
            HAS_SHOES_IMAGE: shoeImages.length > 0
          },
          sceneInfo: sceneInfo,
          mode: event.mode,  // 🎭 传递模式（pose_variation）
          pose_description: event.pose_description  // 🎭 传递姿势描述
        }
      })

      if (promptResult.result && promptResult.result.success) {
        generatedPrompt = promptResult.result.data.prompt
        if (imagePromptText) {
          generatedPrompt += imagePromptText
        }
        console.log('生成的完整提示词:', generatedPrompt.substring(0, 300) + '...')
      } else {
        console.warn('提示词生成失败，使用默认提示词')
        generatedPrompt = generateDefaultFittingPrompt(event.parameters, sceneInfo)
        if (imagePromptText) {
          generatedPrompt += imagePromptText
        }
      }
    } catch (error) {
      console.warn('提示词生成异常，使用默认提示词:', error)
      generatedPrompt = generateDefaultFittingPrompt(event.parameters, sceneInfo)
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
      throw new Error('没有可用的试衣AI模型')
    }

    const selectedModel = modelResult.result.data.selected_model
    console.log('✅ 选择的试衣AI模型:', selectedModel.model_name)

    // 5. 在独立容器中执行AI生成（每个用户独立容器，支持高并发）
    console.log('🚀 开始AI生成任务（在独立容器中，等待完成）...')

    // 初始化AI处理模块
    const aiCaller = new AICaller()
    const imageProcessor = new ImageProcessor()
    const storageManager = new StorageManager()

    // 收集所有图片ID
    const allImageIds = []
    if (event.model_image) allImageIds.push(event.model_image)
    if (event.person_images) allImageIds.push(...event.person_images)
    if (event.clothing_images) {
      allImageIds.push(...Object.values(event.clothing_images).filter(Boolean))
    }

    // 下载并处理图片
    const aiProcessedImages = await imageProcessor.downloadAndConvert(allImageIds)

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

    // 直接上传到云存储
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
              'fitting',
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

    // 🎯 收集所有原图信息（用于详情页对比展示）
    const originalImages = []

    // 添加人物图片
    if (event.model_image) {
      originalImages.push({ type: 'person', fileId: event.model_image })
    }
    if (event.person_images && event.person_images.length > 0) {
      event.person_images.forEach(img => {
        originalImages.push({ type: 'person', fileId: img })
      })
    }

    // 添加服装图片
    if (event.clothing_images) {
      Object.entries(event.clothing_images).forEach(([clothingType, fileId]) => {
        if (fileId) {
          originalImages.push({ type: 'clothing', clothingType, fileId })
        }
      })
    }

    // 🎯 提取AI返回的文字描述（摄影师说）
    const aiDescription = aiResult.data?.text_response || null

    // 更新works和task_queue（只存fileID）
    const completionTime = new Date()
    await db.collection('works')
      .where({ task_id: taskId })
      .update({
        data: {
          status: 'completed',
          images: finalImages,
          ai_model: selectedModel.model_name,
          ai_prompt: generatedPrompt,
          ai_description: aiDescription,  // 🎯 保存AI返回的文字描述（摄影师说）
          original_images: originalImages,  // 🎯 保存用户上传的原图fileID（含类型信息）
          scene_id: event.sceneId || null,  // 🎯 保存场景ID
          scene_info: sceneInfo,  // 🎯 保存完整场景信息（用于姿势裂变）
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

    console.log('🎉 fitting-worker完成: ' + taskId)

    // 清理超时定时器
    clearTimeout(overallTimeout)

  } catch (error) {
    console.error('试衣任务处理失败:', error)

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
 * 生成默认试衣提示词
 */
function generateDefaultFittingPrompt(parameters, sceneInfo) {
  const { gender = 'female', age = 25, nationality = 'asian', skin_tone = 'medium' } = parameters
  const sceneName = sceneInfo.name || '试衣间'

  return `专业虚拟试衣，${age}岁${nationality}${gender === 'female' ? '女性' : '男性'}模特，${skin_tone}肤色，在${sceneName}环境中展示服装试穿效果。高质量渲染，自然贴合，时尚风格，1024x1024分辨率。`
}

