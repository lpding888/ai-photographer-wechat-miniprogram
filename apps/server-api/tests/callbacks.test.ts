import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../src/utils/app.js'
import { computeHmacSha256 } from '../src/utils/hmac.js'

const SECRET = 'test-secret-key'

const buildSignature = (body: unknown) => computeHmacSha256(JSON.stringify(body ?? {}), SECRET)

// Mock global fetch for COS validation
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('SCF callbacks 核心功能测试', () => {
  const validPayload = {
    eventId: 'evt_123',
    taskId: 'task_456',
    status: 'SUCCESS' as const,
    outputKeys: ['app-private/user/uid/task/tid/master.png'],
    cosObject: {
      key: 'app-private/user/uid/task/tid/master.png',
      bucket: 'example-bucket',
      region: 'ap-guangzhou',
      etag: '"test-etag-123"',
      size: 12345,
    },
    metadata: { supplier: 'mock' },
  }

  beforeEach(async () => {
    // 清理Mock
    vi.clearAllMocks()

    // Mock COS validation成功
    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockImplementation((header) => {
          if (header === 'etag') return '"test-etag-123"'
          if (header === 'content-length') return '12345'
          return null
        })
      }
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
  })

  describe('签名校验失败场景', () => {
    it('应该拒绝缺少签名的请求', async () => {
      const app = buildApp()
      await app.ready()

      const response = await app.inject({
        method: 'POST',
        url: '/callbacks/scf',
        payload: validPayload,
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        success: false,
        message: '签名校验失败'
      })

      await app.close()
    })

    it('应该拒绝错误签名的请求', async () => {
      const app = buildApp()
      await app.ready()

      const response = await app.inject({
        method: 'POST',
        url: '/callbacks/scf',
        payload: validPayload,
        headers: { 'x-scf-signature': 'wrong-signature' },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({
        success: false,
        message: '签名校验失败'
      })

      await app.close()
    })
  })

  describe('写库成功场景', () => {
    it('应该接受正确签名的请求并成功处理', async () => {
      const app = buildApp()
      await app.ready()

      const signature = buildSignature(validPayload)

      const response = await app.inject({
        method: 'POST',
        url: '/callbacks/scf',
        payload: validPayload,
        headers: { 'x-scf-signature': signature },
      })

      expect(response.statusCode).toBe(202)
      expect(response.json()).toMatchObject({
        success: true,
        message: '回调接受成功',
        data: { received: true }
      })

      await app.close()
    })
  })

  describe('重复回调场景', () => {
    it('应该正确处理重复回调（幂等性）', async () => {
      const app = buildApp()
      await app.ready()

      const signature = buildSignature(validPayload)

      // 第一次请求
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/callbacks/scf',
        payload: validPayload,
        headers: { 'x-scf-signature': signature },
      })

      expect(firstResponse.statusCode).toBe(202)
      expect(firstResponse.json()).toMatchObject({
        success: true,
        message: '回调接受成功',
        data: { received: true }
      })

      // 第二次请求 - 重复回调
      const secondResponse = await app.inject({
        method: 'POST',
        url: '/callbacks/scf',
        payload: validPayload,
        headers: { 'x-scf-signature': signature },
      })

      expect(secondResponse.statusCode).toBe(200)
      expect(secondResponse.json()).toMatchObject({
        success: true,
        message: '回调已处理（重复事件忽略）',
        data: { duplicate: true }
      })

      await app.close()
    })
  })

  describe('异常输入处理', () => {
    it('应该拒绝缺少eventId的请求（Fastify Schema验证）', async () => {
      const app = buildApp()
      await app.ready()

      const invalidPayload = { ...validPayload }
      delete (invalidPayload as any).eventId

      const signature = buildSignature(invalidPayload)

      const response = await app.inject({
        method: 'POST',
        url: '/callbacks/scf',
        payload: invalidPayload,
        headers: { 'x-scf-signature': signature },
      })

      // Fastify schema验证失败，返回400
      expect(response.statusCode).toBe(400)
      // Fastify的错误消息格式
      expect(response.json()).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        message: expect.stringContaining('eventId')
      })

      await app.close()
    })

    it('应该拒绝缺少taskId的请求（Fastify Schema验证）', async () => {
      const app = buildApp()
      await app.ready()

      const invalidPayload = { ...validPayload }
      delete (invalidPayload as any).taskId

      const signature = buildSignature(invalidPayload)

      const response = await app.inject({
        method: 'POST',
        url: '/callbacks/scf',
        payload: invalidPayload,
        headers: { 'x-scf-signature': signature },
      })

      // Fastify schema验证失败，返回400
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        message: expect.stringContaining('taskId')
      })

      await app.close()
    })

    it('应该拒绝COS对象信息不完整的请求（Fastify Schema验证）', async () => {
      const app = buildApp()
      await app.ready()

      const invalidPayload = {
        ...validPayload,
        cosObject: {
          key: 'test.png',
          // 缺少bucket和region
        }
      }

      const signature = buildSignature(invalidPayload)

      const response = await app.inject({
        method: 'POST',
        url: '/callbacks/scf',
        payload: invalidPayload,
        headers: { 'x-scf-signature': signature },
      })

      // Fastify schema验证失败，返回400
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        message: expect.stringContaining('cosObject')
      })

      await app.close()
    })
  })

  describe('回调记录查询', () => {
    it('应该支持根据eventId查询单条记录', async () => {
      const app = buildApp()
      await app.ready()

      const response = await app.inject({
        method: 'GET',
        url: `/callbacks/scf?eventId=${validPayload.eventId}`,
      })

      // 应该返回404，因为记录不存在
      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({
        success: false,
        message: '回调记录不存在'
      })

      await app.close()
    })

    it('应该支持分页查询回调记录', async () => {
      const app = buildApp()
      await app.ready()

      const response = await app.inject({
        method: 'GET',
        url: '/callbacks/scf?page=1&limit=10&status=SUCCESS',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        success: true,
        message: '查询成功',
        data: {
          records: [],
          total: 0,
        }
      })

      await app.close()
    })
  })
})