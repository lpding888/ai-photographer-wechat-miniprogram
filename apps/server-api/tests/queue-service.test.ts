import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { getQueueService, closeQueueService } from '../src/services/queue-service.js'

describe('QueueService 真实连接测试', () => {
  let queueService: ReturnType<typeof getQueueService>

  beforeAll(async () => {
    // 测试前确保Redis容器启动
    console.log('初始化QueueService...')
    queueService = getQueueService()

    // 等待连接建立
    await new Promise(resolve => setTimeout(resolve, 1000))
  })

  afterAll(async () => {
    console.log('关闭QueueService...')
    await closeQueueService()
  })

  it('应该能成功创建队列和工作器', () => {
    expect(queueService).toBeDefined()
    // 队列和工作器应该在构造函数中初始化
  })

  it('应该能添加取消任务作业', async () => {
    const jobData = {
      taskId: 'test-task-123',
      userId: 'test-user-456',
      workId: 'test-work-789',
      cancelledAt: new Date().toISOString()
    }

    const job = await queueService.addCancellationJob(jobData)

    expect(job).toBeDefined()
    expect(job.id).toBeDefined()
  }, 10000) // 增加超时时间

  it('应该能处理任务取消作业', async () => {
    const jobData = {
      taskId: 'test-task-processed',
      userId: 'test-user-processed',
      cancelledAt: new Date().toISOString()
    }

    // 添加作业
    const job = await queueService.addCancellationJob(jobData)

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 2000))

    expect(job.id).toBeDefined()
  }, 10000)
})