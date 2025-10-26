import { afterEach, beforeEach, describe, expect, it, afterAll, beforeAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { getQueueService, closeQueueService } from '../src/services/queue-service.js'
import { legacyUsersService } from '../src/services/legacy/users.service.js'
import { legacyWorksService } from '../src/services/legacy/works.service.js'
import { buildApp } from '../src/utils/app.js'

const prisma = new PrismaClient()

const TEST_USER_ID = 'test-user-integration'
const TEST_WORK_ID = 'test-work-integration'

beforeEach(async () => {
  // 清理测试数据
  await prisma.task.deleteMany({ where: { userId: TEST_USER_ID } })
  await prisma.workImage.deleteMany({ where: { workId: TEST_WORK_ID } })
  await prisma.work.deleteMany({ where: { id: TEST_WORK_ID } })
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } })

  // 创建测试用户
  await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      nickname: '集成测试用户',
      credits: 100,
      totalCredits: 200,
      totalConsumedCredits: 100,
      totalEarnedCredits: 200,
      status: 'active',
      metadata: {
        preferences: {
          default_gender: 'female',
          default_age: 25,
          notification_enabled: true
        }
      }
    }
  })

  // 初始化队列服务
  const queueService = getQueueService()
  // 等待队列服务连接建立
  await new Promise(resolve => setTimeout(resolve, 500))
})

afterEach(async () => {
  // 清理测试数据
  await prisma.task.deleteMany({ where: { userId: TEST_USER_ID } })
  await prisma.workImage.deleteMany({ where: { workId: TEST_WORK_ID } })
  await prisma.work.deleteMany({ where: { id: TEST_WORK_ID } })
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } })
})

// 在所有测试结束后关闭队列服务
afterAll(async () => {
  await closeQueueService()
  await prisma.$disconnect()
})

describe('legacy integration tests', () => {
  describe('works service', () => {
    it('should list works with pagination', async () => {
      // 创建测试作品
      const works = await Promise.all([
        prisma.work.create({
          data: {
            id: 'work-1',
            userId: TEST_USER_ID,
            type: 'photography',
            status: 'completed',
            title: '摄影作品1',
            isFavorite: true
          }
        }),
        prisma.work.create({
          data: {
            id: 'work-2',
            userId: TEST_USER_ID,
            type: 'fitting',
            status: 'processing',
            title: '试衣作品1',
            isFavorite: false
          }
        }),
        prisma.work.create({
          data: {
            id: 'work-3',
            userId: TEST_USER_ID,
            type: 'photography',
            status: 'completed',
            title: '摄影作品2',
            isFavorite: false
          }
        })
      ])

      // 测试分页
      const result1 = await legacyWorksService.listWorks({
        userId: TEST_USER_ID,
        pageSize: 2
      })

      expect(result1.items).toHaveLength(2)
      expect(result1.nextCursor).toBeDefined()

      // 测试下一页
      const result2 = await legacyWorksService.listWorks({
        userId: TEST_USER_ID,
        pageSize: 2,
        lastId: result1.nextCursor?.lastId,
        lastCreatedAt: result1.nextCursor?.lastCreatedAt?.toISOString()
      })

      expect(result2.items).toHaveLength(1)
      expect(result2.nextCursor).toBeUndefined()
    })

    it('should filter works by tab', async () => {
      // 创建测试作品
      await Promise.all([
        prisma.work.create({
          data: {
            id: 'work-photo',
            userId: TEST_USER_ID,
            type: 'photography',
            status: 'completed',
            title: '摄影作品',
            isFavorite: true
          }
        }),
        prisma.work.create({
          data: {
            id: 'work-fitting',
            userId: TEST_USER_ID,
            type: 'fitting',
            status: 'processing',
            title: '试衣作品',
            isFavorite: false
          }
        })
      ])

      // 测试摄影标签过滤
      const photoResult = await legacyWorksService.listWorks({
        userId: TEST_USER_ID,
        tab: 'photography'
      })

      expect(photoResult.items).toHaveLength(1)
      expect(photoResult.items[0].type).toBe('photography')

      // 测试试衣标签过滤
      const fittingResult = await legacyWorksService.listWorks({
        userId: TEST_USER_ID,
        tab: 'fitting'
      })

      expect(fittingResult.items).toHaveLength(1)
      expect(fittingResult.items[0].type).toBe('fitting')

      // 测试收藏标签过滤
      const favoriteResult = await legacyWorksService.listWorks({
        userId: TEST_USER_ID,
        tab: 'favorites'
      })

      expect(favoriteResult.items).toHaveLength(1)
      expect(favoriteResult.items[0].isFavorite).toBe(true)
    })

    it('should toggle work favorite status', async () => {
      // 创建测试作品
      const work = await prisma.work.create({
        data: {
          id: TEST_WORK_ID,
          userId: TEST_USER_ID,
          type: 'photography',
          status: 'completed',
          title: '测试作品',
          isFavorite: false
        }
      })

      // 测试收藏
      const favoriteResult = await legacyWorksService.toggleFavorite(TEST_WORK_ID, TEST_USER_ID)
      expect(favoriteResult).toBe(true)

      // 验证数据库状态
      const updatedWork = await prisma.work.findUnique({ where: { id: TEST_WORK_ID } })
      expect(updatedWork?.isFavorite).toBe(true)

      // 测试取消收藏
      const unfavoriteResult = await legacyWorksService.toggleFavorite(TEST_WORK_ID, TEST_USER_ID)
      expect(unfavoriteResult).toBe(false)

      // 验证数据库状态
      const finalWork = await prisma.work.findUnique({ where: { id: TEST_WORK_ID } })
      expect(finalWork?.isFavorite).toBe(false)
    })

    it('should delete work', async () => {
      // 创建测试作品和图片
      const work = await prisma.work.create({
        data: {
          id: TEST_WORK_ID,
          userId: TEST_USER_ID,
          type: 'photography',
          status: 'completed',
          title: '测试作品',
          images: {
            create: [
              { url: 'https://example.com/image1.jpg', sortOrder: 0 },
              { url: 'https://example.com/image2.jpg', sortOrder: 1 }
            ]
          }
        },
        include: { images: true }
      })

      // 测试删除
      const deleteResult = await legacyWorksService.deleteWork(TEST_WORK_ID, TEST_USER_ID)
      expect(deleteResult).toBe(true)

      // 验证作品已删除
      const deletedWork = await prisma.work.findUnique({ where: { id: TEST_WORK_ID } })
      expect(deletedWork).toBeNull()

      // 验证图片已删除
      const images = await prisma.workImage.findMany({ where: { workId: TEST_WORK_ID } })
      expect(images).toHaveLength(0)
    })

    it('should get work detail', async () => {
      // 创建测试作品和图片
      const work = await prisma.work.create({
        data: {
          id: TEST_WORK_ID,
          userId: TEST_USER_ID,
          type: 'photography',
          status: 'completed',
          title: '测试作品',
          images: {
            create: [
              { url: 'https://example.com/image1.jpg', sortOrder: 0 },
              { url: 'https://example.com/image2.jpg', sortOrder: 1 }
            ]
          }
        },
        include: { images: true }
      })

      // 测试获取详情
      const detail = await legacyWorksService.getWorkDetail(TEST_WORK_ID, TEST_USER_ID)
      expect(detail).toBeDefined()
      expect(detail?.id).toBe(TEST_WORK_ID)
      expect(detail?.images).toHaveLength(2)
      expect(detail?.cover_url).toBe('https://example.com/image1.jpg')
    })

    it('should cancel task with BullMQ integration', async () => {
      // 创建测试任务和作品
      const task = await prisma.task.create({
        data: {
          id: 'task-cancel-test',
          userId: TEST_USER_ID,
          type: 'photography',
          status: 'processing',
          progress: 50,
          workId: TEST_WORK_ID
        }
      })

      const work = await prisma.work.create({
        data: {
          id: TEST_WORK_ID,
          userId: TEST_USER_ID,
          type: 'photography',
          status: 'processing',
          title: '测试任务作品',
          taskId: 'task-cancel-test'
        }
      })

      // 获取真实的队列服务
      const queueService = getQueueService()
      expect(queueService).toBeDefined()

      // 测试取消任务 - 这会使用真实的BullMQ队列
      const cancelResult = await legacyWorksService.cancelTask('task-cancel-test', TEST_USER_ID)
      expect(cancelResult).toBe(true)

      // 验证任务状态已更新
      const cancelledTask = await prisma.task.findUnique({ where: { id: 'task-cancel-test' } })
      expect(cancelledTask?.status).toBe('cancelled')
      expect(cancelledTask?.cancelledAt).toBeDefined()

      // 验证作品状态已更新
      const cancelledWork = await prisma.work.findUnique({ where: { id: TEST_WORK_ID } })
      expect(cancelledWork?.status).toBe('cancelled')

      // 等待一下让队列作业处理
      await new Promise(resolve => setTimeout(resolve, 1000))
    }, 15000) // 增加超时时间以处理真实的队列操作
  })

  describe('users service', () => {
    it('should get user stats with real database queries', async () => {
      // 创建测试作品
      await Promise.all([
        prisma.work.create({
          data: {
            id: 'work-1',
            userId: TEST_USER_ID,
            type: 'photography',
            status: 'completed',
            title: '摄影作品',
            isFavorite: true,
            createdAt: new Date('2024-01-01')
          }
        }),
        prisma.work.create({
          data: {
            id: 'work-2',
            userId: TEST_USER_ID,
            type: 'fitting',
            status: 'processing',
            title: '试衣作品',
            isFavorite: false,
            createdAt: new Date('2024-01-02')
          }
        })
      ])

      // 创建测试任务
      await Promise.all([
        prisma.task.create({
          data: {
            id: 'task-1',
            userId: TEST_USER_ID,
            type: 'photography',
            status: 'completed',
            createdAt: new Date('2024-01-01')
          }
        }),
        prisma.task.create({
          data: {
            id: 'task-2',
            userId: TEST_USER_ID,
            type: 'fitting',
            status: 'processing',
            createdAt: new Date('2024-01-02')
          }
        })
      ])

      // 测试获取统计 - 这会执行真实的数据库查询
      const stats = await legacyUsersService.getUserStats(TEST_USER_ID)
      expect(stats).toBeDefined()
      expect(stats?.user_info.id).toBe(TEST_USER_ID)
      expect(stats?.user_info.nickname).toBe('集成测试用户')
      expect(stats?.user_info.credits).toBe(100)

      // 验证作品统计
      expect(stats?.work_stats.total).toBe(2)
      expect(stats?.work_stats.photography).toBe(1)
      expect(stats?.work_stats.fitting).toBe(1)
      expect(stats?.work_stats.favorites).toBe(1)
      expect(stats?.work_stats.completed).toBe(1)
      expect(stats?.work_stats.processing).toBe(1)

      // 验证任务统计
      // expect(stats?.task_stats.total).toBe(2)
      // expect(stats?.task_stats.completed).toBe(1)
      // expect(stats?.task_stats.processing).toBe(1)
    })

    it('should update user preferences in metadata', async () => {
      // 测试更新偏好设置
      const preferences = {
        default_gender: 'female',
        default_age: 25,
        notification_enabled: true
      }

      // 执行真实的数据库更新操作
      const result = await legacyUsersService.updateUserPreferences(TEST_USER_ID, preferences)
      expect(result).toBeDefined()
      expect(result?.id).toBe(TEST_USER_ID)
      expect(result?.preferences.default_gender).toBe('female')
      expect(result?.preferences.default_age).toBe(25)
      expect(result?.preferences.notification_enabled).toBe(true)

      // 验证数据库中的metadata字段已更新
      const updatedUser = await prisma.user.findUnique({ where: { id: TEST_USER_ID } })
      expect(updatedUser).toBeDefined()
      expect(updatedUser?.metadata).toBeDefined()

      const metadata = updatedUser?.metadata as Record<string, unknown> | null
      const userPreferences = metadata?.preferences as Record<string, unknown>
      expect(userPreferences.default_gender).toBe('female')
      expect(userPreferences.default_age).toBe(25)
      expect(userPreferences.notification_enabled).toBe(true)
    })

    it('should filter invalid preference keys', async () => {
      // 测试过滤无效偏好设置
      const preferences = {
        default_gender: 'male',
        invalid_key: 'should_be_ignored',
        another_invalid: 'also_ignored'
      }

      const result = await legacyUsersService.updateUserPreferences(TEST_USER_ID, preferences)
      expect(result).toBeDefined()
      expect(result?.preferences.default_gender).toBe('male')
      expect(result?.preferences.invalid_key).toBeUndefined()
      expect(result?.preferences.another_invalid).toBeUndefined()
    })

    it('should handle full user preferences workflow', async () => {
      // 完整的用户偏好设置工作流测试
      const initialStats = await legacyUsersService.getUserStats(TEST_USER_ID)
      expect(initialStats?.user_info.preferences.default_gender).toBe('female')

      // 更新偏好
      const newPreferences = {
        default_gender: 'male',
        default_age: 30,
        notification_enabled: false,
        theme: 'dark'
      }

      const updatedResult = await legacyUsersService.updateUserPreferences(TEST_USER_ID, newPreferences)
      expect(updatedResult?.preferences.default_gender).toBe('male')
      expect(updatedResult?.preferences.default_age).toBe(30)
      expect(updatedResult?.preferences.notification_enabled).toBe(false)
      expect(updatedResult?.preferences.theme).toBeUndefined() // 应该被过滤

      // 重新获取统计验证更新生效
      const newStats = await legacyUsersService.getUserStats(TEST_USER_ID)
      expect(newStats?.user_info.preferences.default_gender).toBe('male')
      expect(newStats?.user_info.preferences.default_age).toBe(30)
      expect(newStats?.user_info.preferences.notification_enabled).toBe(false)
    })
  })

  describe('API integration', () => {
    let app: any

    beforeAll(async () => {
      app = buildApp()
      await app.ready()
    })

    afterAll(async () => {
      if (app) await app.close()
    })

    it('should handle all legacy actions via real API', async () => {
      // 创建测试作品
      const work = await prisma.work.create({
        data: {
          id: TEST_WORK_ID,
          userId: TEST_USER_ID,
          type: 'photography',
          status: 'completed',
          title: 'API测试作品',
          isFavorite: false,
          images: {
            create: [
              { url: 'https://example.com/api-test-1.jpg', sortOrder: 0 },
              { url: 'https://example.com/api-test-2.jpg', sortOrder: 1 }
            ]
          }
        }
      })

      // 测试作品列表API
      const listResponse = await app.inject({
        method: 'POST',
        url: '/legacy/actions',
        payload: {
          action: 'listWorks',
          userId: TEST_USER_ID,
          pageSize: 10
        }
      })

      expect(listResponse.statusCode).toBe(200)
      const listBody = listResponse.json()
      expect(listBody.success).toBe(true)
      expect(listBody.data.items).toHaveLength(1)
      expect(listBody.data.items[0].id).toBe(TEST_WORK_ID)

      // 测试作品详情API
      const detailResponse = await app.inject({
        method: 'POST',
        url: '/legacy/actions',
        payload: {
          action: 'getWorkDetail',
          userId: TEST_USER_ID,
          workId: TEST_WORK_ID
        }
      })

      expect(detailResponse.statusCode).toBe(200)
      const detailBody = detailResponse.json()
      expect(detailBody.success).toBe(true)
      expect(detailBody.data.id).toBe(TEST_WORK_ID)
      expect(detailBody.data.images).toHaveLength(2)

      // 测试收藏API
      const favoriteResponse = await app.inject({
        method: 'POST',
        url: '/legacy/actions',
        payload: {
          action: 'toggleFavorite',
          userId: TEST_USER_ID,
          workId: TEST_WORK_ID
        }
      })

      expect(favoriteResponse.statusCode).toBe(200)
      const favoriteBody = favoriteResponse.json()
      expect(favoriteBody.success).toBe(true)
      expect(favoriteBody.data.isFavorite).toBe(true)

      // 测试用户统计API
      const statsResponse = await app.inject({
        method: 'POST',
        url: '/legacy/actions',
        payload: {
          action: 'getUserStats',
          userId: TEST_USER_ID
        }
      })

      expect(statsResponse.statusCode).toBe(200)
      const statsBody = statsResponse.json()
      expect(statsBody.success).toBe(true)
      expect(statsBody.data.user_info.id).toBe(TEST_USER_ID)
      expect(statsBody.data.work_stats.total).toBe(1)

      // 测试更新用户偏好API
      const prefsResponse = await app.inject({
        method: 'POST',
        url: '/legacy/actions',
        payload: {
          action: 'updateUserPreferences',
          userId: TEST_USER_ID,
          preferences: {
            default_gender: 'male',
            default_age: 35,
            notification_enabled: false
          }
        }
      })

      expect(prefsResponse.statusCode).toBe(200)
      const prefsBody = prefsResponse.json()
      expect(prefsBody.success).toBe(true)
      expect(prefsBody.data.preferences.default_gender).toBe('male')
      expect(prefsBody.data.preferences.default_age).toBe(35)
      expect(prefsBody.data.preferences.notification_enabled).toBe(false)

      // 测试任务取消API（使用真实的BullMQ）
      const task = await prisma.task.create({
        data: {
          id: 'api-cancel-test',
          userId: TEST_USER_ID,
          type: 'photography',
          status: 'processing',
          workId: TEST_WORK_ID
        }
      })

      const cancelResponse = await app.inject({
        method: 'POST',
        url: '/legacy/actions',
        payload: {
          action: 'cancelTask',
          userId: TEST_USER_ID,
          taskId: 'api-cancel-test'
        }
      })

      expect(cancelResponse.statusCode).toBe(200)
      const cancelBody = cancelResponse.json()
      expect(cancelBody.success).toBe(true)

      // 验证任务确实被取消
      const cancelledTask = await prisma.task.findUnique({ where: { id: 'api-cancel-test' } })
      expect(cancelledTask?.status).toBe('cancelled')
    }, 20000) // 增加超时时间以处理所有操作

    it('should handle API error cases correctly', async () => {
      // 测试无效action
      const invalidActionResponse = await app.inject({
        method: 'POST',
        url: '/legacy/actions',
        payload: {
          action: 'invalidAction',
          userId: TEST_USER_ID
        }
      })

      expect(invalidActionResponse.statusCode).toBe(404)
      const invalidActionBody = invalidActionResponse.json()
      expect(invalidActionBody.success).toBe(false)

      // 测试缺少用户ID
      const noUserResponse = await app.inject({
        method: 'POST',
        url: '/legacy/actions',
        payload: {
          action: 'listWorks'
        }
      })

      expect(noUserResponse.statusCode).toBe(401)
      const noUserBody = noUserResponse.json()
      expect(noUserBody.success).toBe(false)

      // 测试不存在的作品
      const notFoundResponse = await app.inject({
        method: 'POST',
        url: '/legacy/actions',
        payload: {
          action: 'getWorkDetail',
          userId: TEST_USER_ID,
          workId: 'non-existent-work'
        }
      })

      expect(notFoundResponse.statusCode).toBe(404)
      const notFoundBody = notFoundResponse.json()
      expect(notFoundBody.success).toBe(false)
    })
  })
})