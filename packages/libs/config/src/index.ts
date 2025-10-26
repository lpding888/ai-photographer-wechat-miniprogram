import { config as loadEnv } from 'dotenv'

type NodeEnv = 'development' | 'test' | 'production'

export interface AppConfig {
  nodeEnv: NodeEnv
  port: number
  server: {
    host: string
    port: number
  }
  databaseUrl: string
  services: {
    config: {
      host: string
      port: number
      databaseUrl: string
    }
  }
  queue: {
    redisUrl: string
    prefix: string
    defaultQueueName: string
    concurrency: number
  }
  callbacks: {
    scf: {
      secret: string
      cos: {
        validate: boolean
        baseUrl: string | null
      }
    }
    eventBus: {
      enabled: boolean
      type?: string
      redis?: string
      queue?: string
      webhookUrl?: string
      headers?: Record<string, string>
      [key: string]: unknown
    }
  }
  logging: {
    level: string
    pretty: boolean
    cls: {
      enabled: boolean
      endpoint: string | null
      topicId: string | null
      secretId: string | null
      secretKey: string | null
    }
  }
}

let cachedConfig: AppConfig | null = null

const DEFAULT_SERVER_PORT = 39001
const DEFAULT_CONFIG_SERVICE_PORT = 4400
const DEFAULT_HOST = '0.0.0.0'
const DEFAULT_QUEUE_REDIS_URL = 'redis://127.0.0.1:6379'
const DEFAULT_QUEUE_PREFIX = 'ai-photographer'
const DEFAULT_QUEUE_CONCURRENCY = 5
const DEFAULT_SCF_CALLBACK_SECRET = 'replace-me'
const DEFAULT_LOG_LEVEL = 'info'

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const resolveDatabaseUrl = (nodeEnv: NodeEnv): string => {
  const url = process.env.DATABASE_URL?.trim()
  if (url) {
    return url
  }

  if (nodeEnv === 'test') {
    return 'mysql://root:password@127.0.0.1:3306/test'
  }

  throw new Error('DATABASE_URL 环境变量没配好，赶紧补上。')
}

const resolveConfigDatabaseUrl = (nodeEnv: NodeEnv, fallback: string): string => {
  const url = process.env.CONFIG_DATABASE_URL?.trim()
  if (url) {
    return url
  }

  if (nodeEnv === 'test') {
    return fallback
  }

  throw new Error('CONFIG_DATABASE_URL 环境变量没有配置，别指望服务能连数据库。')
}

const resolveQueueConcurrency = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (Number.isNaN(parsed)) {
    return DEFAULT_QUEUE_CONCURRENCY
  }

  if (parsed <= 0) {
    throw new Error('QUEUE_CONCURRENCY 得是正整数，别给老王整 0 或负数。')
  }

  return parsed
}

const resolveBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false
  }

  return fallback
}

export const getConfig = (): AppConfig => {
  if (cachedConfig) {
    return cachedConfig
  }

  loadEnv()

  const nodeEnv = (process.env.NODE_ENV ?? 'development') as NodeEnv
  const databaseUrl = resolveDatabaseUrl(nodeEnv)
  const configDatabaseUrl = resolveConfigDatabaseUrl(nodeEnv, databaseUrl)
  const serverHost = process.env.SERVER_HOST ?? DEFAULT_HOST
  const serverPort = parsePort(process.env.PORT, DEFAULT_SERVER_PORT)
  const queuePrefix = process.env.QUEUE_PREFIX?.trim() || DEFAULT_QUEUE_PREFIX
  const queueName = process.env.QUEUE_DEFAULT_NAME?.trim() || `${queuePrefix}:default`
  const scfSecret = process.env.SCF_CALLBACK_SECRET?.trim() || DEFAULT_SCF_CALLBACK_SECRET
  const logLevel = process.env.LOG_LEVEL?.trim() || DEFAULT_LOG_LEVEL
  const logPretty = resolveBoolean(process.env.LOG_PRETTY, nodeEnv !== 'production')
  const clsEnabled = resolveBoolean(process.env.CLS_LOG_ENABLED, false)
  const cosValidate = resolveBoolean(process.env.SCF_COS_VALIDATE, false)
  const cosBaseUrl = process.env.SCF_COS_BASE_URL?.trim() || null
  const eventBusEnabled = resolveBoolean(process.env.CALLBACK_EVENT_BUS_ENABLED, false)
  let eventBusHeaders: Record<string, string> | undefined
  if (process.env.CALLBACK_EVENT_BUS_WEBHOOK_HEADERS) {
    try {
      eventBusHeaders = JSON.parse(process.env.CALLBACK_EVENT_BUS_WEBHOOK_HEADERS)
    } catch (error) {
      throw new Error('CALLBACK_EVENT_BUS_WEBHOOK_HEADERS 不是合法的 JSON，赶紧修正。')
    }
  }

  cachedConfig = {
    nodeEnv,
    port: serverPort,
    server: {
      host: serverHost,
      port: serverPort,
    },
    databaseUrl,
    services: {
      config: {
        host: process.env.CONFIG_SERVICE_HOST ?? DEFAULT_HOST,
        port: parsePort(process.env.CONFIG_SERVICE_PORT, DEFAULT_CONFIG_SERVICE_PORT),
        databaseUrl: configDatabaseUrl,
      },
    },
    queue: {
      redisUrl: process.env.QUEUE_REDIS_URL?.trim() || DEFAULT_QUEUE_REDIS_URL,
      prefix: queuePrefix,
      defaultQueueName: queueName,
      concurrency: resolveQueueConcurrency(process.env.QUEUE_CONCURRENCY),
    },
    callbacks: {
      scf: {
        secret: scfSecret,
        cos: {
          validate: cosValidate,
          baseUrl: cosBaseUrl,
        },
      },
      eventBus: {
        enabled: eventBusEnabled,
        type: process.env.CALLBACK_EVENT_BUS_TYPE?.trim() || undefined,
        redis: process.env.CALLBACK_EVENT_BUS_REDIS?.trim() || undefined,
        queue: process.env.CALLBACK_EVENT_BUS_QUEUE?.trim() || undefined,
        webhookUrl: process.env.CALLBACK_EVENT_BUS_WEBHOOK_URL?.trim() || undefined,
        headers: eventBusHeaders,
      },
    },
    logging: {
      level: logLevel,
      pretty: logPretty,
      cls: {
        enabled: clsEnabled,
        endpoint: process.env.CLS_LOG_ENDPOINT?.trim() ?? null,
        topicId: process.env.CLS_LOG_TOPIC_ID?.trim() ?? null,
        secretId: process.env.CLS_LOG_SECRET_ID?.trim() ?? null,
        secretKey: process.env.CLS_LOG_SECRET_KEY?.trim() ?? null,
      },
    },
  }

  return cachedConfig!
}
