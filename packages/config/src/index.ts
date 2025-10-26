export interface Config {
  server?: {
    host: string
    port: number
  }
  port?: number
  queue: {
    redisUrl: string
    prefix: string
    defaultName: string
    concurrency: number
  }
  services: {
    config: {
      host: string
      port: number
      databaseUrl: string
    }
  }
  aiFitting?: {
    creditsCost: {
      base: number
      sizeMultiplier: Record<string, number>
    }
    maxGenerateCount: number
    supportedSizes: string[]
    defaultStyle: string
    cloudFunctionTimeout: number
  }
  callbacks?: {
    scf?: {
      secret: string
      cos: {
        validate: boolean
        baseUrl: string | null
      }
    }
    eventBus?: {
      enabled: boolean
      type?: string
      [key: string]: any
    }
  }
}

function loadConfig(): Config {
  return {
    server: {
      host: process.env.HOST || process.env.SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '4310', 10)
    },
    port: parseInt(process.env.PORT || '4310', 10),
    queue: {
      redisUrl: process.env.QUEUE_REDIS_URL || 'redis://localhost:6379',
      prefix: process.env.QUEUE_PREFIX || 'ai-photographer',
      defaultName: process.env.QUEUE_DEFAULT_NAME || 'ai-photographer:default',
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10)
    },
    services: {
      config: {
        host: process.env.CONFIG_SERVICE_HOST || '0.0.0.0',
        port: parseInt(process.env.CONFIG_SERVICE_PORT || '4400', 10),
        databaseUrl: process.env.CONFIG_DATABASE_URL || process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/ai_photographer'
      }
    },
    aiFitting: {
      creditsCost: {
        base: parseInt(process.env.AI_FITTING_CREDITS_BASE || '10', 10),
        sizeMultiplier: {
          '1024x1024': parseFloat(process.env.AI_FITTING_CREDITS_MULTIPLIER_1024 || '1.0'),
          '2048x2048': parseFloat(process.env.AI_FITTING_CREDITS_MULTIPLIER_2048 || '2.0')
        }
      },
      maxGenerateCount: parseInt(process.env.AI_FITTING_MAX_GENERATE_COUNT || '8', 10),
      supportedSizes: (process.env.AI_FITTING_SUPPORTED_SIZES || '1024x1024,2048x2048').split(','),
      defaultStyle: process.env.AI_FITTING_DEFAULT_STYLE || 'realistic',
      cloudFunctionTimeout: parseInt(process.env.AI_FITTING_CLOUD_FUNCTION_TIMEOUT || '300000', 10) // 5分钟
    },
    callbacks: {
      scf: {
        secret: process.env.SCF_CALLBACK_SECRET || process.env.SCF_SECRET || 'replace-me',
        cos: {
          validate: process.env.SCF_COS_VALIDATE === 'true',
          baseUrl: process.env.SCF_COS_BASE_URL || null
        }
      },
      eventBus: {
        enabled: process.env.EVENT_BUS_ENABLED === 'true' || process.env.CALLBACK_EVENT_BUS_ENABLED === 'true',
        type: process.env.EVENT_BUS_TYPE || undefined
      }
    }
  }
}

export const getConfig = loadConfig