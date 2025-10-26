import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { dispatchLegacyAction } from '../src/services/legacy/action-dispatcher.js'

describe('生图API接口测试', () => {
  const testUserId = 'test-user-123'
  const testSceneId = 'scene-123'
  const testClothingImages = [
    'https://example.com/cloth1.jpg',
    'https://example.com/cloth2.jpg'
  ]

  describe('generatePhotography', () => {
    it('应该成功创建AI摄影任务', async () => {
      const payload = {
        action: 'generatePhotography',
        userId: testUserId,
        sceneId: testSceneId,
        clothingImages: testClothingImages,
        title: '测试摄影作品'
      }

      const result = await dispatchLegacyAction(payload)

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('taskId')
      expect(result.data).toHaveProperty('workId')
      expect(result.data).toHaveProperty('status', 'pending')
      expect(result.data).toHaveProperty('creditCost', 10)
      expect(result.message).toContain('AI摄影任务创建成功')
    })

    it('应该验证必需参数', async () => {
      const payload = {
        action: 'generatePhotography',
        userId: testUserId
        // 缺少 sceneId 和 clothingImages
      }

      const result = await dispatchLegacyAction(payload)

      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
      expect(result.message).toContain('场景ID不能为空')
    })

    it('应该验证服装图片格式', async () => {
      const payload = {
        action: 'generatePhotography',
        userId: testUserId,
        sceneId: testSceneId,
        clothingImages: ['invalid-url']
      }

      const result = await dispatchLegacyAction(payload)

      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
      expect(result.message).toContain('URL格式无效')
    })

    it('应该支持姿势裂变模式', async () => {
      const payload = {
        action: 'generatePhotography',
        userId: testUserId,
        sceneId: testSceneId,
        clothingImages: testClothingImages,
        mode: 'pose_variation',
        referenceWorkId: 'existing-work-123'
      }

      const result = await dispatchLegacyAction(payload)

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('taskId')
    })
  })

  describe('generateFitting', () => {
    it('应该成功创建AI试衣任务', async () => {
      const payload = {
        action: 'generateFitting',
        userId: testUserId,
        sceneId: testSceneId,
        clothingImages: testClothingImages,
        modelImages: ['https://example.com/model.jpg'],
        title: '测试试衣作品'
      }

      const result = await dispatchLegacyAction(payload)

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('taskId')
      expect(result.data).toHaveProperty('workId')
      expect(result.data).toHaveProperty('status', 'pending')
      expect(result.data).toHaveProperty('creditCost', 15) // 试衣消耗15积分
      expect(result.message).toContain('AI试衣任务创建成功')
    })

    it('应该验证模特图片格式', async () => {
      const payload = {
        action: 'generateFitting',
        userId: testUserId,
        sceneId: testSceneId,
        clothingImages: testClothingImages,
        modelImages: ['invalid-url']
      }

      const result = await dispatchLegacyAction(payload)

      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
      expect(result.message).toContain('URL格式无效')
    })
  })

  describe('参数验证', () => {
    it('应该拒绝未登录用户', async () => {
      const payload = {
        action: 'generatePhotography',
        sceneId: testSceneId,
        clothingImages: testClothingImages
        // 缺少 userId
      }

      const result = await dispatchLegacyAction(payload)

      expect(result.success).toBe(false)
      expect(result.code).toBe(401)
      expect(result.message).toContain('用户未登录')
    })

    it('应该拒绝无效的生成模式', async () => {
      const payload = {
        action: 'generatePhotography',
        userId: testUserId,
        sceneId: testSceneId,
        clothingImages: testClothingImages,
        mode: 'invalid-mode'
      }

      const result = await dispatchLegacyAction(payload)

      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
      expect(result.message).toContain('生成模式只能是')
    })
  })
})