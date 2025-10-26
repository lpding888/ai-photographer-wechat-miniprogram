import fp from 'fastify-plugin'

interface ErrorResponse {
  statusCode: number
  error: string
  message: string
}

export default fp(
  async (fastify) => {
    fastify.setErrorHandler((error, request, reply) => {
      const withStatus = error as { statusCode?: number }
      const statusCode = withStatus.statusCode ?? 500

      const response: ErrorResponse = {
        statusCode,
        error: statusCode >= 500 ? 'Internal Server Error' : 'Bad Request',
        message:
          statusCode >= 500
            ? '服务器开小差了，老王已经在调日志。'
            : error.message || '请求参数有问题。',
      }

      fastify.log.error({ err: error, url: request.url }, 'Request failed')

      void reply.status(statusCode).send(response)
    })
  },
  { name: 'error-handler' },
)
