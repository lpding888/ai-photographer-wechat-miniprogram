#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/utils/app.js'

const prisma = new PrismaClient()

const TEST_USER_ID = 'smoke-test-user'
const TEST_WORK_ID = 'smoke-test-work'

async function setupTestData() {
  console.log('🧹 清理测试数据...')
  
  // 清理测试数据
  await prisma.workImage.deleteMany({ where: { workId: TEST_WORK_ID } })
  await prisma.work.deleteMany({ where: { id: TEST_WORK_ID } })
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } })
  
  // 创建测试用户
  await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      nickname: '冒烟测试用户',
      credits: 100,
      totalCredits: 200,
      totalConsumedCredits: 100,
      totalEarnedCredits: 200,
      status: 'active',
      metadata: {
        preferences: {}
      }
    }
  })
  
  console.log('✅ 测试数据设置完成')
}

async function runSmokeTest() {
  console.log('🚀 开始冒烟测试...')
  
  const app = buildApp()
  await app.ready()
  
  try {
    // 测试1: 创建作品
    console.log('📝 测试创建作品...')
    const createWorkResponse = await app.inject({
      method: 'POST',
      url: '/legacy/actions',
      payload: {
        action: 'listWorks',
        userId: TEST_USER_ID,
        pageSize: 10
      }
    })
    
    if (createWorkResponse.statusCode !== 200) {
      throw new Error(`创建作品失败: ${createWorkResponse.statusCode}`)
    }
    
    const createWorkBody = createWorkResponse.json()
    if (!createWorkBody.success) {
      throw new Error(`创建作品失败: ${createWorkBody.message}`)
    }
    
    console.log('✅ 作品列表查询成功')
    
    // 测试2: 更新用户偏好设置
    console.log('⚙️ 测试更新用户偏好设置...')
    const updatePrefsResponse = await app.inject({
      method: 'POST',
      url: '/legacy/actions',
      payload: {
        action: 'updateUserPreferences',
        userId: TEST_USER_ID,
        preferences: {
          default_gender: 'female',
          notification_enabled: true
        }
      }
    })
    
    if (updatePrefsResponse.statusCode !== 200) {
      throw new Error(`更新偏好设置失败: ${updatePrefsResponse.statusCode}`)
    }
    
    const updatePrefsBody = updatePrefsResponse.json()
    if (!updatePrefsBody.success) {
      throw new Error(`更新偏好设置失败: ${updatePrefsBody.message}`)
    }
    
    console.log('✅ 用户偏好设置更新成功')
    
    // 测试3: 获取用户统计
    console.log('📊 测试获取用户统计...')
    const getStatsResponse = await app.inject({
      method: 'POST',
      url: '/legacy/actions',
      payload: {
        action: 'getUserStats',
        userId: TEST_USER_ID
      }
    })
    
    if (getStatsResponse.statusCode !== 200) {
      throw new Error(`获取用户统计失败: ${getStatsResponse.statusCode}`)
    }
    
    const getStatsBody = getStatsResponse.json()
    if (!getStatsBody.success) {
      throw new Error(`获取用户统计失败: ${getStatsBody.message}`)
    }
    
    console.log('✅ 用户统计获取成功')
    
    // 测试4: 健康检查
    console.log('🏥 测试健康检查...')
    const healthResponse = await app.inject({
      method: 'GET',
      url: '/health/live'
    })
    
    if (healthResponse.statusCode !== 200) {
      throw new Error(`健康检查失败: ${healthResponse.statusCode}`)
    }
    
    console.log('✅ 健康检查通过')
    
    console.log('🎉 冒烟测试全部通过!')
    return true
    
  } catch (error) {
    console.error('❌ 冒烟测试失败:', error)
    return false
  } finally {
    await app.close()
  }
}

async function cleanupTestData() {
  console.log('🧹 清理测试数据...')
  
  try {
    await prisma.workImage.deleteMany({ where: { workId: TEST_WORK_ID } })
    await prisma.work.deleteMany({ where: { id: TEST_WORK_ID } })
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } })
    console.log('✅ 测试数据清理完成')
  } catch (error) {
    console.error('清理测试数据失败:', error)
  }
}

async function main() {
  try {
    await setupTestData()
    const success = await runSmokeTest()
    await cleanupTestData()
    
    process.exit(success ? 0 : 1)
  } catch (error) {
    console.error('冒烟测试执行失败:', error)
    await cleanupTestData()
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

const isInvokedDirectly = Boolean(process.argv[1]?.includes('smoke-test'))
if (isInvokedDirectly) {
  void main()
}

export { runSmokeTest }
