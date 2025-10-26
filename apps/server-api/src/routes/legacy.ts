import { FastifyInstance } from 'fastify'

import { dispatchLegacyAction } from '../services/legacy/action-dispatcher.js'

interface LegacyRequestBody {
  action?: string
  [key: string]: unknown
}

export const registerLegacyRoutes = async (app: FastifyInstance) => {
  app.post<{ Body: LegacyRequestBody }>('/legacy/actions', async (request, reply) => {
    const response = await dispatchLegacyAction(request.body ?? {})
    if (!response.success && response.code >= 500) {
      app.log.warn({ action: request.body?.action, response }, 'Legacy action still pending migration')
    }

    void reply.code(response.code ?? (response.success ? 200 : 500))
    return response
  })
}
