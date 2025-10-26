import fp from 'fastify-plugin'

interface CircuitBreakerState {
  isOpen: boolean
  failureCount: number
  lastFailureTime: number
  successCount: number
}

interface RateLimiterState {
  requests: number
  resetTime: number
}

interface QueueMonitorState {
  lastCheckTime: number
  consecutiveHighBacklog: number
}

interface CircuitBreakerOptions {
  failureThreshold?: number
  resetTimeout?: number
  successThreshold?: number
}

interface RateLimitOptions {
  windowMs?: number
  maxRequests?: number
}

interface QueueMonitorOptions {
  checkInterval?: number
  highBacklogThreshold?: number
  consecutiveAlertsThreshold?: number
}

interface CircuitBreakerPluginOptions {
  circuitBreaker?: CircuitBreakerOptions
  rateLimit?: RateLimitOptions
  queueMonitor?: QueueMonitorOptions
}

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1分钟
  successThreshold: 3
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60000, // 1分钟
  maxRequests: 100 // 每分钟最多100个请求
}

const DEFAULT_QUEUE_MONITOR: QueueMonitorOptions = {
  checkInterval: 30000, // 30秒检查一次
  highBacklogThreshold: 100, // 100个任务算是高积压
  consecutiveAlertsThreshold: 3 // 连续3次高积压才报警
}

export default fp(
  async (fastify, options: CircuitBreakerPluginOptions = {}) => {
    const circuitBreakerOptions = { ...DEFAULT_CIRCUIT_BREAKER, ...options.circuitBreaker }
    const rateLimitOptions = { ...DEFAULT_RATE_LIMIT, ...options.rateLimit }
    const queueMonitorOptions = { ...DEFAULT_QUEUE_MONITOR, ...options.queueMonitor }

    // 熔断器状态（按路径存储）
    const circuitBreakerStates = new Map<string, CircuitBreakerState>()

    // 限流器状态（按IP存储）
    const rateLimiterStates = new Map<string, RateLimiterState>()

    // 队列监控状态
    let queueMonitorState: QueueMonitorState = {
      lastCheckTime: Date.now(),
      consecutiveHighBacklog: 0
    }

    // 获取熔断器状态
    const getCircuitBreakerState = (path: string): CircuitBreakerState => {
      if (!circuitBreakerStates.has(path)) {
        circuitBreakerStates.set(path, {
          isOpen: false,
          failureCount: 0,
          lastFailureTime: 0,
          successCount: 0
        })
      }
      return circuitBreakerStates.get(path)!
    }

    // 检查熔断器是否开启
    const isCircuitBreakerOpen = (state: CircuitBreakerState): boolean => {
      if (!state.isOpen) {
        return false
      }

      // 检查是否可以尝试半开状态
      const now = Date.now()
      if (now - state.lastFailureTime > circuitBreakerOptions.resetTimeout!) {
        state.isOpen = false
        state.successCount = 0
        fastify.log.info({ state: 'half-open' }, '熔断器进入半开状态')
        return false
      }

      return true
    }

    // 记录成功
    const recordSuccess = (state: CircuitBreakerState) => {
      state.successCount++
      if (state.successCount >= circuitBreakerOptions.successThreshold!) {
        state.isOpen = false
        state.failureCount = 0
        state.successCount = 0
        fastify.log.info({ state: 'closed' }, '熔断器已关闭')
      }
    }

    // 记录失败
    const recordFailure = (state: CircuitBreakerState) => {
      state.failureCount++
      state.lastFailureTime = Date.now()

      if (state.failureCount >= circuitBreakerOptions.failureThreshold!) {
        state.isOpen = true
        state.successCount = 0
        fastify.log.error(
          {
            failureCount: state.failureCount,
            threshold: circuitBreakerOptions.failureThreshold
          },
          '熔断器已开启'
        )
      }
    }

    // 检查限流
    const checkRateLimit = (ip: string): boolean => {
      const now = Date.now()
      let state = rateLimiterStates.get(ip)

      if (!state || now > state.resetTime) {
        state = {
          requests: 0,
          resetTime: now + rateLimitOptions.windowMs!
        }
        rateLimiterStates.set(ip, state)
      }

      if (state.requests >= rateLimitOptions.maxRequests!) {
        return false
      }

      state.requests++
      return true
    }

    // 监控队列积压
    const monitorQueueBacklog = async () => {
      try {
        const now = Date.now()
        if (now - queueMonitorState.lastCheckTime < queueMonitorOptions.checkInterval!) {
          return
        }

        const { getQueueService } = await import('../services/queue-service.js')
        const queueService = getQueueService()
        const waitingJobsCount = await queueService.getWaitingJobsCount()

        if (waitingJobsCount > queueMonitorOptions.highBacklogThreshold!) {
          queueMonitorState.consecutiveHighBacklog++

          fastify.log.warn(
            {
              waitingJobsCount,
              threshold: queueMonitorOptions.highBacklogThreshold,
              consecutiveHighBacklog: queueMonitorState.consecutiveHighBacklog
            },
            '队列积压过高'
          )

          if (queueMonitorState.consecutiveHighBacklog >= queueMonitorOptions.consecutiveAlertsThreshold!) {
            fastify.log.error(
              {
                waitingJobsCount,
                threshold: queueMonitorOptions.highBacklogThreshold,
                consecutiveAlerts: queueMonitorState.consecutiveHighBacklog
              },
              '队列积压持续过高，触发报警！'
            )

            // 这里可以接入报警系统，比如发送钉钉/企微消息
            // 目前先记录严重错误日志
            queueMonitorState.consecutiveHighBacklog = 0 // 重置计数器，避免重复报警
          }
        } else {
          queueMonitorState.consecutiveHighBacklog = 0
        }

        queueMonitorState.lastCheckTime = now
      } catch (error) {
        fastify.log.error({ err: error }, '队列监控检查失败')
      }
    }

    // 请求超时处理
    const createTimeoutHandler = (timeoutMs: number = 30000) => {
      return async (request: any, reply: any) => {
        return new Promise((_, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`请求超时 (${timeoutMs}ms)`))
          }, timeoutMs)

          reply.raw.on('finish', () => {
            clearTimeout(timeout)
          })
        })
      }
    }

    // 添加钩子
    fastify.addHook('preHandler', async (request, reply) => {
      const path = request.routeOptions.url || request.url

      const forwardedHeader = request.headers['x-forwarded-for']
      let clientIp = request.ip
      if (Array.isArray(forwardedHeader)) {
        clientIp = forwardedHeader[0] || clientIp
      } else if (typeof forwardedHeader === 'string' && forwardedHeader.trim().length > 0) {
        clientIp = forwardedHeader.split(',')[0].trim() // 取第一个IP，处理逗号分隔的情况
      }

      // 检查熔断器
      const circuitState = getCircuitBreakerState(path)
      if (isCircuitBreakerOpen(circuitState)) {
        reply.code(503)
        throw new Error('服务暂时不可用，熔断器已开启')
      }

      // 检查限流
      if (!checkRateLimit(clientIp)) {
        reply.code(429)
        throw new Error('请求过于频繁，请稍后再试')
      }

      // 监控队列积压
      await monitorQueueBacklog()
    })

    fastify.addHook('onResponse', (request, reply, done) => {
      const path = request.routeOptions.url || request.url
      const statusCode = reply.statusCode
      const circuitState = getCircuitBreakerState(path)

      if (statusCode >= 500) {
        recordFailure(circuitState)
      } else if (statusCode < 400) {
        recordSuccess(circuitState)
      }

      done()
    })

    // 添加请求超时中间件
    fastify.addHook('preHandler', async (request, reply) => {
      // 设置请求超时为30秒
      const timeoutMs = 30000
      const timeout = setTimeout(() => {
        if (!reply.raw.headersSent) {
          reply.code(408).send({
            error: 'Request Timeout',
            message: `请求超时 (${timeoutMs}ms)`
          })
        }
      }, timeoutMs)

      reply.raw.on('finish', () => {
        clearTimeout(timeout)
      })
    })

    // 添加装饰器，让其他地方可以访问这些功能
    fastify.decorate('circuitBreaker', {
      getState: (path: string) => getCircuitBreakerState(path),
      isOpen: (path: string) => isCircuitBreakerOpen(getCircuitBreakerState(path)),
      recordSuccess: (path: string) => recordSuccess(getCircuitBreakerState(path)),
      recordFailure: (path: string) => recordFailure(getCircuitBreakerState(path))
    })

    fastify.decorate('rateLimiter', {
      checkRateLimit: (ip: string) => checkRateLimit(ip),
      getCurrentState: (ip: string) => rateLimiterStates.get(ip)
    })

    fastify.decorate('queueMonitor', {
      checkBacklog: () => monitorQueueBacklog(),
      getState: () => queueMonitorState
    })

    fastify.log.info(
      {
        circuitBreaker: circuitBreakerOptions,
        rateLimit: rateLimitOptions,
        queueMonitor: queueMonitorOptions
      },
      '熔断限流插件已启用'
    )
  },
  { name: 'circuit-breaker' }
)
