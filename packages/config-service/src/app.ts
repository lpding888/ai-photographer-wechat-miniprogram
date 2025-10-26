import Fastify from 'fastify'

import { registerModelRoutes } from './routes/models.js'
import { registerTemplateRoutes } from './routes/templates.js'

export const buildConfigService = () => {
  const app = Fastify({ logger: true })

  app.get('/configs/ping', () => ({ status: 'ok' }))
  void app.register(registerModelRoutes)
  void app.register(registerTemplateRoutes)

  return app
}
