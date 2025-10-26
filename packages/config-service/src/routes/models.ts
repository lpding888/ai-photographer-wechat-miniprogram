import { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { prisma } from '../db.js'

// 临时类型断言，因为 Windows 权限问题导致 Prisma 客户端无法生成
const db = prisma as any

const createModelSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  category: z.enum(['MULTIMODAL', 'TEXT', 'IMAGE', 'VIDEO']),
  description: z.string().optional(),
  configJson: z.record(z.any()).default({}),
  isActive: z.boolean().default(true),
})

export const registerModelRoutes = async (app: FastifyInstance) => {
  app.get('/models', async () => {
    return db.modelRegistry.findMany({ orderBy: { createdAt: 'desc' } })
  })

  app.get('/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const model = await db.modelRegistry.findUnique({ where: { id } })

    if (!model) {
      return reply.status(404).send({ message: '模型不存在' })
    }

    return model
  })

  app.post('/models', async (request, reply) => {
    const parsed = createModelSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: '参数错误', issues: parsed.error.issues })
    }

    const created = await db.modelRegistry.create({ data: parsed.data })
    return reply.status(201).send(created)
  })

  app.put('/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = createModelSchema.partial().safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: '参数错误', issues: parsed.error.issues })
    }

    const updated = await db.modelRegistry.update({
      where: { id },
      data: parsed.data,
    })

    return updated
  })

  app.delete('/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await db.modelRegistry.delete({ where: { id } })
    return reply.status(204).send()
  })
}
