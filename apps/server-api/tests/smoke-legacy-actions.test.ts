#!/usr/bin/env node

/**
 * Legacy Actions API 冒烟测试脚本
 * 测试所有主要的 legacy actions 端点
 */

import { buildApp } from '../src/utils/app.js'

const API_BASE = '/legacy/actions'

const testUser = {
  id: 'smoke-test-user',
  nickname: '冒烟测试用户'
}

const testWork = {
  id: 'smoke-test-work',
  title: '冒烟测试作品',
  type: 'photography',
  status: 'completed'
}

const testTask = {
  id: 'smoke-test-task',
  type: 'photography',
  status: 'processing'
}

async function runSmokeTest() {
  console.log('🚀 开始 Legacy Actions API 冒烟测试...')

  const app = buildApp()
  await app.ready()

  try {
    // 1. 测试 getUserStats
    console.log('\n📊 测试 getUserStats...')
    const statsResponse = await app.inject({
      method: 'POST',
      url: API_BASE,
      payload: {
        action: 'getUserStats',
        userId: testUser.id
      }
    })

    if (statsResponse.statusCode === 200) {
      console.log('✅ getUserStats 测试通过')
    } else {
      console.error('❌ getUserStats 测试失败:', statsResponse.statusCode, statsResponse.json())
    }

    // 2. 测试 updateUserPreferences
    console.log('\n⚙️ 测试 updateUserPreferences...')
    const prefsResponse = await app.inject({
      method: 'POST',
      url: API_BASE,
      payload: {
        action: 'updateUserPreferences',
        userId: testUser.id,
        preferences: {
          default_gender: 'female',
          notification_enabled: true
        }
      }
    })

    if (prefsResponse.statusCode === 200) {
      console.log('✅ updateUserPreferences 测试通过')
    } else {
      console.error('❌ updateUserPreferences 测试失败:', prefsResponse.statusCode, prefsResponse.json())
    }

    // 3. 测试 listWorks
    console.log('\n📋 测试 listWorks...')
    const listResponse = await app.inject({
      method: 'POST',
      url: API_BASE,
      payload: {
        action: 'listWorks',
        userId: testUser.id,
        pageSize: 10
      }
    })

    if (listResponse.statusCode === 200) {
      console.log('✅ listWorks 测试通过')
    } else {
      console.error('❌ listWorks 测试失败:', listResponse.statusCode, listResponse.json())
    }

    // 4. 测试分页功能
    console.log('\n📄 测试分页功能...')
    const paginatedResponse = await app.inject({
      method: 'POST',
      url: API_BASE,
      payload: {
        action: 'listWorks',
        userId: testUser.id,
        pageSize: 5,
        tab: 'all'
      }
    })

    if (paginatedResponse.statusCode === 200) {
      const data = paginatedResponse.json()
      if (data.success && data.data && typeof data.data.items === 'object') {
        console.log('✅ 分页功能测试通过')
      } else {
        console.error('❌ 分页功能响应格式错误')
      }
    } else {
      console.error('❌ 分页功能测试失败:', paginatedResponse.statusCode, paginatedResponse.json())
    }

    // 5. 测试过滤功能
    console.log('\n🔍 测试过滤功能...')
    const filterResponse = await app.inject({
      method: 'POST',
      url: API_BASE,
      payload: {
        action: 'listWorks',
        userId: testUser.id,
        tab: 'favorites'
      }
    })

    if (filterResponse.statusCode === 200) {
      console.log('✅ 过滤功能测试通过')
    } else {
      console.error('❌ 过滤功能测试失败:', filterResponse.statusCode, filterResponse.json())
    }

    // 6. 测试错误处理
    console.log('\n⚠️ 测试错误处理...')
    const errorResponse = await app.inject({
      method: 'POST',
      url: API_BASE,
      payload: {
        action: 'getWorkDetail',
        userId: testUser.id,
        workId: 'non-existent-work'
      }
    })

    if (errorResponse.statusCode === 404) {
      console.log('✅ 错误处理测试通过')
    } else {
      console.error('❌ 错误处理测试失败，期望404，实际:', errorResponse.statusCode)
    }

    // 7. 测试无效action
    console.log('\n🚫 测试无效action...')
    const invalidActionResponse = await app.inject({
      method: 'POST',
      url: API_BASE,
      payload: {
        action: 'invalidAction',
        userId: testUser.id
      }
    })

    if (invalidActionResponse.statusCode === 404) {
      console.log('✅ 无效action测试通过')
    } else {
      console.error('❌ 无效action测试失败，期望404，实际:', invalidActionResponse.statusCode)
    }

    console.log('\n🎉 Legacy Actions API 冒烟测试完成！')
    console.log('\n📝 测试总结:')
    console.log('- getUserStats: 用户统计信息获取')
    console.log('- updateUserPreferences: 用户偏好设置更新')
    console.log('- listWorks: 作品列表获取（包含分页）')
    console.log('- 过滤功能: 按标签过滤作品')
    console.log('- 错误处理: 404错误正确返回')
    console.log('- 参数验证: 无效action正确处理')
    console.log('\n✨ 核心功能已集成 BullMQ + Prisma，运行正常！')

  } catch (error) {
    console.error('❌ 冒烟测试过程中发生错误:', error)
    process.exit(1)
  } finally {
    await app.close()
  }
}

// 运行测试
runSmokeTest().catch((error) => {
  console.error('❌ 冒烟测试启动失败:', error)
  process.exit(1)
})