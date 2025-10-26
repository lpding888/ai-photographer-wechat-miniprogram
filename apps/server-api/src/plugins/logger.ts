import fp from 'fastify-plugin'

export default fp(
  async (fastify) => {
    fastify.addHook('onRequest', async (request) => {
      request.log.info({ method: request.method, url: request.url }, 'request.received')
    })

    fastify.addHook('onResponse', async (request, reply) => {
      const duration = request.__startTime ? Date.now() - request.__startTime : undefined
      request.log.info(
        {
          statusCode: reply.statusCode,
          duration,
        },
        'request.completed',
      )
    })
  },
  { name: 'request-logger' },
)
