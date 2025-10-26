import { FastifyInstance } from 'fastify'
import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface ClsRetryEntry {
  id: string
  chunk: string
  timestamp: number
  retryCount: number
  nextRetryTime: number
}

export const registerClsAdminRoutes = async (app: FastifyInstance) => {
  const retryQueuePath = join(process.cwd(), '.cls-retry-queue.json')

  // 获取CLS重试队列状态
  app.get('/admin/cls/retry-queue', async (request, reply) => {
    try {
      if (!existsSync(retryQueuePath)) {
        return {
          success: true,
          data: {
            queueSize: 0,
            entries: [],
            totalFailed: 0
          }
        }
      }

      const queueData = readFileSync(retryQueuePath, 'utf8')
      const retryQueue: ClsRetryEntry[] = JSON.parse(queueData)

      // 计算统计信息
      const totalFailed = retryQueue.length
      const oldestEntry = retryQueue.length > 0 ? Math.min(...retryQueue.map(e => e.timestamp)) : 0
      const newestEntry = retryQueue.length > 0 ? Math.max(...retryQueue.map(e => e.timestamp)) : 0

      return {
        success: true,
        data: {
          queueSize: totalFailed,
          oldestEntry: oldestEntry > 0 ? new Date(oldestEntry).toISOString() : null,
          newestEntry: newestEntry > 0 ? new Date(newestEntry).toISOString() : null,
          entries: retryQueue.slice(0, 50).map(entry => ({
            id: entry.id,
            timestamp: new Date(entry.timestamp).toISOString(),
            retryCount: entry.retryCount,
            nextRetryTime: new Date(entry.nextRetryTime).toISOString(),
            chunkPreview: entry.chunk.substring(0, 100) + (entry.chunk.length > 100 ? '...' : '')
          })),
          totalFailed
        }
      }
    } catch (error) {
      app.log.error({ err: error }, '获取CLS重试队列状态失败')
      reply.code(500)
      return {
        success: false,
        message: '获取CLS重试队列状态失败'
      }
    }
  })

  // 清空CLS重试队列
  app.delete('/admin/cls/retry-queue', async (request, reply) => {
    try {
      if (existsSync(retryQueuePath)) {
        unlinkSync(retryQueuePath)
        app.log.info({ action: 'clear-queue' }, 'CLS重试队列已清空')
      }

      return {
        success: true,
        message: 'CLS重试队列已清空'
      }
    } catch (error) {
      app.log.error({ err: error }, '清空CLS重试队列失败')
      reply.code(500)
      return {
        success: false,
        message: '清空CLS重试队列失败'
      }
    }
  })

  // 手动触发CLS重试队列处理
  app.post('/admin/cls/retry-queue/process', async (request, reply) => {
    try {
      if (!existsSync(retryQueuePath)) {
        return {
          success: true,
          message: '没有需要处理的重试队列',
          processedCount: 0,
          failedCount: 0
        }
      }

      const queueData = readFileSync(retryQueuePath, 'utf8')
      const retryQueue: ClsRetryEntry[] = JSON.parse(queueData)

      if (retryQueue.length === 0) {
        return {
          success: true,
          message: '重试队列为空',
          processedCount: 0,
          failedCount: 0
        }
      }

      // 直接从环境变量获取CLS配置，避免创建ClsStream实例
      const clsConfig = {
        enabled: process.env.CLS_ENABLED === 'true',
        endpoint: process.env.CLS_ENDPOINT || null,
        topicId: process.env.CLS_TOPIC_ID || null,
        secretId: process.env.CLS_SECRET_ID || null,
        secretKey: process.env.CLS_SECRET_KEY || null
      }

      if (!clsConfig.enabled || !clsConfig.endpoint || !clsConfig.topicId) {
        return {
          success: false,
          message: 'CLS配置不完整，无法执行重试'
        }
      }

      let processedCount = 0
      let failedCount = 0
      const remainingQueue: ClsRetryEntry[] = []

      // 手动重试逻辑
      for (const entry of retryQueue) {
        try {
          const response = await fetch(clsConfig.endpoint!, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CLS-TopicId': clsConfig.topicId!,
              ...(clsConfig.secretId ? { 'X-CLS-SecretId': clsConfig.secretId } : {}),
              ...(clsConfig.secretKey ? { 'X-CLS-SecretKey': clsConfig.secretKey } : {}),
            },
            body: entry.chunk,
            signal: AbortSignal.timeout(10000) // 10秒超时
          })

          if (!response.ok) {
            throw new Error(`CLS推送失败: HTTP ${response.status} ${response.statusText}`)
          }

          processedCount++
          app.log.info({ entryId: entry.id, retryCount: entry.retryCount }, `手动重试成功: ${entry.id}`)
        } catch (error) {
          failedCount++
          entry.retryCount++

          if (entry.retryCount < 3) {
            // 重新计算下次重试时间
            const exponentialDelay = Math.min(1000 * Math.pow(2, entry.retryCount), 30000)
            entry.nextRetryTime = Date.now() + exponentialDelay
            remainingQueue.push(entry)
          app.log.warn({ err: error }, `手动重试失败，保留在队列中: ${entry.id}`)
        } else {
          app.log.error({ err: error }, `手动重试失败，达到最大重试次数，丢弃: ${entry.id}`)
        }
      }
      }

      // 保存剩余的重试队列
      if (remainingQueue.length > 0) {
        writeFileSync(retryQueuePath, JSON.stringify(remainingQueue, null, 2))
      } else {
        // 队列为空则删除文件
        unlinkSync(retryQueuePath)
      }

      app.log.info(
        {
          processedCount,
          failedCount,
          remainingCount: remainingQueue.length,
          totalProcessed: processedCount + failedCount
        },
        `手动处理CLS重试队列完成，成功${processedCount}条，失败${failedCount}条，剩余${remainingQueue.length}条`
      )

      return {
        success: true,
        message: `手动处理完成，成功${processedCount}条，失败${failedCount}条，剩余${remainingQueue.length}条`,
        processedCount,
        failedCount,
        remainingCount: remainingQueue.length
      }
    } catch (error) {
      app.log.error({ err: error }, '手动处理CLS重试队列失败')
      reply.code(500)
      return {
        success: false,
        message: '手动处理CLS重试队列失败'
      }
    }
  })

  // 获取CLS配置状态
  app.get('/admin/cls/config', async (request, reply) => {
    try {
      // 从环境变量读取CLS配置，避免创建ClsStream实例
      const clsConfig = {
        enabled: process.env.CLS_ENABLED === 'true',
        endpoint: process.env.CLS_ENDPOINT || null,
        topicId: process.env.CLS_TOPIC_ID || null,
        secretId: process.env.CLS_SECRET_ID || null,
        secretKey: process.env.CLS_SECRET_KEY || null
      }

      // 检查重试队列文件状态
      let queueStats: { exists: boolean; size: number; lastModified: string | null } = {
        exists: false,
        size: 0,
        lastModified: null
      }

      if (existsSync(retryQueuePath)) {
        try {
          const fileStats = statSync(retryQueuePath)
          const queueData = readFileSync(retryQueuePath, 'utf8')
          const queue = JSON.parse(queueData)
          queueStats = {
            exists: true,
            size: queue.length,
            lastModified: fileStats.mtime.toISOString()
          }
        } catch (error) {
          app.log.warn({ err: error }, '无法读取重试队列文件状态')
        }
      }

      return {
        success: true,
        data: {
          cls: clsConfig,
          queue: {
            filePath: retryQueuePath,
            ...queueStats,
            maxSize: 1000,
            maxRetries: 3,
            retryBaseDelay: 1000,
            retryMaxDelay: 30000,
            flushInterval: 30000
          }
        }
      }
    } catch (error) {
      app.log.error({ err: error }, '获取CLS配置状态失败')
      reply.code(500)
      return {
        success: false,
        message: '获取CLS配置状态失败'
      }
    }
  })

  app.log.info({ component: 'cls-admin' }, 'CLS管理路由已注册')
}
