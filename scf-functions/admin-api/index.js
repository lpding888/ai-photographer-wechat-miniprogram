/**
 * AI模型配置管理API
 * 提供后端管理页面的完整接口，支持：
 * - 模型配置管理
 * - 提示词模板管理
 * - 适配器状态监控
 * - 配置热更新
 *
 * @author 老王
 * @version 1.0.0
 */

const configLoader = require('../common/config/config-loader.js')
const fs = require('fs').promises
const path = require('path')

/**
 * 主处理函数 - 路由分发
 */
exports.main_handler = async (event, context, callback) => {
  console.log('🔧 AI配置管理API启动')
  console.log('📥 接收到的event:', JSON.stringify(event, null, 2))

  try {
    const { action, ...params } = event

    if (!action) {
      throw new Error('缺少必需的action参数')
    }

    console.log(`🎯 执行操作: ${action}`)

    let result
    switch (action) {
      // 模型配置管理
      case 'get_models':
        result = await getModels()
        break
      case 'get_model_config':
        result = await getModelConfig(params.modelType)
        break
      case 'update_model_config':
        result = await updateModelConfig(params.modelType, params.config)
        break
      case 'test_model_config':
        result = await testModelConfig(params.modelType, params.config)
        break

      // 适配器和状态管理
      case 'get_adapters_status':
        result = await getAdaptersStatus()
        break
      case 'health_check':
        result = await performHealthCheck()
        break
      case 'reload_adapter':
        result = await reloadAdapter(params.modelType)
        break
      case 'clear_cache':
        result = await clearCache(params.modelType)
        break

      // 批量操作
      case 'batch_update_configs':
        result = await batchUpdateConfigs(params.configs)
        break
      case 'export_configs':
        result = await exportConfigs()
        break
      case 'import_configs':
        result = await importConfigs(params.configData)

      default:
        throw new Error(`不支持的操作: ${action}`)
    }

    const response = {
      success: true,
      data: result,
      action,
      timestamp: new Date().toISOString()
    }

    callback(null, response)

  } catch (error) {
    console.error(`❌ 操作失败: ${event.action}`, error)

    const errorResponse = {
      success: false,
      error: {
        code: `${event.action}_ERROR`,
        message: error.message,
        type: error.constructor.name
      },
      action: event.action,
      timestamp: new Date().toISOString()
    }

    callback(errorResponse)
  }
}

/**
 * 获取所有模型信息
 */
async function getModels() {
  console.log('📋 获取模型列表...')

  const availableModels = configLoader.getAvailableModels()
  const cacheStats = configLoader.getCacheStats()

  return {
    models: availableModels,
    cache_stats: cacheStats,
    supported_capabilities: {
      'image_analysis': configLoader.getModelsByCapability('image_analysis'),
      'image_generation': configLoader.getModelsByCapability('image_generation')
    },
    total_count: availableModels.length
  }
}

/**
 * 获取指定模型配置
 */
async function getModelConfig(modelType) {
  if (!modelType) {
    throw new Error('缺少必需的modelType参数')
  }

  console.log(`📖 获取模型配置: ${modelType}`)

  try {
    const configPath = path.join(__dirname, '../common/config/models', `${modelType}.json`)
    const configContent = await fs.readFile(configPath, 'utf8')
    const config = JSON.parse(configContent)

    // 隐藏敏感信息
    const safeConfig = { ...config }
    const sensitiveFields = ['secretId', 'secretKey', 'apiKey', 'password', 'token']
    sensitiveFields.forEach(field => {
      if (safeConfig[field]) {
        safeConfig[field] = '***' + safeConfig[field].slice(-4)
      }
    })

    return {
      model_type: modelType,
      config: safeConfig,
      has_sensitive_fields: sensitiveFields.some(field => config[field]),
      config_path: configPath
    }

  } catch (error) {
    throw new Error(`获取配置失败: ${error.message}`)
  }
}

/**
 * 更新模型配置
 */
async function updateModelConfig(modelType, config) {
  if (!modelType || !config) {
    throw new Error('缺少必需的modelType或config参数')
  }

  console.log(`✏️ 更新模型配置: ${modelType}`)

  try {
    const configPath = path.join(__dirname, '../common/config/models', `${modelType}.json`)

    // 验证配置格式
    validateModelConfig(config)

    // 备份原配置
    const backupPath = `${configPath}.backup.${Date.now()}`
    try {
      const originalConfig = await fs.readFile(configPath, 'utf8')
      await fs.writeFile(backupPath, originalConfig)
      console.log(`💾 配置已备份到: ${backupPath}`)
    } catch (backupError) {
      console.warn('⚠️ 配置备份失败:', backupError.message)
    }

    // 写入新配置
    await fs.writeFile(configPath, JSON.stringify(config, null, 2))

    // 清理缓存，强制重新加载
    configLoader.clearCache(`${modelType}:${configPath}`)

    return {
      model_type: modelType,
      config_path: configPath,
      backup_path: backupPath,
      updated_fields: Object.keys(config),
      cache_cleared: true
    }

  } catch (error) {
    throw new Error(`更新配置失败: ${error.message}`)
  }
}

/**
 * 测试模型配置
 */
async function testModelConfig(modelType, config) {
  if (!modelType || !config) {
    throw new Error('缺少必需的modelType或config参数')
  }

  console.log(`🧪 测试模型配置: ${modelType}`)

  try {
    // 创建临时适配器进行测试
    const factory = require('../common/adapters/factory.js')
    const adapter = factory.createAdapter(config)

    // 初始化适配器
    await adapter.initialize()

    // 执行健康检查
    const healthCheck = await adapter.healthCheck()

    return {
      model_type: modelType,
      test_result: 'success',
      health_check: healthCheck,
      adapter_info: adapter.getModelInfo(),
      test_timestamp: new Date().toISOString()
    }

  } catch (error) {
    return {
      model_type: modelType,
      test_result: 'failed',
      error: {
        message: error.message,
        type: error.constructor.name
      },
      test_timestamp: new Date().toISOString()
    }
  }
}

/**
 * 获取适配器状态
 */
async function getAdaptersStatus() {
  console.log('📊 获取适配器状态...')

  try {
    const factory = require('../common/adapters/factory.js')
    const healthCheck = await factory.healthCheckAll()
    const cacheStats = factory.getCacheStats()

    return {
      health_check: healthCheck,
      cache_stats: cacheStats,
      timestamp: new Date().toISOString()
    }

  } catch (error) {
    throw new Error(`获取适配器状态失败: ${error.message}`)
  }
}

/**
 * 执行健康检查
 */
async function performHealthCheck() {
  console.log('🏥 执行系统健康检查...')

  try {
    const configLoaderHealth = await configLoader.healthCheck()
    const factory = require('../common/adapters/factory.js')
    const factoryHealth = await factory.healthCheckAll()

    return {
      status: 'healthy',
      config_loader: configLoaderHealth,
      factory: factoryHealth,
      timestamp: new Date().toISOString()
    }

  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * 重新加载适配器
 */
async function reloadAdapter(modelType) {
  if (!modelType) {
    throw new Error('缺少必需的modelType参数')
  }

  console.log(`🔄 重新加载适配器: ${modelType}`)

  try {
    const configPath = path.join(__dirname, '../common/config/models', `${modelType}.json`)
    await configLoader.reloadAdapter(modelType, configPath)

    return {
      model_type: modelType,
      reloaded: true,
      timestamp: new Date().toISOString()
    }

  } catch (error) {
    throw new Error(`重新加载适配器失败: ${error.message}`)
  }
}

/**
 * 清理缓存
 */
async function clearCache(modelType) {
  console.log(`🧹 清理缓存: ${modelType || '全部'}`)

  try {
    if (modelType) {
      configLoader.clearCache(`${modelType}:`)
    } else {
      configLoader.clearCache()
    }

    return {
      cleared_model: modelType || 'all',
      cache_cleared: true,
      timestamp: new Date().toISOString()
    }

  } catch (error) {
    throw new Error(`清理缓存失败: ${error.message}`)
  }
}

/**
 * 批量更新配置
 */
async function batchUpdateConfigs(configs) {
  if (!Array.isArray(configs) || configs.length === 0) {
    throw new Error('configs必须是非空数组')
  }

  console.log(`📦 批量更新配置: ${configs.length}个`)

  const results = []
  const errors = []

  for (const configUpdate of configs) {
    try {
      const result = await updateModelConfig(configUpdate.modelType, configUpdate.config)
      results.push({
        model_type: configUpdate.modelType,
        success: true,
        result
      })
    } catch (error) {
      errors.push({
        model_type: configUpdate.modelType,
        success: false,
        error: error.message
      })
    }
  }

  return {
    total: configs.length,
    successful: results.length,
    failed: errors.length,
    results,
    errors
  }
}

/**
 * 导出配置
 */
async function exportConfigs() {
  console.log('📤 导出所有配置...')

  try {
    const models = await getModels()
    const configs = {}

    for (const model of models.models) {
      try {
        const configResult = await getModelConfig(model.type)
        configs[model.type] = configResult.config
      } catch (error) {
        console.warn(`⚠️ 导出配置失败: ${model.type}`, error.message)
      }
    }

    const exportData = {
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      models: configs
    }

    return {
      export_data: exportData,
      total_models: Object.keys(configs).length
    }

  } catch (error) {
    throw new Error(`导出配置失败: ${error.message}`)
  }
}

/**
 * 导入配置
 */
async function importConfigs(configData) {
  if (!configData || !configData.models) {
    throw new Error('无效的配置数据')
  }

  console.log('📥 导入配置...')

  const results = []
  const errors = []

  for (const [modelType, config] of Object.entries(configData.models)) {
    try {
      const result = await updateModelConfig(modelType, config)
      results.push({
        model_type: modelType,
        success: true,
        result
      })
    } catch (error) {
      errors.push({
        model_type: modelType,
        success: false,
        error: error.message
      })
    }
  }

  return {
    total: Object.keys(configData.models).length,
    successful: results.length,
    failed: errors.length,
    results,
    errors
  }
}

// ========== 辅助函数 ==========

/**
 * 验证模型配置格式
 */
function validateModelConfig(config) {
  const requiredFields = ['type', 'name']
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`配置缺少必需字段: ${field}`)
    }
  }

  if (typeof config.type !== 'string') {
    throw new Error('type字段必须是字符串')
  }

  if (typeof config.name !== 'string') {
    throw new Error('name字段必须是字符串')
  }
}

