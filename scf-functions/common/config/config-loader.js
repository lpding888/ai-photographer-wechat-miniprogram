/**
 * 配置加载器
 * 统一管理所有AI模型配置的加载、缓存和热更新
 *
 * @author 老王
 * @version 1.0.0
 */

const factory = require('../adapters/factory.js')
const path = require('path')

class ConfigLoader {
  constructor() {
    this.configs = new Map()      // 配置缓存
    this.adapters = new Map()    // 适配器缓存
    this.lastLoadTime = new Map() // 最后加载时间
    this.cacheTimeout = 5 * 60 * 1000 // 5分钟缓存
    this.configBasePath = path.join(__dirname, 'models')
  }

  /**
   * 加载模型配置
   * @param {string} modelType - 模型类型
   * @param {string} configPath - 配置文件路径（可选，默认使用内置路径）
   * @returns {Object} 配置对象
   */
  async loadModelConfig(modelType, configPath) {
    const finalConfigPath = configPath || path.join(this.configBasePath, `${modelType}.json`)
    const cacheKey = `${modelType}:${finalConfigPath}`

    // 检查缓存
    if (this.configs.has(cacheKey)) {
      const lastLoad = this.lastLoadTime.get(cacheKey)
      if (Date.now() - lastLoad < this.cacheTimeout) {
        console.log(`🔄 使用缓存配置: ${modelType}`)
        return this.configs.get(cacheKey)
      }
    }

    try {
      console.log(`📂 加载模型配置: ${modelType} from ${finalConfigPath}`)
      const config = await factory.loadConfig(finalConfigPath)

      this.configs.set(cacheKey, config)
      this.lastLoadTime.set(cacheKey, Date.now())

      console.log(`✅ 配置加载成功: ${modelType}`)
      return config

    } catch (error) {
      console.error(`❌ 配置加载失败: ${modelType} from ${finalConfigPath}`, error)
      throw error
    }
  }

  /**
   * 获取或创建适配器
   * @param {string} modelType - 模型类型
   * @param {string} configPath - 配置文件路径（可选）
   * @param {Object} overrideConfig - 覆盖配置（可选）
   * @returns {BaseModelAdapter} 适配器实例
   */
  async getAdapter(modelType, configPath, overrideConfig = {}) {
    const finalConfigPath = configPath || path.join(this.configBasePath, `${modelType}.json`)
    const cacheKey = `${modelType}:${finalConfigPath}`

    // 检查适配器缓存
    if (this.adapters.has(cacheKey)) {
      const adapter = this.adapters.get(cacheKey)

      // 检查配置是否更新
      try {
        const currentConfig = await this.loadModelConfig(modelType, finalConfigPath)
        const mergedConfig = { ...currentConfig, ...overrideConfig }

        if (JSON.stringify(mergedConfig) !== JSON.stringify(adapter.config)) {
          console.log(`🔄 检测到配置更新，重新创建适配器: ${modelType}`)
          const newAdapter = await factory.loadAdapter(finalConfigPath)
          newAdapter.config = { ...newAdapter.config, ...overrideConfig }
          this.adapters.set(cacheKey, newAdapter)
          return newAdapter
        }

        return adapter
      } catch (error) {
        console.warn('⚠️ 配置更新检查失败，使用缓存适配器:', error.message)
        return adapter
      }
    }

    // 创建新适配器
    try {
      console.log(`🆕 创建新适配器: ${modelType}`)
      const adapter = await factory.getAdapter(finalConfigPath, overrideConfig)
      this.adapters.set(cacheKey, adapter)
      return adapter
    } catch (error) {
      console.error(`❌ 适配器创建失败: ${modelType}`, error)
      throw error
    }
  }

  /**
   * 根据功能需求获取适配器
   * @param {string} capability - 功能需求 ('image_analysis' | 'image_generation')
   * @param {string} preferredModel - 首选模型（可选）
   * @returns {BaseModelAdapter} 适配器实例
   */
  async getAdapterByCapability(capability, preferredModel = null) {
    const modelMapping = {
      'image_analysis': ['hunyuan'],
      'image_generation': ['doubao'],
      'multi_modal': ['hunyuan']
    }

    const candidateModels = preferredModel
      ? [preferredModel]
      : (modelMapping[capability] || [])

    if (candidateModels.length === 0) {
      throw new Error(`没有支持 ${capability} 功能的模型`)
    }

    // 尝试候选模型
    for (const modelType of candidateModels) {
      try {
        const adapter = await this.getAdapter(modelType)

        // 检查适配器是否支持所需功能
        if (adapter.getModelInfo().capabilities.includes(capability)) {
          console.log(`✅ 选择适配器: ${modelType} for ${capability}`)
          return adapter
        }
      } catch (error) {
        console.warn(`⚠️ 适配器 ${modelType} 不可用:`, error.message)
        continue
      }
    }

    throw new Error(`所有支持 ${capability} 的模型都不可用`)
  }

  /**
   * 批量获取适配器
   * @param {Array} modelConfigs - 模型配置数组 [{type, configPath, overrideConfig}]
   * @returns {Map} 适配器映射
   */
  async getBatchAdapters(modelConfigs) {
    const adapters = new Map()

    for (const config of modelConfigs) {
      try {
        const adapter = await this.getAdapter(
          config.type,
          config.configPath,
          config.overrideConfig
        )
        adapters.set(config.type, adapter)
      } catch (error) {
        console.error(`❌ 批量加载适配器失败: ${config.type}`, error)
      }
    }

    return adapters
  }

  /**
   * 设置默认适配器
   * @param {string} modelType - 模型类型
   * @param {string} configPath - 配置文件路径（可选）
   */
  async setDefaultAdapter(modelType, configPath) {
    try {
      const adapter = await this.getAdapter(modelType, configPath)
      factory.setDefaultAdapter(adapter)
      console.log(`🎯 设置默认适配器: ${modelType}`)
    } catch (error) {
      console.error(`❌ 设置默认适配器失败: ${modelType}`, error)
      throw error
    }
  }

  /**
   * 获取默认适配器
   * @returns {BaseModelAdapter|null} 默认适配器
   */
  getDefaultAdapter() {
    return factory.getDefaultAdapter()
  }

  /**
   * 重新加载适配器
   * @param {string} modelType - 模型类型
   * @param {string} configPath - 配置文件路径（可选）
   */
  async reloadAdapter(modelType, configPath) {
    const finalConfigPath = configPath || path.join(this.configBasePath, `${modelType}.json`)
    const cacheKey = `${modelType}:${finalConfigPath}`

    // 清理缓存
    this.adapters.delete(cacheKey)
    this.configs.delete(cacheKey)
    this.lastLoadTime.delete(cacheKey)

    // 清理工厂缓存
    factory.clearCache()

    // 重新加载
    return await this.getAdapter(modelType, finalConfigPath)
  }

  /**
   * 清理缓存
   * @param {string} key - 缓存键（可选）
   */
  clearCache(key) {
    if (key) {
      this.configs.delete(key)
      this.adapters.delete(key)
      this.lastLoadTime.delete(key)
      console.log(`🧹 清理缓存: ${key}`)
    } else {
      this.configs.clear()
      this.adapters.clear()
      this.lastLoadTime.clear()
      factory.clearCache()
      console.log('🧹 清理所有缓存')
    }
  }

  /**
   * 获取缓存状态
   * @returns {Object} 缓存统计信息
   */
  getCacheStats() {
    return {
      configsCount: this.configs.size,
      adaptersCount: this.adapters.size,
      configs: Array.from(this.configs.keys()),
      adapters: Array.from(this.adapters.keys()),
      factoryStats: factory.getCacheStats(),
      configBasePath: this.configBasePath,
      cacheTimeout: this.cacheTimeout
    }
  }

  /**
   * 执行健康检查
   * @returns {Object} 健康检查结果
   */
  async healthCheck() {
    const results = {}

    // 检查所有缓存的适配器
    for (const [key, adapter] of this.adapters) {
      try {
        results[key] = await adapter.healthCheck()
      } catch (error) {
        results[key] = {
          status: 'error',
          adapter: adapter.name,
          message: error.message,
          timestamp: new Date().toISOString()
        }
      }
    }

    // 检查工厂状态
    const factoryHealth = await factory.healthCheckAll()

    return {
      loader: {
        total_adapters: this.adapters.size,
        total_configs: this.configs.size,
        cache_status: 'active'
      },
      adapters: results,
      factory: factoryHealth,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 获取可用的模型列表
   * @returns {Array} 模型信息列表
   */
  getAvailableModels() {
    const models = []

    for (const [key, adapter] of this.adapters) {
      const modelInfo = adapter.getModelInfo()
      models.push({
        key,
        ...modelInfo,
        configPath: key.split(':')[1] || 'unknown'
      })
    }

    return models
  }

  /**
   * 根据功能筛选模型
   * @param {string} capability - 功能需求
   * @returns {Array} 支持该功能的模型列表
   */
  getModelsByCapability(capability) {
    const allModels = this.getAvailableModels()
    return allModels.filter(model =>
      model.capabilities && model.capabilities.includes(capability)
    )
  }
}

// 创建全局配置加载器实例
const configLoader = new ConfigLoader()

module.exports = configLoader