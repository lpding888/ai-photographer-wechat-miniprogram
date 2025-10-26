import { getPrismaClient } from '@ai-photographer/db'
import type { CallbackEvent, Prisma } from '@prisma/client'

const prisma = getPrismaClient()

export interface CallbackRecord {
  eventId: string
  taskId: string
  status: string
  cosKey: string
  receivedAt: string
  rawPayload: unknown
  signature?: string
  bucket?: string
  region?: string
  etag?: string
  size?: number
  isValidated?: boolean
}

export const callbacksRepository = {
  /**
   * 检查eventId是否已存在（幂等性检查）
   */
  async has(eventId: string): Promise<boolean> {
    try {
      const existing = await prisma.callbackEvent.findUnique({
        where: { eventId },
        select: { id: true }
      })
      return Boolean(existing)
    } catch (error) {
      console.error('[callback-repository] 检查eventId失败:', error)
      // 数据库错误时返回false，允许继续处理
      return false
    }
  },

  /**
   * 保存回调记录到数据库
   */
  async save(record: CallbackRecord): Promise<CallbackEvent> {
    try {
      const callbackEvent = await prisma.callbackEvent.create({
        data: {
          eventId: record.eventId,
          taskId: record.taskId,
          status: record.status,
          cosKey: record.cosKey,
          bucket: record.bucket,
          region: record.region,
          etag: record.etag,
          size: record.size,
          signature: record.signature,
          isValidated: record.isValidated ?? false,
          rawPayload: record.rawPayload as Prisma.InputJsonValue,
          processedAt: new Date(),
        }
      })

      console.log('[callback-repository] 回调记录保存成功:', callbackEvent.id)
      return callbackEvent
    } catch (error) {
      console.error('[callback-repository] 保存回调记录失败:', error)
      throw new Error(`回调持久化失败: ${error instanceof Error ? error.message : 'unknown'}`)
    }
  },

  /**
   * 查询回调记录
   */
  async findById(id: string): Promise<CallbackEvent | null> {
    try {
      return await prisma.callbackEvent.findUnique({
        where: { id }
      })
    } catch (error) {
      console.error('[callback-repository] 查询回调记录失败:', error)
      return null
    }
  },

  /**
   * 根据eventId查询回调记录
   */
  async findByEventId(eventId: string): Promise<CallbackEvent | null> {
    try {
      return await prisma.callbackEvent.findUnique({
        where: { eventId }
      })
    } catch (error) {
      console.error('[callback-repository] 根据eventId查询失败:', error)
      return null
    }
  },

  /**
   * 根据taskId查询相关回调记录
   */
  async findByTaskId(taskId: string, limit = 10): Promise<CallbackEvent[]> {
    try {
      return await prisma.callbackEvent.findMany({
        where: { taskId },
        orderBy: { receivedAt: 'desc' },
        take: limit
      })
    } catch (error) {
      console.error('[callback-repository] 根据taskId查询失败:', error)
      return []
    }
  },

  /**
   * 分页查询回调记录列表
   */
  async list(options: {
    page?: number
    limit?: number
    status?: string
    taskId?: string
  } = {}): Promise<{ records: CallbackEvent[], total: number }> {
    const { page = 1, limit = 20, status, taskId } = options
    const skip = (page - 1) * limit

    try {
      const where: Prisma.CallbackEventWhereInput = {}
      if (status) where.status = status
      if (taskId) where.taskId = taskId

      const [records, total] = await Promise.all([
        prisma.callbackEvent.findMany({
          where,
          orderBy: { receivedAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.callbackEvent.count({ where })
      ])

      return { records, total }
    } catch (error) {
      console.error('[callback-repository] 查询回调列表失败:', error)
      return { records: [], total: 0 }
    }
  },

  /**
   * 更新回调记录状态
   */
  async updateStatus(id: string, status: string, metadata?: Record<string, any>): Promise<CallbackEvent | null> {
    try {
      return await prisma.callbackEvent.update({
        where: { id },
        data: {
          status,
          ...(metadata && { rawPayload: metadata as Prisma.InputJsonValue }),
          updatedAt: new Date()
        }
      })
    } catch (error) {
      console.error('[callback-repository] 更新回调状态失败:', error)
      return null
    }
  },

  /**
   * 清理过期的回调记录
   */
  async cleanup(olderThanDays = 30): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

      const result = await prisma.callbackEvent.deleteMany({
        where: {
          receivedAt: {
            lt: cutoffDate
          }
        }
      })

      console.log(`[callback-repository] 清理了 ${result.count} 条过期记录`)
      return result.count
    } catch (error) {
      console.error('[callback-repository] 清理过期记录失败:', error)
      return 0
    }
  }
}
