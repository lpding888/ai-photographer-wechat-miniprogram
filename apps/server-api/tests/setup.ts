import { vi } from 'vitest'

// 设置必要的测试环境变量
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'mysql://testuser:testpass@localhost:3307/ai_photographer_test'
process.env.SCF_CALLBACK_SECRET = 'test-secret-key' // 修正环境变量名
process.env.SCF_COS_VALIDATE = 'false'
process.env.SCF_COS_BASE_URL = 'https://test-cos.example.com/'

// 用于跟踪重复事件的Mock状态
const mockEventStore: Map<string, Record<string, unknown>> = new Map()

// Mock Prisma Client for testing
vi.mock('@ai-photographer/db', () => ({
  getPrismaClient: () => ({
    callbackEvent: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { eventId?: string } }) => {
        // 支持重复eventId检测
        if (where.eventId) {
          return Promise.resolve(mockEventStore.get(where.eventId) || null)
        }
        return Promise.resolve(null)
      }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const mockRecord = {
          id: 'test-callback-id-' + Date.now(),
          eventId: data.eventId,
          taskId: data.taskId,
          status: data.status,
          cosKey: data.cosKey,
          bucket: data.bucket,
          region: data.region,
          etag: data.etag,
          size: data.size,
          signature: data.signature,
          isValidated: data.isValidated,
          rawPayload: data.rawPayload,
          processedAt: new Date(),
          receivedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        // 存储到Mock store用于重复检测
        mockEventStore.set(data.eventId as string, mockRecord)
        return Promise.resolve(mockRecord)
      }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    }
  })
}))

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // 保留 error 和 warn 用于调试
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}
