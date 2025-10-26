import { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { prisma } from '../db.js'

// 临时类型断言，因为 Windows 权限问题导致 Prisma 客户端无法生成
const db = prisma as any

const createTemplateSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  content: z.string().min(1),
  variables: z.record(z.any()).default({}),
  isActive: z.boolean().default(true),
})

export const registerTemplateRoutes = async (app: FastifyInstance) => {
  app.get('/templates', async () => {
    return db.promptTemplate.findMany({ orderBy: { createdAt: 'desc' } })
  })

  app.get('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const template = await db.promptTemplate.findUnique({ where: { id } })

    if (!template) {
      return reply.status(404).send({ message: '模板不存在' })
    }

    return template
  })

  app.post('/templates', async (request, reply) => {
    const parsed = createTemplateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: '参数错误', issues: parsed.error.issues })
    }

    const created = await db.promptTemplate.create({ data: parsed.data })
    return reply.status(201).send(created)
  })

  app.put('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = createTemplateSchema.partial().safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: '参数错误', issues: parsed.error.issues })
    }

    const updated = await db.promptTemplate.update({ where: { id }, data: parsed.data })
    return updated
  })

  app.delete('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await db.promptTemplate.delete({ where: { id } })
    return reply.status(204).send()
  })
}
