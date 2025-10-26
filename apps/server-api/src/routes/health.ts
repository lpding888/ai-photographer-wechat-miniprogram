import { FastifyInstance, FastifyRequest } from 'fastify'

export const registerHealthRoutes = async (app: FastifyInstance) => {
  // 基础健康检查
  app.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'ai-photographer-api'
    }
  })

  // 存活检查
  app.get('/health/live', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'ai-photographer-api'
    }
  })

  // 就绪检查（检查依赖服务）
  app.get('/health/ready', async (request, reply) => {
    const checks = {
      database: false,
      redis: false,
      circuitBreaker: true,
      clsRetryQueue: true
    }

    try {
      // 检查数据库连接
      const { getPrismaClient } = await import('@ai-photographer/db')
      const prisma = getPrismaClient()
      await prisma.$queryRaw`SELECT 1`
      checks.database = true
    } catch (error) {
      console.error('数据库检查失败:', error)
    }

    try {
      // 检查 Redis 连接
      const { checkQueueServiceConnection } = await import('../services/queue-service.js')
      checks.redis = await checkQueueServiceConnection()
    } catch (error) {
      console.error('Redis检查失败:', error)
      checks.redis = false
    }

    try {
      // 检查熔断器状态
      const circuitBreaker = (request.server as any).circuitBreaker
      if (circuitBreaker) {
        // 检查主要路径的熔断器状态
        const criticalPaths = ['/api/legacy', '/api/callbacks']
        for (const path of criticalPaths) {
          if (circuitBreaker.isOpen(path)) {
            checks.circuitBreaker = false
            break
          }
        }
      }
    } catch (error) {
      console.error('熔断器检查失败:', error)
      checks.circuitBreaker = false
    }

    try {
      // 检查CLS重试队列状态
      const { existsSync, readFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const retryQueuePath = join(process.cwd(), '.cls-retry-queue.json')

      if (existsSync(retryQueuePath)) {
        try {
          const queueData = readFileSync(retryQueuePath, 'utf8')
          const retryQueue = JSON.parse(queueData)

          // 如果重试队列中超过500条日志，标记为不健康
          if (retryQueue.length > 500) {
            checks.clsRetryQueue = false
          }
        } catch (error) {
          console.error('CLS重试队列解析失败:', error)
          checks.clsRetryQueue = false
        }
      }
    } catch (error) {
      console.error('CLS重试队列检查失败:', error)
      checks.clsRetryQueue = false
    }

    const allHealthy = Object.values(checks).every(Boolean)

    if (allHealthy) {
      reply.code(200)
      return {
        status: 'ready',
        checks,
        timestamp: new Date().toISOString()
      }
    } else {
      reply.code(503)
      return {
        status: 'not ready',
        checks,
        timestamp: new Date().toISOString()
      }
    }
  })
}
