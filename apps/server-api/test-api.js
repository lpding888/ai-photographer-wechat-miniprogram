/**
 * API接口测试脚本
 *
 * @author 老王
 * @version 3.0.0
 */

const BASE_URL = 'http://localhost:4310'

/**
 * 测试API健康检查
 */
async function testHealthCheck() {
  console.log('🏥 测试API健康检查...')

  try {
    const response = await fetch(`${BASE_URL}/health`)
    const data = await response.json()

    if (response.ok && data.status === 'healthy') {
      console.log('✅ API健康检查通过')
      console.log('📊 服务状态:', JSON.stringify(data, null, 2))
      return true
    } else {
      console.log('❌ API健康检查失败')
      return false
    }
  } catch (error) {
    console.log('❌ API健康检查异常:', error.message)
    return false
  }
}

/**
 * 测试SCF健康检查
 */
async function testSCFHealthCheck() {
  console.log('🔧 测试SCF健康检查...')

  try {
    const response = await fetch(`${BASE_URL}/health/scf`)
    const data = await response.json()

    if (response.ok && data.success) {
      console.log('✅ SCF健康检查通过')
      console.log('📊 SCF状态:', JSON.stringify(data, null, 2))
      return true
    } else {
      console.log('❌ SCF健康检查失败')
      console.log('📄 错误响应:', data)
      return false
    }
  } catch (error) {
    console.log('❌ SCF健康检查异常:', error.message)
    return false
  }
}

/**
 * 测试AI图像生成API
 */
async function testAIImageAPI() {
  console.log('🎨 测试AI图像生成API...')

  try {
    const response = await fetch(`${BASE_URL}/api/v1/ai-generation/cos/signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileType: 'image/jpeg',
        fileName: 'test-image.jpg',
        fileSize: 1024000,
        directory: 'test'
      })
    })

    if (response.ok) {
      console.log('✅ COS签名API测试通过')
      const data = await response.json()
      console.log('📄 COS签名响应:', JSON.stringify(data, null, 2))
      return true
    } else {
      console.log('❌ COS签名API测试失败')
      const data = await response.json()
      console.log('📄 错误响应:', data)
      return false
    }
  } catch (error) {
    console.log('❌ AI图像API测试异常:', error.message)
    return false
  }
}

/**
 * 运行所有API测试
 */
async function runAPITests() {
  console.log('🎯 开始API接口测试')
  console.log('=====================================')

  const results = {
    healthCheck: false,
    scfHealthCheck: false,
    aiImageAPI: false
  }

  // 依次运行测试
  results.healthCheck = await testHealthCheck()
  console.log('')

  if (results.healthCheck) {
    results.scfHealthCheck = await testSCFHealthCheck()
    console.log('')

    results.aiImageAPI = await testAIImageAPI()
    console.log('')
  }

  // 输出测试结果总结
  console.log('📊 API测试结果总结')
  console.log('=====================================')

  const totalTests = Object.keys(results).length
  const passedTests = Object.values(results).filter(Boolean).length

  console.log(`总API测试数: ${totalTests}`)
  console.log(`通过API测试: ${passedTests}`)
  console.log(`失败API测试: ${totalTests - passedTests}`)
  console.log(`成功率: ${Math.round((passedTests / totalTests) * 100)}%`)
  console.log('')

  Object.entries(results).forEach(([testName, passed]) => {
    const status = passed ? '✅' : '❌'
    const displayName = {
      healthCheck: 'API健康检查',
      scfHealthCheck: 'SCF健康检查',
      aiImageAPI: 'AI图像API'
    }
    console.log(`${status} ${displayName[testName]}`)
  })

  console.log('')
  if (passedTests === totalTests) {
    console.log('🎉 所有API测试通过！')
  } else {
    console.log('⚠️ 部分API测试失败，请检查服务状态')
  }

  console.log('=====================================')
  console.log('API测试完成')
}

// 运行测试
runAPITests().catch(error => {
  console.error('💥 API测试运行失败:', error)
  process.exit(1)
})