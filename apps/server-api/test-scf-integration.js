/**
 * SCF集成端到端测试脚本
 *
 * @author 老王
 * @version 3.0.0
 */

import { scfService } from './src/services/scf-service.js'
import { aiImageService } from './src/services/ai-image-service.js'

/**
 * 测试SCF服务连通性
 */
async function testSCFService() {
  console.log('🔧 测试SCF服务连通性...')

  try {
    // 测试健康检查
    const health = await scfService.healthCheck()
    console.log('✅ SCF健康检查结果:', JSON.stringify(health, null, 2))

    return true
  } catch (error) {
    console.error('❌ SCF服务连通性测试失败:', error.message)
    return false
  }
}

/**
 * 测试图像预处理
 */
async function testImagePreprocessing() {
  console.log('🖼️ 测试图像预处理功能...')

  try {
    // 使用一个测试图片URL（实际部署时需要替换为真实URL）
    const testImageUrl = 'https://example.com/test-image.jpg'

    const result = await scfService.callImageProcessor('compressImage', {
      imageUrl: testImageUrl,
      quality: 80
    })

    console.log('✅ 图像预处理结果:', JSON.stringify(result, null, 2))
    return true
  } catch (error) {
    console.error('❌ 图像预处理测试失败:', error.message)
    return false
  }
}

/**
 * 测试提示词生成
 */
async function testPromptGeneration() {
  console.log('🧠 测试提示词生成功能...')

  try {
    const result = await scfService.callPromptGenerator({
      imageUrl: 'https://example.com/test-clothing.jpg',
      clothingType: 'fashion',
      stylePreference: 'modern',
      sceneType: 'indoor'
    })

    console.log('✅ 提示词生成结果:', JSON.stringify(result, null, 2))
    return true
  } catch (error) {
    console.error('❌ 提示词生成测试失败:', error.message)
    return false
  }
}

/**
 * 测试图像生成
 */
async function testImageGeneration() {
  console.log('🎨 测试图像生成功能...')

  try {
    const result = await scfService.callImageGenerator({
      prompt: '一个穿着时尚服装的模特在现代化室内环境中',
      options: {
        size: '1024x1024',
        quality: 'standard',
        n: 1
      },
      modelConfig: {
        model: 'doubao-Seedream-4-0-250828'
      }
    })

    console.log('✅ 图像生成结果:', JSON.stringify(result, null, 2))
    return true
  } catch (error) {
    console.error('❌ 图像生成测试失败:', error.message)
    return false
  }
}

/**
 * 测试完整的AI图像生成流程
 */
async function testFullAIImageGeneration() {
  console.log('🚀 测试完整的AI图像生成流程...')

  try {
    const result = await aiImageService.generateImages({
      clothingImages: [
        'https://example.com/clothing1.jpg',
        'https://example.com/clothing2.jpg'
      ],
      sceneType: 'indoor',
      stylePreference: 'modern',
      options: {
        size: '1024x1024',
        quality: 'standard',
        n: 2
      }
    })

    console.log('✅ 完整流程生成结果:', JSON.stringify(result, null, 2))
    return result.status === 'completed'
  } catch (error) {
    console.error('❌ 完整流程测试失败:', error.message)
    return false
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('🎯 开始SCF集成端到端测试')
  console.log('=====================================')

  const results = {
    scfService: false,
    imagePreprocessing: false,
    promptGeneration: false,
    imageGeneration: false,
    fullFlow: false
  }

  // 检查环境变量
  console.log('🔍 检查环境变量配置...')
  const requiredEnvVars = [
    'TENCENTCLOUD_SECRET_ID',
    'TENCENTCLOUD_SECRET_KEY',
    'TENCENTCLOUD_REGION',
    'COS_BUCKET'
  ]

  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar])
  if (missingEnvVars.length > 0) {
    console.warn('⚠️ 缺少环境变量:', missingEnvVars.join(', '))
    console.log('请配置这些环境变量后重新运行测试')
    console.log('测试将使用模拟数据，不会实际调用SCF函数')
  } else {
    console.log('✅ 环境变量配置完整')
  }

  console.log('=====================================')

  // 如果没有环境变量，跳过实际测试
  if (missingEnvVars.length > 0) {
    console.log('🔧 环境变量未配置，跳过实际SCF调用测试')
    console.log('💡 请先配置.env.local文件中的以下变量:')
    console.log('   - TENCENTCLOUD_SECRET_ID')
    console.log('   - TENCENTCLOUD_SECRET_KEY')
    console.log('   - TENCENTCLOUD_REGION')
    console.log('   - COS_BUCKET')
    return
  }

  // 依次运行测试
  results.scfService = await testSCFService()
  console.log('')

  if (results.scfService) {
    results.imagePreprocessing = await testImagePreprocessing()
    console.log('')

    results.promptGeneration = await testPromptGeneration()
    console.log('')

    results.imageGeneration = await testImageGeneration()
    console.log('')

    results.fullFlow = await testFullAIImageGeneration()
    console.log('')
  }

  // 输出测试结果总结
  console.log('📊 测试结果总结')
  console.log('=====================================')

  const totalTests = Object.keys(results).length
  const passedTests = Object.values(results).filter(Boolean).length

  console.log(`总测试数: ${totalTests}`)
  console.log(`通过测试: ${passedTests}`)
  console.log(`失败测试: ${totalTests - passedTests}`)
  console.log(`成功率: ${Math.round((passedTests / totalTests) * 100)}%`)
  console.log('')

  Object.entries(results).forEach(([testName, passed]) => {
    const status = passed ? '✅' : '❌'
    const displayName = {
      scfService: 'SCF服务连通性',
      imagePreprocessing: '图像预处理',
      promptGeneration: '提示词生成',
      imageGeneration: '图像生成',
      fullFlow: '完整AI生图流程'
    }
    console.log(`${status} ${displayName[testName]}`)
  })

  console.log('')
  if (passedTests === totalTests) {
    console.log('🎉 所有测试通过！SCF集成成功！')
  } else {
    console.log('⚠️ 部分测试失败，请检查配置和SCF函数部署')
  }

  console.log('=====================================')
  console.log('测试完成')
}

// 运行测试
runAllTests().catch(error => {
  console.error('💥 测试运行失败:', error)
  process.exit(1)
})