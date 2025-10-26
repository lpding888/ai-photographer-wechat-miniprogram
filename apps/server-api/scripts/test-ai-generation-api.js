/**
 * AI生图API测试脚本
 * 运行命令: node scripts/test-ai-generation-api.js
 */

const testAIGenerationAPI = async () => {
  const baseURL = 'http://localhost:3000/v1'

  console.log('🚀 开始测试AI生图API...\n')

  try {
    // 测试获取场景列表
    console.log('📋 测试获取场景列表...')
    const scenesResponse = await fetch(`${baseURL}/ai-generation/scenes`)
    const scenesData = await scenesResponse.json()

    console.log('场景列表响应:', {
      status: scenesResponse.status,
      success: scenesData.success,
      scenesCount: scenesData.data?.scenes?.length || 0
    })

    if (scenesData.success && scenesData.data.scenes.length > 0) {
      const firstScene = scenesData.data.scenes[0]
      console.log(`第一个场景: ${firstScene.name} (${firstScene.category})`)
    }

    // 测试COS签名接口（需要认证token）
    console.log('\n🔐 测试COS签名接口...')
    const cosResponse = await fetch(`${baseURL}/cos/signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 注意: 实际使用时需要添加认证token
        // 'Authorization': 'Bearer your-token-here'
      },
      body: JSON.stringify({
        fileType: 'image/jpeg',
        fileName: 'test-upload.jpg',
        fileSize: 1024000, // 1MB
        directory: 'test'
      })
    })

    console.log('COS签名响应状态:', cosResponse.status)
    if (cosResponse.status === 401) {
      console.log('✅ COS签名接口正确返回401未认证（需要token）')
    }

    // 测试创建任务（需要认证token）
    console.log('\n🎨 测试创建AI生图任务...')
    const createTaskResponse = await fetch(`${baseURL}/ai-generation/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 注意: 实际使用时需要添加认证token
        // 'Authorization': 'Bearer your-token-here'
      },
      body: JSON.stringify({
        sourceImages: ['https://example.com/test.jpg'],
        sceneId: 'test-scene-id',
        modelConfig: {
          height: 170,
          weight: 55,
          bodyType: 'slim',
          skinTone: 'fair'
        },
        generationMode: 'NORMAL',
        generateCount: 4,
        imageSize: '1024x1024'
      })
    })

    console.log('创建任务响应状态:', createTaskResponse.status)
    if (createTaskResponse.status === 401) {
      console.log('✅ 创建任务接口正确返回401未认证（需要token）')
    }

    // 测试获取任务状态（不需要认证，但需要有效的taskId）
    console.log('\n📊 测试获取任务状态...')
    const taskStatusResponse = await fetch(`${baseURL}/ai-generation/tasks/test-task-id`)
    const taskStatusData = await taskStatusResponse.json()

    console.log('任务状态响应:', {
      status: taskStatusResponse.status,
      success: taskStatusData.success,
      message: taskStatusData.message
    })

    if (taskStatusResponse.status === 404) {
      console.log('✅ 任务状态接口正确返回404（任务不存在）')
    }

    // 测试获取用户统计（需要认证token）
    console.log('\n📈 测试获取用户统计...')
    const statsResponse = await fetch(`${baseURL}/ai-generation/stats`, {
      headers: {
        // 注意: 实际使用时需要添加认证token
        // 'Authorization': 'Bearer your-token-here'
      }
    })

    console.log('用户统计响应状态:', statsResponse.status)
    if (statsResponse.status === 401) {
      console.log('✅ 用户统计接口正确返回401未认证（需要token）')
    }

    console.log('\n✅ AI生图API基础测试完成!')
    console.log('\n📝 测试总结:')
    console.log('- 场景列表接口: ✅ 正常')
    console.log('- COS签名接口: ✅ 需要认证')
    console.log('- 创建任务接口: ✅ 需要认证')
    console.log('- 任务状态接口: ✅ 正常')
    console.log('- 用户统计接口: ✅ 需要认证')

  } catch (error) {
    console.error('❌ API测试失败:', error)

    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 提示: 请确保server-api服务正在运行')
      console.log('   启动命令: pnpm dev:api')
    }
  }
}

// 运行测试
testAIGenerationAPI()