// 应用配置
module.exports = {
  // 应用基本信息
  app: {
    name: 'AI摄影师',
    version: '1.0.0',
    description: 'AI驱动的智能摄影和试衣小程序'
  },
  
  // 环境配置
  env: {
    development: {
      logLevel: 'debug',
      apiTimeout: 30000,
      enableMockData: true
    },
    production: {
      logLevel: 'warn',
      apiTimeout: 15000,
      enableMockData: false
    }
  },
  
  // 业务配置
  business: {
    // 积分配置
    credits: {
      signInReward: 5,          // 签到奖励
      inviteReward: 10,         // 邀请奖励
      photographyCost: 1,       // 摄影消耗
      fittingCost: 1,           // 试衣消耗
      maxDailyGeneration: 50    // 每日最大生成次数
    },
    
    // 文件上传配置
    upload: {
      maxFileSize: 10 * 1024 * 1024,  // 10MB
      allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
      maxFilesPerUser: 100
    },
    
    // 任务配置
    task: {
      maxProcessingTime: 10 * 60 * 1000,  // 10分钟
      retryTimes: 3,
      cleanupInterval: 24 * 60 * 60 * 1000  // 24小时
    },
    
    // 缓存配置
    cache: {
      userInfoTTL: 30 * 60,      // 30分钟
      sceneListTTL: 60 * 60,     // 1小时
      workListTTL: 5 * 60        // 5分钟
    }
  },
  
  // 安全配置
  security: {
    // 速率限制
    rateLimit: {
      windowMs: 60 * 1000,       // 1分钟
      maxRequests: 100,          // 最大请求数
      skipWhitelist: true
    },
    
    // 密码配置
    password: {
      minLength: 6,
      maxLength: 20,
      requireNumbers: true,
      requireSymbols: false
    },
    
    // JWT配置
    jwt: {
      expiresIn: '7d',
      algorithm: 'HS256'
    }
  },
  
  // 外部API配置
  external: {
    // AI服务配置
    ai: {
      timeout: 60000,
      retryTimes: 2,
      defaultModel: 'stable-diffusion-xl'
    },
    
    // 微信支付配置
    payment: {
      timeout: 30000,
      currency: 'CNY',
      notifyUrl: '/api/payment/notify'
    },
    
    // 消息推送配置
    notification: {
      timeout: 10000,
      retryTimes: 3
    }
  },
  
  // 监控配置
  monitoring: {
    enableMetrics: true,
    enableTracing: true,
    sampleRate: 0.1
  }
}