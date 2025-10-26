import { randomUUID } from 'node:crypto'

import Fastify, { type FastifyServerOptions } from 'fastify'

import errorHandler from '../plugins/error-handler.js'
import loggerHook from '../plugins/logger.js'
import traceIdHook from '../plugins/trace-id.js'
import circuitBreakerPlugin from '../plugins/circuit-breaker.js'
import authPlugin from '../plugins/auth/index.js'
import { getAuthConfig } from '../config/auth.js'
import { registerCallbackRoutes } from '../routes/callbacks.js'
import { registerClsAdminRoutes } from '../routes/cls-admin.js'
import { registerHealthRoutes } from '../routes/health.js'
import { registerLegacyRoutes } from '../routes/legacy.js'
import { registerAuthRoutes } from '../routes/auth.js'
import { registerV1Routes } from '../routes/v1/index.js'

import { buildLoggerOptions } from './logger.js'

const genReqId: NonNullable<FastifyServerOptions['genReqId']> = (request) => {
  const incoming = request.headers['x-trace-id'] ?? request.headers['x-request-id']
  if (Array.isArray(incoming)) {
    return incoming[0] ?? randomUUID()
  }

  if (typeof incoming === 'string' && incoming.trim().length > 0) {
    return incoming
  }

  return randomUUID()
}

export const buildApp = () => {
  const app = Fastify({
    logger: buildLoggerOptions(),
    genReqId,
  })

  void app.register(traceIdHook)
  void app.register(loggerHook)
  void app.register(errorHandler)
  void app.register(circuitBreakerPlugin, {
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 60000,
      successThreshold: 3
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100
    },
    queueMonitor: {
      checkInterval: 30000,
      highBacklogThreshold: 100,
      consecutiveAlertsThreshold: 3
    }
  })

  // 注册认证插件
  void app.register(authPlugin, getAuthConfig())

  // 注册路由
  void app.register(registerHealthRoutes)
  void app.register(registerLegacyRoutes)
  void app.register(registerCallbackRoutes)
  void app.register(registerClsAdminRoutes)
  void app.register(registerAuthRoutes)
  void app.register(registerV1Routes, { prefix: '/api/v1' })

  return app
}

export type AppInstance = ReturnType<typeof buildApp>
