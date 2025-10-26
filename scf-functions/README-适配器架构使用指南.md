# 🔧 AI模型适配器架构使用指南

## 📋 概述

这个抽屉式适配器架构让你能够轻松切换不同的AI大模型，只需要修改配置文件和API密钥，而不需要改动函数代码。

## 🏗️ 架构设计

```
SCF函数 → 配置加载器 → 适配器工厂 → 具体适配器 → AI服务API
   ↓           ↓           ↓           ↓          ↓
HTTP请求 → 读取配置 → 动态加载 → 统一调用 → 混元/豆包/其他
   ↓           ↓           ↓           ↓          ↓
返回结果 → 配置缓存 → 适配器缓存 → 标准化响应 → 标准化处理
```

## 📁 目录结构

```
scf-functions/
├── common/
│   ├── adapters/
│   │   ├── base-adapter.js      # 基础适配器接口
│   │   ├── hunyuan-adapter.js   # 混元适配器
│   │   ├── doubao-adapter.js    # 豆包适配器
│   │   └── factory.js           # 适配器工厂
│   └── config/
│       ├── config-loader.js     # 配置加载器
│       └── models/
│           ├── hunyuan.json     # 混元配置
│           └── doubao.json      # 豆包配置
├── prompt-generator/
│   ├── index.js                 # 提示词生成函数 (v2.0)
│   └── package.json
└── image-generator/
    ├── index.js                 # 图像生成函数 (v2.0)
    └── package.json
```

## 🚀 快速开始

### 1. 环境变量配置

在SCF控制台配置以下环境变量：

```bash
# 混元大模型配置
TENCENTCLOUD_SECRET_ID=your-secret-id
TENCENTCLOUD_SECRET_KEY=your-secret-key
TCB_ENV_ID=your-env-id

# 豆包大模型配置
DOUBAO_API_KEY=your-doubao-api-key
```

### 2. 修改配置文件

#### 混元配置 (`common/config/models/hunyuan.json`)
```json
{
  "name": "混元大模型",
  "type": "hunyuan",
  "useCloudBase": true,
  "envId": "your-env-id",
  "region": "ap-beijing",
  "defaultModel": "hunyuan-vision"
}
```

#### 豆包配置 (`common/config/models/doubao.json`)
```json
{
  "name": "豆包Seedream 4.0",
  "type": "doubao",
  "apiKey": "your-doubao-api-key",
  "apiEndpoint": "https://ark.cn-beijing.volces.com/api/v3",
  "defaultModel": "doubao-Seedream-4-0-250828"
}
```

### 3. 调用函数

#### prompt-generator (提示词生成)
```javascript
const result = await cloud.callFunction({
  name: 'prompt-generator',
  data: {
    imageUrls: ['https://example.com/image.jpg'],
    sceneConfig: {
      name: '时尚摄影',
      category: 'FASHION'
    },
    modelType: 'hunyuan'  // 可选，默认'hunyuan'
  }
})
```

#### image-generator (图像生成)
```javascript
const result = await cloud.callFunction({
  name: 'image-generator',
  data: {
    prompt: '一个穿着白色连衣裙的女孩站在花海中',
    modelType: 'doubao',  // 可选，默认'doubao'
    options: {
      size: '2K',
      quality: 'hd',
      maxImages: 4
    }
  }
})
```

## 🔧 高级配置

### 自定义适配器

1. **创建适配器类**：
```javascript
const BaseModelAdapter = require('./base-adapter.js')

class CustomAdapter extends BaseModelAdapter {
  async initialize() {
    // 初始化逻辑
  }

  async analyzeImages(imageUrls, options = {}) {
    // 图像分析实现
  }

  async generateImage(prompt, options = {}) {
    // 图像生成实现
  }
}

module.exports = CustomAdapter
```

2. **注册适配器**：
```javascript
const factory = require('./factory.js')
factory.registerAdapter('custom', CustomAdapter)
```

3. **创建配置文件**：
```json
{
  "name": "自定义模型",
  "type": "custom",
  "apiKey": "your-api-key",
  "defaultModel": "custom-model-v1"
}
```

### 配置热更新

配置文件修改后会自动生效，无需重启函数：

```javascript
// 强制重新加载配置
await configLoader.reloadAdapter('hunyuan')

// 清理所有缓存
configLoader.clearCache()
```

## 📊 监控和调试

### 健康检查

```javascript
// prompt-generator健康检查
const health = await cloud.callFunction({
  name: 'prompt-generator',
  data: {},
  method: 'health_check'
})

// image-generator健康检查
const health = await cloud.callFunction({
  name: 'image-generator',
  data: {},
  method: 'health_check'
})
```

### 缓存状态

```javascript
// 获取配置加载器缓存状态
const stats = configLoader.getCacheStats()
console.log('缓存状态:', stats)

// 获取工厂缓存状态
const factoryStats = factory.getCacheStats()
console.log('工厂状态:', factoryStats)
```

## 🎯 切换AI模型

### 从混元切换到其他模型

1. **修改配置文件**：
```json
// common/config/models/hunyuan.json
{
  "useCloudBase": false,  // 改为官方SDK
  "secretId": "new-secret-id",
  "secretKey": "new-secret-key",
  "region": "ap-shanghai"  // 切换区域
}
```

2. **环境变量更新**：
```bash
TENCENTCLOUD_SECRET_ID=new-secret-id
TENCENTCLOUD_SECRET_KEY=new-secret-key
```

### 从豆包切换到其他模型

1. **修改配置文件**：
```json
// common/config/models/doubao.json
{
  "apiKey": "new-api-key",
  "apiEndpoint": "https://ark.cn-shanghai.volces.com/api/v3",
  "defaultModel": "doubao-vision-4-0-latest"
}
```

2. **环境变量更新**：
```bash
DOUBAO_API_KEY=new-api-key
```

## ⚡ 性能优化

### 缓存策略

- **配置缓存**：5分钟自动过期
- **适配器缓存**：支持热更新
- **连接复用**：适配器内部保持连接

### 并发控制

```javascript
// 批量处理请求（image-generator支持）
const batchResult = await cloud.callFunction({
  name: 'image-generator',
  data: {
    action: 'batch_generate',
    requests: [
      { prompt: '提示词1' },
      { prompt: '提示词2' },
      { prompt: '提示词3' }
    ]
  }
})
```

## 🛠️ 故障处理

### 常见错误

1. **配置文件格式错误**：
```json
{
  "success": false,
  "error": {
    "code": "CONFIG_LOAD_ERROR",
    "message": "配置加载失败: Unexpected token }"
  }
}
```

2. **API密钥无效**：
```json
{
  "success": false,
  "error": {
    "code": "ADAPTER_INITIALIZATION_ERROR",
    "message": "API连接失败: 401 Unauthorized"
  }
}
```

3. **模型不支持的功能**：
```json
{
  "success": false,
  "error": {
    "code": "UNSUPPORTED_OPERATION",
    "message": "混元适配器不支持图像生成功能"
  }
}
```

### 调试方法

1. **查看详细日志**：
```javascript
console.log('适配器信息:', adapter.getModelInfo())
console.log('配置状态:', configLoader.getCacheStats())
```

2. **执行健康检查**：
```javascript
const health = await adapter.healthCheck()
console.log('健康状态:', health)
```

## 📋 最佳实践

### 1. 配置管理
- 使用环境变量存储敏感信息
- 定期轮换API密钥
- 监控API使用量和成本

### 2. 错误处理
- 实现备用适配器机制
- 设置合理的超时时间
- 记录详细的错误日志

### 3. 性能优化
- 合理设置缓存超时时间
- 避免频繁创建适配器实例
- 使用批量处理减少API调用

### 4. 安全考虑
- 不要在代码中硬编码密钥
- 使用最小权限原则
- 定期审查配置文件

## 🆕 版本更新

### v2.0.0 特性
- ✅ 完全的适配器架构
- ✅ 配置热更新支持
- ✅ 多模型并行支持
- ✅ 统一的错误处理
- ✅ 详细的监控和日志

### 升级指南
从v1.x升级到v2.0：
1. 更新函数代码
2. 创建配置文件
3. 配置环境变量
4. 测试适配器功能

---

## 📞 技术支持

如有问题，请检查：
1. 配置文件格式是否正确
2. 环境变量是否设置
3. API密钥是否有效
4. 网络连接是否正常

**老王出品，必属精品！** 🚀