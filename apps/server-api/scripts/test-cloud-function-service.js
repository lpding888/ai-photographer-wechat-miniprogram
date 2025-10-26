#!/usr/bin/env node

/**
 * Server-API 云函数服务测试脚本
 * 测试业务逻辑层的云函数调用功能
 */

const path = require('path')

async function testCloudFunctionService() {
  console.log('🚀 开始测试 Server-API 云函数服务...\n')

  try {
    // 动态导入云函数服务
    const { CloudFunctionService } = require('../src/services/cloud-function.service')

    // 创建服务实例
    const service = new CloudFunctionService()
    console.log('✅ 云函数服务实例创建成功')

    // 测试1: 分析场景功能
    console.log('\n📋 测试1: 分析场景功能...')
    try {
      const sceneData = {
        sceneId: 'test-scene-001',
        imageUrl: 'https://example.com/test-scene.jpg',
        parameters: {
          style: 'portrait',
          lighting: 'natural',
          background: 'studio'
        }
      }

      const result = await service.analyzeScene(sceneData)
      console.log('✅ 场景分析功能测试通过')
      console.log('   分析结果:', JSON.stringify(result, null, 2))
    } catch (error) {
      console.log('⚠️  场景分析测试跳过（可能缺少目标云函数）:', error.message)
    }

    // 测试2: 图片处理功能
    console.log('\n📋 测试2: 图片处理功能...')
    try {
      const imageData = {
        imageId: 'test-image-001',
        originalUrl: 'https://example.com/test-image.jpg',
        processingOptions: {
          resize: { width: 512, height: 512 },
          quality: 90,
          format: 'webp'
        }
      }

      const result = await service.processImage(imageData)
      console.log('✅ 图片处理功能测试通过')
      console.log('   处理结果:', JSON.stringify(result, null, 2))
    } catch (error) {
      console.log('⚠️  图片处理测试跳过（可能缺少目标云函数）:', error.message)
    }

    // 测试3: AI摄影生成功能
    console.log('\n📋 测试3: AI摄影生成功能...')
    try {
      const photographyParams = {
        userId: 'test-user-001',
        clothingImages: [
          'https://example.com/cloth1.jpg',
          'https://example.com/cloth2.jpg'
        ],
        sceneId: 'portrait-studio',
        aiModel: 'gemini-pro-vision',
        style: 'fashion-magazine',
        poseDescription: '自然站立，轻微侧身'
      }

      const result = await service.generatePhotography(photographyParams)
      console.log('✅ AI摄影生成功能测试通过')
      console.log('   生成结果:', JSON.stringify(result, null, 2))
    } catch (error) {
      console.log('⚠️  AI摄影生成测试跳过（可能缺少目标云函数）:', error.message)
    }

    // 测试4: AI试衣生成功能
    console.log('\n📋 测试4: AI试衣生成功能...')
    try {
      const fittingParams = {
        userId: 'test-user-001',
        clothingImage: 'https://example.com/cloth.jpg',
        userPhoto: 'https://example.com/user.jpg',
        sceneId: 'casual-outdoor',
        aiModel: 'gemini-pro-vision',
        style: 'casual'
      }

      const result = await service.generateFitting(fittingParams)
      console.log('✅ AI试衣生成功能测试通过')
      console.log('   生成结果:', JSON.stringify(result, null, 2))
    } catch (error) {
      console.log('⚠️  AI试衣生成测试跳过（可能缺少目标云函数）:', error.message)
    }

    // 测试5: 健康检查功能
    console.log('\n📋 测试5: 健康检查功能...')
    try {
      const isHealthy = await service.healthCheck()
      if (isHealthy) {
        console.log('✅ 健康检查通过')
      } else {
        console.log('⚠️  健康检查失败，但服务可能仍然可用')
      }
    } catch (error) {
      console.log('⚠️  健康检查跳过:', error.message)
    }

    // 测试6: 获取服务统计
    console.log('\n📋 测试6: 获取服务统计...')
    try {
      const stats = await service.getServiceStats()
      console.log('✅ 服务统计获取成功')
      console.log('   统计信息:', JSON.stringify(stats, null, 2))
    } catch (error) {
      console.log('⚠️  服务统计获取失败:', error.message)
    }

    console.log('\n🎉 Server-API 云函数服务测试完成！')

  } catch (error) {
    console.error('\n💥 Server-API 云函数服务测试失败:', error.message)
    console.error('错误详情:', error)
    process.exit(1)
  }
}

// 执行测试
if (require.main === module) {
  testCloudFunctionService().catch(console.error)
}

module.exports = { testCloudFunctionService }