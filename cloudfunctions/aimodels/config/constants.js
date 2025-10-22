/**
 * 常量配置文件
 * 集中管理所有配置常量
 */

// 任务状态常量
const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  AI_PROCESSING: 'ai_processing',
  WATERMARKING: 'watermarking',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

// 任务类型常量
const TASK_TYPES = {
  PHOTOGRAPHY: 'photography',
  FITTING: 'fitting',
  TEXT_TO_IMAGE: 'text-to-image'
}

// AI模型提供商常量
const AI_PROVIDERS = {
  GEMINI: 'gemini',
  GOOGLE: 'google',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic'
}

// 图片格式常量
const IMAGE_FORMATS = {
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  WEBP: 'image/webp',
  GIF: 'image/gif'
}

// 文件大小限制（字节）
const FILE_SIZE_LIMITS = {
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_TOTAL_SIZE: 50 * 1024 * 1024, // 50MB
  MIN_IMAGE_SIZE: 1024, // 1KB
  WARNING_SIZE: 5 * 1024 * 1024 // 5MB警告阈值
}

// 图片尺寸限制
const IMAGE_DIMENSIONS = {
  MIN_WIDTH: 256,
  MAX_WIDTH: 4096,
  MIN_HEIGHT: 256,
  MAX_HEIGHT: 4096,
  DEFAULT_WIDTH: 1024,
  DEFAULT_HEIGHT: 1024
}

// 处理限制
const PROCESSING_LIMITS = {
  MAX_IMAGES_PER_TASK: 10,
  MAX_CONCURRENT_UPLOADS: 3,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 2000,
  TIMEOUT_MS: 60000
}

// 水印配置
const WATERMARK_CONFIG = {
  DEFAULT_TEXT: 'AI生成',
  POSITIONS: {
    TOP_LEFT: 'top-left',
    TOP_RIGHT: 'top-right',
    TOP_CENTER: 'top-center',
    BOTTOM_LEFT: 'bottom-left',
    BOTTOM_RIGHT: 'bottom-right',
    BOTTOM_CENTER: 'bottom-center',
    CENTER: 'center'
  },
  FONT_SIZES: {
    SMALL: 32,
    MEDIUM: 48,
    LARGE: 64,
    XLARGE: 96
  },
  DEFAULT_PADDING: 20,
  DEFAULT_QUALITY: 95,
  MIN_FONT_SIZE: 16,
  MAX_FONT_SIZE: 128
}

// 云存储配置
const STORAGE_CONFIG = {
  PATHS: {
    AI_GENERATED: 'ai-generated',
    PHOTOGRAPHY: 'photography',
    FITTING: 'fitting',
    TEMP: 'temp',
    WATERMARKED: 'watermarked'
  },
  FILE_PREFIXES: {
    PHOTO: 'photo_',
    FITTING: 'fitting_',
    AI_GEN: 'ai_',
    WATERMARK: 'wm_'
  },
  EXPIRY_DAYS: {
    TEMP_FILES: 1,
    GENERATED_IMAGES: 365,
    BACKUP_FILES: 30
  }
}

// 错误类型常量
const ERROR_TYPES = {
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  INVALID_INPUT: 'INVALID_INPUT',
  PERMISSION: 'PERMISSION',
  STORAGE: 'STORAGE',
  AI_MODEL: 'AI_MODEL',
  WATERMARK: 'WATERMARK',
  UNKNOWN: 'UNKNOWN'
}

// API配置
const API_CONFIG = {
  TIMEOUTS: {
    DEFAULT: 30000,     // 30秒
    AI_GENERATION: 60000, // 60秒
    FILE_UPLOAD: 30000,   // 30秒
    FILE_DOWNLOAD: 20000  // 20秒
  },
  RETRY_CONFIG: {
    MAX_ATTEMPTS: 3,
    DELAY_MS: 1000,
    BACKOFF_MULTIPLIER: 2
  },
  RATE_LIMITS: {
    MAX_REQUESTS_PER_MINUTE: 60,
    MAX_CONCURRENT_REQUESTS: 5
  }
}

// 质量配置
const QUALITY_CONFIG = {
  IMAGE_QUALITY: {
    HIGH: 95,
    MEDIUM: 85,
    LOW: 75,
    COMPRESSED: 60
  },
  COMPRESSION_THRESHOLD: 2 * 1024 * 1024, // 2MB
  AUTO_COMPRESS_RATIO: 0.8
}

// 日志级别
const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
}

// 监控配置
const MONITORING_CONFIG = {
  PERFORMANCE_THRESHOLD_MS: 5000,
  MEMORY_WARNING_THRESHOLD: 0.8,
  ERROR_RATE_THRESHOLD: 0.1,
  SUCCESS_RATE_THRESHOLD: 0.95
}

// 缓存配置
const CACHE_CONFIG = {
  TTL_SECONDS: {
    MODEL_CONFIG: 300,    // 5分钟
    USER_INFO: 600,       // 10分钟
    API_RESPONSE: 60,     // 1分钟
    TEMP_DATA: 1800       // 30分钟
  },
  MAX_CACHE_SIZE: 100
}

// 验证规则
const VALIDATION_RULES = {
  PROMPT: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 2000,
    FORBIDDEN_PATTERNS: [
      /^\s*$/,  // 只有空格
      /<script/i,
      /javascript:/i
    ]
  },
  TASK_ID: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100,
    PATTERN: /^[a-zA-Z0-9_-]+$/
  },
  FILE_ID: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 200
  }
}

// 数据库集合名称
const DB_COLLECTIONS = {
  USERS: 'users',
  WORKS: 'works',
  TASKS: 'task_queue',
  MODELS: 'aimodels',
  SCENES: 'scenes',
  TEMPLATES: 'templates',
  LOGS: 'workflow_logs',
  ORDERS: 'orders'
}

// 环境配置
const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production'
}

// 导出所有常量
module.exports = {
  TASK_STATUS,
  TASK_TYPES,
  AI_PROVIDERS,
  IMAGE_FORMATS,
  FILE_SIZE_LIMITS,
  IMAGE_DIMENSIONS,
  PROCESSING_LIMITS,
  WATERMARK_CONFIG,
  STORAGE_CONFIG,
  ERROR_TYPES,
  API_CONFIG,
  QUALITY_CONFIG,
  LOG_LEVELS,
  MONITORING_CONFIG,
  CACHE_CONFIG,
  VALIDATION_RULES,
  DB_COLLECTIONS,
  ENVIRONMENT
}