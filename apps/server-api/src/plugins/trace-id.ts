import { randomUUID } from 'node:crypto'

import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyRequest {
    traceId: string
    __startTime?: number
  }
}

const TRACE_HEADER = 'x-trace-id'

export default fp(
  async (fastify) => {
    fastify.decorateRequest('traceId', '')

    fastify.addHook('onRequest', async (request, reply) => {
      const incomingHeader = request.headers[TRACE_HEADER] ?? request.headers['x-request-id']
      const traceId = Array.isArray(incomingHeader)
        ? incomingHeader[0] ?? randomUUID()
        : typeof incomingHeader === 'string'
          ? incomingHeader
          : randomUUID()

      request.traceId = traceId
      request.id = traceId
      request.__startTime = Date.now()

      request.log = request.log.child({ traceId })
      reply.header(TRACE_HEADER, traceId)
    })
  },
  { name: 'trace-id-hook' },
)
