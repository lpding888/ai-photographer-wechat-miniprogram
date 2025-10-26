/**
 * AI模型适配器工厂
 * 负责动态创建、加载和管理所有AI模型适配器
 *
 * 核心功能：
 * 1. 动态加载适配器
 * 2. 配置管理和验证
 * 3. 适配器缓存和热更新
 * 4. 统一的适配器接口
 *
 * @author 老王
 * @version 1.0.0
 */

const HunyuanAdapter = require('./hunyuan-adapter.js')
const DoubaoAdapter = require('./doubao-adapter.js')

class AdapterFactory {
  constructor() {
    this.adapters = new Map()           // 适配器类注册表
    this.instances = new Map()          // 适配器实例缓存
    this.configs = new Map()            // 配置缓存
    this.lastLoadTime = new Map()       // 最后加载时间
    this.defaultAdapter = null          // 默认适配器
    this.cacheTimeout = 5 * 60 * 1000   // 5分钟缓存超时

    // 注册内置适配器
    this.registerBuiltinAdapters()
  }

  /**
   * 注册内置适配器
   */
  registerBuiltinAdapters() {
    this.registerAdapter('hunyuan', HunyuanAdapter)
    this.registerAdapter('doubao', DoubaoAdapter)
    console.log('✅ 内置适配器注册完成: hunyuan, doubao')
  }

  /**
   * 注册适配器类
   * @param {string} type - 适配器类型（小写）
   * @param {Class} adapterClass - 适配器类
   */
  registerAdapter(type, adapterClass) {
    if (!type || typeof type !== 'string') {
      throw new Error('适配器类型必须是非空字符串')
    }

    if (!adapterClass || typeof adapterClass !== 'function') {
      throw new Error('适配器类必须是一个构造函数')
    }

    const normalizedType = type.toLowerCase().trim()
    this.adapters.set(normalizedType, adapterClass)
    console.log(`📝 适配器注册成功: ${normalizedType}`)
  }

  /**
   * 获取已注册的适配器类型列表
   */
  getRegisteredTypes() {
    return Array.from(this.adapters.keys())
  }

  /**
   * 创建适配器实例
   * @param {Object} config - 配置信息
   * @returns {BaseModelAdapter} 适配器实例
   */
  createAdapter(config) {
    try {
      // 验证配置
      if (!config || typeof config !== 'object') {
        throw new Error('配置必须是对象')
      }

      if (!config.type || typeof config.type !== 'string') {
        throw new Error('配置必须包含type字段')
      }

      const normalizedType = config.type.toLowerCase().trim()
      const AdapterClass = this.adapters.get(normalizedType)

      if (!AdapterClass) {
        const availableTypes = this.getRegisteredTypes().join(', ')
        throw new Error(`未知的适配器类型: ${normalizedType}，可用类型: ${availableTypes}`)
      }

      // 创建适配器实例
      const adapter = new AdapterClass(config)
      console.log(`🏭 适配器创建成功: ${adapter.name} (${normalizedType})`)

      return adapter

    } catch (error) {
      console.error(`❌ 适配器创建失败:`, error)
      throw error
    }
  }

  /**
   * 加载配置并创建适配器
   * @param {string} configPath - 配置文件路径
   * @returns {BaseModelAdapter} 初始化完成的适配器
   */
  async loadAdapter(configPath) {
    try {
      console.log(`📂 开始加载适配器配置: ${configPath}`)

      // 加载配置
      const config = await this.loadConfig(configPath)

      // 创建适配器
      const adapter = this.createAdapter(config)

      // 初始化适配器
      await adapter.initialize()

      // 缓存适配器
      const cacheKey = this.generateCacheKey(configPath, config)
      this.instances.set(cacheKey, adapter)
      this.configs.set(cacheKey, config)
      this.lastLoadTime.set(cacheKey, Date.now())

      console.log(`✅ 适配器加载完成: ${adapter.name}`)
      return adapter

    } catch (error) {
      console.error(`❌ 适配器加载失败: ${configPath}`, error)
      throw error
    }
  }

  /**
   * 获取或创建适配器（带缓存）
   * @param {string} configPath - 配置文件路径
   * @param {Object} overrideConfig - 覆盖配置（可选）
   * @returns {BaseModelAdapter} 适配器实例
   */
  async getAdapter(configPath, overrideConfig = {}) {
    try {
      // 加载基础配置
      const baseConfig = await this.loadConfig(configPath)

      // 合并覆盖配置
      const mergedConfig = { ...baseConfig, ...overrideConfig }

      const cacheKey = this.generateCacheKey(configPath, mergedConfig)

      // 检查缓存
      if (this.instances.has(cacheKey)) {
        const cachedAdapter = this.instances.get(cacheKey)
        const lastLoad = this.lastLoadTime.get(cacheKey) || 0

        // 检查缓存是否过期
        if (Date.now() - lastLoad < this.cacheTimeout) {
          console.log(`🔄 使用缓存适配器: ${cachedAdapter.name}`)

          // 检查配置是否更新
          if (await this.isConfigUpdated(configPath, this.configs.get(cacheKey))) {
            console.log(`🔄 检测到配置更新，重新加载适配器: ${cachedAdapter.name}`)
            return await this.reloadAdapter(configPath, overrideConfig)
          }

          return cachedAdapter
        } else {
          console.log(`⏰ 缓存已过期，重新加载适配器: ${cachedAdapter.name}`)
          this.instances.delete(cacheKey)
        }
      }

      // 创建新适配器
      console.log(`🆕 创建新适配器: ${mergedConfig.type}`)
      const adapter = this.createAdapter(mergedConfig)
      await adapter.initialize()

      // 缓存适配器
      this.instances.set(cacheKey, adapter)
      this.configs.set(cacheKey, mergedConfig)
      this.lastLoadTime.set(cacheKey, Date.now())

      return adapter

    } catch (error) {
      console.error(`❌ 获取适配器失败: ${configPath}`, error)
      throw error
    }
  }

  /**
   * 重新加载适配器
   * @param {string} configPath - 配置文件路径
   * @param {Object} overrideConfig - 覆盖配置
   * @returns {BaseModelAdapter} 重新加载的适配器
   */
  async reloadAdapter(configPath, overrideConfig = {}) {
    const baseConfig = await this.loadConfig(configPath)
    const mergedConfig = { ...baseConfig, ...overrideConfig }
    const cacheKey = this.generateCacheKey(configPath, mergedConfig)

    // 清理旧缓存
    this.instances.delete(cacheKey)
    this.configs.delete(cacheKey)
    this.lastLoadTime.delete(cacheKey)

    // 重新加载
    return await this.getAdapter(configPath, overrideConfig)
  }

  /**
   * 加载配置文件
   * @param {string} configPath - 配置文件路径
   * @returns {Object} 配置对象
   */
  async loadConfig(configPath) {
    try {
      let config

      // 判断是文件路径还是直接配置
      if (typeof configPath === 'object' && !configPath.includes) {
        // 直接是配置对象
        config = { ...configPath }
      } else {
        // 文件路径
        const fs = require('fs').promises
        const path = require('path')

        const configContent = await fs.readFile(configPath, 'utf8')
        config = JSON.parse(configContent)
      }

      // 处理环境变量替换
      config = this.processEnvironmentVariables(config)

      // 验证必需字段
      this.validateConfig(config)

      return config

    } catch (error) {
      console.error(`❌ 配置加载失败: ${configPath}`, error)
      throw new Error(`配置加载失败: ${error.message}`)
    }
  }

  /**
   * 处理环境变量替换
   * @param {Object} config - 原始配置
   * @returns {Object} 处理后的配置
   */
  processEnvironmentVariables(config) {
    const processed = { ...config }

    // 如果配置中有环境变量映射
    if (config.envVars && typeof config.envVars === 'object') {
      for (const [configKey, envVarName] of Object.entries(config.envVars)) {
        const envValue = process.env[envVarName]
        if (envValue) {
          processed[configKey] = envValue
          console.log(`🔧 环境变量替换: ${configKey} = ${envVarName}`)
        }
      }
    }

    // 直接检查环境变量（常见配置项）
    const commonEnvVars = [
      'secretId', 'secretKey', 'apiKey', 'password', 'token',
      'TENCENTCLOUD_SECRET_ID', 'TENCENTCLOUD_SECRET_KEY',
      'DOUBAO_API_KEY', 'HUNYUAN_SECRET_ID', 'HUNYUAN_SECRET_KEY'
    ]

    commonEnvVars.forEach(envVar => {
      if (processed[envVar] && typeof processed[envVar] === 'string') {
        const envValue = process.env[processed[envVar]]
        if (envValue) {
          processed[envVar] = envValue
          console.log(`🔧 环境变量替换: ${envVar}`)
        }
      }
    })

    return processed
  }

  /**
   * 验证配置完整性
   * @param {Object} config - 配置对象
   */
  validateConfig(config) {
    if (!config.type || typeof config.type !== 'string') {
      throw new Error('配置必须包含type字段')
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new Error('配置必须包含name字段')
    }

    // 根据类型验证特定配置
    switch (config.type.toLowerCase()) {
      case 'hunyuan':
        this.validateHunyuanConfig(config)
        break
      case 'doubao':
        this.validateDoubaoConfig(config)
        break
      default:
        console.warn(`⚠️ 未知适配器类型，跳过特定验证: ${config.type}`)
    }
  }

  /**
   * 验证混元配置
   */
  validateHunyuanConfig(config) {
    if (config.useCloudBase && !config.envId) {
      throw new Error('混元云开发方式需要envId配置')
    }

    if (!config.useCloudBase && (!config.secretId || !config.secretKey)) {
      throw new Error('混元官方SDK方式需要secretId和secretKey配置')
    }
  }

  /**
   * 验证豆包配置
   */
  validateDoubaoConfig(config) {
    if (!config.apiKey) {
      throw new Error('豆包适配器需要apiKey配置')
    }

    if (config.apiEndpoint && typeof config.apiEndpoint !== 'string') {
      throw new Error('apiEndpoint必须是字符串')
    }
  }

  /**
   * 检查配置是否更新
   * @param {string} configPath - 配置路径
   * @param {Object} cachedConfig - 缓存的配置
   * @returns {boolean} 是否更新
   */
  async isConfigUpdated(configPath, cachedConfig) {
    try {
      const currentConfig = await this.loadConfig(configPath)
      return JSON.stringify(currentConfig) !== JSON.stringify(cachedConfig)
    } catch (error) {
      console.warn('⚠️ 配置更新检查失败:', error.message)
      return false
    }
  }

  /**
   * 生成缓存键
   * @param {string} configPath - 配置路径
   * @param {Object} config - 配置对象
   * @returns {string} 缓存键
   */
  generateCacheKey(configPath, config) {
    const pathHash = this.simpleHash(configPath)
    const configHash = this.simpleHash(JSON.stringify(config))
    return `${config.type}_${pathHash}_${configHash}`
  }

  /**
   * 简单哈希函数
   * @param {string} str - 输入字符串
   * @returns {string} 哈希值
   */
  simpleHash(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 设置默认适配器
   * @param {BaseModelAdapter} adapter - 默认适配器
   */
  setDefaultAdapter(adapter) {
    this.defaultAdapter = adapter
    console.log(`🎯 设置默认适配器: ${adapter.name}`)
  }

  /**
   * 获取默认适配器
   * @returns {BaseModelAdapter|null} 默认适配器
   */
  getDefaultAdapter() {
    return this.defaultAdapter
  }

  /**
   * 清理缓存
   * @param {string} key - 缓存键（可选）
   */
  clearCache(key) {
    if (key) {
      this.instances.delete(key)
      this.configs.delete(key)
      this.lastLoadTime.delete(key)
      console.log(`🧹 清理缓存: ${key}`)
    } else {
      this.instances.clear()
      this.configs.clear()
      this.lastLoadTime.clear()
      console.log('🧹 清理所有缓存')
    }
  }

  /**
   * 获取缓存状态
   * @returns {Object} 缓存统计
   */
  getCacheStats() {
    return {
      instancesCount: this.instances.size,
      configsCount: this.configs.size,
      registeredTypes: this.getRegisteredTypes(),
      cachedInstances: Array.from(this.instances.entries()).map(([key, adapter]) => ({
        key,
        name: adapter.name,
        type: adapter.type,
        initialized: adapter.isInitialized,
        lastLoad: this.lastLoadTime.get(key)
      })),
      hasDefault: !!this.defaultAdapter,
      defaultAdapter: this.defaultAdapter?.name || null
    }
  }

  /**
   * 执行所有适配器的健康检查
   * @returns {Object} 健康检查结果
   */
  async healthCheckAll() {
    const results = {}

    for (const [key, adapter] of this.instances) {
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

    return {
      total: this.instances.size,
      results,
      timestamp: new Date().toISOString()
    }
  }
}

// 创建全局工厂实例
const factory = new AdapterFactory()

module.exports = factory