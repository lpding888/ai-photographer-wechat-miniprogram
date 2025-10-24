# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI Photography WeChat Mini Program (AI摄影师小程序) that provides AI-powered clothing photography and virtual fitting services. The project uses WeChat Cloud Development (微信云开发) with a serverless architecture based on cloud functions.

**核心特色功能**:
- 🎭 **姿势裂变技术**: 从已生成作品创建不同姿势的新作品
- 🤖 **多AI模型支持**: 集成Gemini、OpenAI等多种AI服务
- 🏭 **NAS集成架构**: 支持外部NAS系统进行AI处理
- 📱 **企业级架构**: 完整的用户管理、积分系统、任务队列

## Development Commands

### Development Commands

#### 环境配置
```powershell
# 配置云环境变量
setup-env-vars.ps1

# 部署云函数
deploy-cloudfunctions.ps1

# 检查部署状态
deployment-checklist.ps1
```

#### 调试和测试
```powershell
# 认证调试
debug-auth-issue.ps1

# AI模型调试
debug-auth-aimodels.ps1

# 数据完整性检查
check-photography-templates.ps1
```

#### 数据库初始化
```javascript
// 初始化缺失的数据库集合
wx.cloud.callFunction({
  name: 'database-init',
  data: { action: 'init_missing_collections' }
})

// 添加Gemini模型
wx.cloud.callFunction({
  name: 'database-init',
  data: { action: 'add_gemini_models' }
})
```

## Architecture

### Frontend Structure
- **miniprogram/**: WeChat Mini Program frontend code
  - `app.js`: Main application entry with cloud initialization and user management
    - 🔄 **全局轮询管理**: 防止多页面重复轮询同一任务
    - 🔥 **云函数预热机制**: 每4分钟ping一次保持热启动
    - 📝 **智能日志控制**: 生产环境自动关闭调试日志
  - `app.json`: App configuration with pages, tabBar, and cloud settings
    - 23个页面，5个主要tabBar
    - 自定义tabBar配置
  - `pages/`: Individual page components (index, photography, fitting, works, profile, etc.)
  - `utils/api.js`: 1200+行的完整API服务类
    - 🔄 **指数退避重试**: 智能处理网络波动
    - 📦 **请求缓存机制**: 减少重复API调用
    - 🛡️ **防抖节流**: 优化用户交互体验
    - ⚡ **并发控制**: 批量请求优化
  - `utils/image-handler.js`: 企业级图片处理工具
    - 🖼️ **CDN优化**: 自动压缩、格式转换、尺寸调整
    - ❌ **错误处理**: 图片加载失败自动替换默认图片
    - 📊 **性能监控**: 图片加载统计和优化
  - `components/`: Reusable components (loading, state)

### Backend Structure (20 Cloud Functions)

#### 核心业务云函数 (Core Functions)
- **`api`**: 统一API入口，处理作品管理和用户数据查询
  - 🎛️ **NAS专用接口**: 支持外部NAS系统集成
  - 👑 **管理员功能**: 用户管理、统计数据、数据导出
  - 📊 **性能优化**: 分页查询、精简数据传输

- **`photography`**: AI服装摄影生成 (核心功能)
  - 🎭 **姿势裂变模式**: 从原作品生成不同姿势的新作品
  - 🔄 **异步处理**: Fire-and-forget模式，worker独立容器运行
  - 📈 **状态机管理**: 精确的任务进度跟踪

- **`fitting`**: AI虚拟试衣生成
  - 🎭 **姿势裂变支持**: 同样支持从作品生成不同姿势
  - 🧥 **智能场景匹配**: 自动匹配最佳场景配置

- **`user`**: 用户注册、登录和积分管理
  - 💰 **积分系统**: 消费记录、每日签到、分享奖励
  - 🔄 **智能刷新**: 防重复刷新的用户信息更新机制

- **`payment`**: 充值套餐和订单管理
  - 💳 **支付集成**: 微信支付、订单状态管理
  - 📝 **积分记录**: 详细的消费和充值记录

#### 支持服务云函数 (Supporting Functions)
- **`aimodels`**: AI模型配置和选择
  - 🤖 **多模型支持**: Gemini、OpenAI等多种AI服务
  - 🎯 **智能选择**: 基于成本和能力的模型推荐

- **`scene`**: 摄影场景数据管理
- **`prompt`**: AI提示词模板管理
- **`storage`**: 云存储文件管理和去重
- **`auth`**: 认证和权限控制

#### Worker云函数 (Background Processing)
- **`photography-worker`**: 摄影任务后台处理 (60-120秒运行时间)
- **`fitting-worker`**: 试衣任务后台处理
- **`personal-worker`**: 个人功能任务处理
- **`task-processor`**: 通用任务处理器

#### 专用工具云函数 (Utility Functions)
- **`ai-stylist`**: AI造型师功能
- **`tencent-ci-matting`**: 腾讯云图像处理
- **`cache-helper`**: 缓存助手
- **`database-init`**: 数据库初始化
- **`debug-scenes`**: 场景调试工具

### Key Design Patterns

### 🏗️ 核心设计模式 (Key Design Patterns)

#### 云函数统一架构 (Unified Cloud Function Pattern)
所有云函数都采用action-based路由模式：
```javascript
exports.main = async (event, context) => {
  const { action } = event
  const { OPENID } = cloud.getWXContext()

  switch (action) {
    case 'actionName':
      return await handleAction(event)
    // ...
  }
}
```

#### 🎭 姿势裂变架构 (Pose Variation Architecture)
```javascript
// 支持从原作品生成不同姿势的新作品
if (mode === 'pose_variation') {
  return await handlePoseVariation(event, wxContext, OPENID)
}

// 图片参数：[生成的模特图, 原始服装图1, 原始服装图2, ...]
const imagesForVariation = [modelImage, ...clothingImages]
```

#### 🔄 Fire-and-Forget异步处理模式
主云函数快速响应，worker云函数后台处理：
```javascript
// 主函数：快速创建任务，异步调用worker
cloud.callFunction({
  name: 'photography-worker',
  data: { taskId, originalEvent }
}) // 不等待结果，fire-and-forget

// Worker函数：在独立容器中运行60-120秒
// 完成后自己更新数据库状态
```

#### 📈 状态机管理 (State Machine Pattern)
精确的任务进度跟踪：
```javascript
const stateProgressMap = {
  'pending': 10,
  'downloading': 20,
  'ai_processing': 70,  // AI生成占大部分时间
  'completed': 100,
  'failed': 0
}
```

#### 🤖 企业级API服务模式 (Enterprise API Service Pattern)
`utils/api.js` 提供的1200+行完整API服务：
- 🔄 **指数退避重试**: 智能处理网络波动
- 📦 **请求缓存**: 减少重复API调用 (TTL可配置)
- 🛡️ **防抖节流**: 优化用户交互体验
- ⚡ **并发控制**: 批量请求优化
- 🔥 **云函数预热**: 每4分钟ping一次保持热启动

#### 🎛️ NAS集成架构 (NAS Integration Architecture)
支持外部NAS系统进行AI处理：
```javascript
// NAS专用接口（需要密钥认证）
const nasActions = ['getPendingTasks', 'getTempFileURLs', 'uploadGeneratedImage', 'nasCallback']

// 认证机制
if (nasSecret !== process.env.NAS_SECRET_KEY) {
  return { success: false, message: 'NAS认证失败' }
}
```

### 🔄 数据流架构 (Data Flow Architecture)
1. **用户认证**: App初始化 → 用户登录 → 全局存储 + 本地持久化
2. **AI生成流程**:
   - 上传图片 → 设置参数 → 调用主云函数 → 创建任务
   - 异步调用worker → 后台AI处理 → 状态机更新 → 完成回调
   - 前端轮询进度 → 显示结果 → 作品管理
3. **作品管理**:
   - 时间戳分页 → 精简数据传输 → CDN图片优化
   - 收藏/删除 → 状态同步 → 缓存失效

## Configuration

## ⚙️ 配置信息 (Configuration)

### 🌐 Cloud Environment
- **云环境ID**: `cloudbase-0gu1afji26f514d2` (配置在 `app.js` 和 `cloudbaserc.json`)
- **小程序AppID**: `wx1ed34a87abfaa643` (配置在 `project.config.json`)
- **云函数运行时**: Node.js 16.13
- **npm包管理**: 所有云函数都启用npm包管理

### 🔐 环境变量配置 (Environment Variables)
关键环境变量需要在微信云开发控制台配置：

```bash
# AI服务密钥
GEMINI_OPENAI_API_KEY=your_openai_compatible_gemini_key
GEMINI_GOOGLE_API_KEY=your_google_official_gemini_key

# NAS集成密钥
NAS_SECRET_KEY=your_nas_secret_key_for_webhook_auth

# 其他AI服务密钥（根据需要）
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### 🗄️ 数据库设计 (Database Schema)

#### 核心集合 (Core Collections)

**`users` - 用户信息集合**
```javascript
{
  openid: String,           // 微信用户唯一标识
  nickname: String,        // 用户昵称
  avatar_url: String,      // 头像URL
  credits: Number,        // 当前积分余额
  total_consumed_credits: Number,  // 总消费积分
  status: String,          // 用户状态 (active/inactive)
  preferences: Object,    // 用户偏好设置
  created_at: Date,       // 注册时间
  updated_at: Date        // 更新时间
}
```

**`works` - AI作品集合**
```javascript
{
  user_openid: String,     // 所属用户
  type: String,           // 作品类型 (photography/fitting)
  status: String,         // 状态 (pending/processing/completed/failed)
  task_id: String,        // 关联任务ID
  images: Array,          // 生成的图片数组
  parameters: Object,      // 生成参数
  original_images: Array,  // 原始上传图片
  scene_id: String,       // 场景ID
  reference_work_id: String, // 姿势裂变参考作品ID
  is_favorite: Boolean,   // 是否收藏
  title: String,          // 作品标题
  ai_model: String,       // 使用的AI模型
  ai_prompt: String,       // AI提示词
  created_at: Date,       // 创建时间
  completed_at: Date,    // 完成时间
  updated_at: Date        // 更新时间
}
```

**`task_queue` - 任务队列集合**
```javascript
{
  _id: String,            // 任务ID (自定义生成)
  user_openid: String,     // 所属用户
  type: String,           // 任务类型 (photography/fitting)
  mode: String,           // 模式 (normal/pose_variation)
  status: String,         // 业务状态 (pending/processing/completed/failed)
  state: String,          // 详细状态机状态
  state_data: Object,     // 状态数据
  retry_count: Number,    // 重试次数
  params: Object,         // 任务参数
  result: Object,         // 执行结果
  error: String,          // 错误信息
  created_at: Date,       // 创建时间
  completed_at: Date,    // 完成时间
  updated_at: Date        // 更新时间
}
```

#### 支持集合 (Supporting Collections)

**`scenes` - 摄影场景集合**
```javascript
{
  name: String,           // 场景名称
  category: String,       // 场景分类
  description: String,    // 场景描述
  parameters: Object,     // 场景参数配置
  is_active: Boolean,     // 是否启用
  sort_order: Number,     // 排序权重
  created_at: Date,
  updated_at: Date
}
```

**`aimodels` - AI模型集合**
```javascript
{
  model_id: String,        // 模型唯一标识
  model_name: String,      // 模型显示名称
  model_type: String,      // 模型类型 (image/text)
  api_format: String,      // API格式 (openai_compatible/google_official)
  api_url: String,        // API端点
  api_key: String,        // API密钥 (支持环境变量格式)
  model_config: String,    // 模型配置
  status: String,         // 状态 (active/inactive)
  description: String,     // 模型描述
  parameters: Object,     // 模型参数
  created_time: Date
}
```

**`credit_records` - 积分记录集合**
```javascript
{
  user_openid: String,     // 用户标识
  type: String,           // 类型 (photography/fitting/daily_checkin/recharge)
  amount: Number,         // 积分数量 (正数为收入，负数为支出)
  description: String,     // 描述
  order_id: String,       // 关联订单ID
  work_id: String,        // 关联作品ID
  task_id: String,        // 关联任务ID
  balance_after: Number,   // 操作后余额
  created_at: Date
}
```

**其他集合**:
- `orders`: 支付订单记录
- `daily_checkins`: 每日签到记录
- `invite_records`: 邀请记录
- `pose_presets`: 姿势预设 (姿势裂变功能)

### 🤖 AI服务集成 (AI Integration)

#### 支持的AI提供商
1. **Gemini API (Google)**
   - OpenAI兼容格式接口
   - Google官方格式接口
   - 支持环境变量配置密钥

2. **OpenAI API**
   - DALL-E 3 图像生成
   - GPT-4 文本生成

3. **其他服务** (可扩展)
   - Anthropic Claude
   - Midjourney (通过代理)
   - Stable Diffusion (自部署)

#### 模型选择策略
`aimodels` 云函数根据以下因素自动选择最佳模型：
- 🎯 **能力匹配**: 根据任务需求选择相应模型
- 💰 **成本考量**: 优先选择性价比高的模型
- 🔄 **可用性**: 自动跳过不可用的模型
- ⚡ **性能优先**: 在质量和速度间平衡

#### 🎛️ NAS集成架构
支持与外部NAS系统集成的完整接口：
- **getPendingTasks**: NAS获取待处理任务
- **getTempFileURLs**: 获取云存储文件临时访问URL
- **uploadGeneratedImage**: NAS上传生成的图片
- **nasCallback**: NAS任务完成回调通知

## 🛠️ 开发指南 (Development Guidelines)

### ☁️ 云函数开发 (Cloud Function Development)

#### 基础开发规范
```javascript
// 统一的错误处理模式
try {
  const result = await businessLogic()
  return {
    success: true,
    data: result,
    message: '操作成功'
  }
} catch (error) {
  console.error('操作失败:', error)
  return {
    success: false,
    message: error.message || '操作失败'
  }
}
```

#### 必须遵循的开发原则
- ✅ **OPENID认证**: 所有敏感操作必须验证用户身份
- ✅ **参数验证**: 严格验证所有输入参数
- ✅ **错误处理**: 完整的try-catch错误处理
- ✅ **日志记录**: 详细的操作日志，便于调试
- ✅ **响应格式**: 统一的`{success, data, message}`格式
- ✅ **__noLoading支持**: 后台任务支持跳过loading提示

#### 异步处理最佳实践
```javascript
// Fire-and-forget模式：主函数快速响应，worker后台处理
cloud.callFunction({
  name: 'photography-worker',
  data: { taskId, originalEvent }
}).catch(error => {
  // 区分超时和真正失败
  if (isTimeout(error)) {
    console.log('超时但worker仍在运行')
  } else {
    console.error('Worker真正启动失败')
    await markTaskAsFailed(taskId)
  }
})
```

### 📱 前端开发 (Frontend Development)

#### API服务使用规范
```javascript
// 使用统一的ApiService类
const api = require('./utils/api.js')

// 标准调用（包含重试、缓存、错误处理）
const result = await api.generatePhotography(params)

// 带缓存的调用
const cachedResult = await api.callCloudFunctionWithCache('api', data, {
  cache: true,
  cacheTTL: 300000 // 5分钟缓存
})
```

#### 性能优化要求
- 🔄 **轮询管理**: 使用`app.registerPolling()`防止重复轮询
- 🔥 **云函数预热**: 启动时自动开始预热机制
- 📦 **请求去重**: 避免重复请求浪费资源
- 🛡️ **错误边界**: 完善的错误处理和用户提示

### 🖼️ 图片处理优化 (Image Processing)

#### CDN优化使用
```javascript
// 使用image-handler进行CDN优化
const imageHandler = require('./utils/image-handler.js')

// 自动压缩和格式转换
const optimizedUrl = imageHandler.getOptimizedImageUrl(originalUrl, {
  width: 400,
  height: 400,
  quality: 80,
  format: 'webp'
})

// 错误处理
const safeUrl = imageHandler.handleImageError(riskyUrl, 'work')
```

### 🔐 安全和认证 (Security & Authentication)

#### 多层安全机制
1. **OPENID验证**: 所有敏感操作验证微信用户身份
2. **管理员权限**: 使用`aimodels`云函数验证管理员权限
3. **NAS认证**: 外部NAS访问需要密钥验证
4. **数据隔离**: 用户只能访问自己的数据

#### 权限检查示例
```javascript
// 管理员权限检查
const isAdmin = await checkAdminPermission(OPENID)
if (!isAdmin) {
  return {
    success: false,
    message: '权限不足，需要管理员权限'
  }
}
```

## ⚠️ 常见问题解决 (Common Issues & Solutions)

### 🔄 存储API时机问题
**问题**: 微信存储API在应用启动时可能未就绪
**解决方案**: 已在`app.js`中实现延迟初始化和多重后备机制
```javascript
// 延迟100ms确保存储API准备就绪
setTimeout(() => {
  this.loadUserInfoFromStorage()
}, 100)
```

### ☁️ 云函数冷启动问题
**问题**: 云函数首次调用响应慢
**解决方案**: 已实现云函数预热机制
```javascript
// 每4分钟ping一次，保持热启动
setInterval(() => {
  this.warmUpCloudFunction()
}, 4 * 60 * 1000)
```

### 🎯 网络波动处理
**问题**: 网络不稳定导致API调用失败
**解决方案**: ApiService内置指数退避重试机制
```javascript
// 指数退避 + 随机抖动，避免惊群效应
const delay = baseDelay * Math.pow(2, attempt) + jitter
```

### 🧥 姿势裂变功能
**使用方法**:
1. 用户在作品详情页点击"姿势裂变"
2. 选择姿势描述或使用预设
3. 系统自动调用`photography`云函数的`pose_variation`模式
4. Worker使用`[生成的模特图, 原始服装图...]`作为输入

**关键代码**:
```javascript
// 前端调用
api.generatePhotography({
  mode: 'pose_variation',
  referenceWorkId: '原作品ID',
  poseDescription: '自定义姿势描述'
})

// 云函数处理
if (mode === 'pose_variation') {
  return await handlePoseVariation(event, wxContext, OPENID)
}
```

### 📊 性能监控和优化

#### 数据传输优化
- **分页查询**: 使用时间戳分页，减少数据传输
- **字段筛选**: 列表页只返回必要字段，详情页返回完整信息
- **图片CDN**: 自动压缩、格式转换、尺寸优化

#### 缓存策略
- **API缓存**: 用户信息、场景数据等静态数据缓存5分钟
- **图片缓存**: CDN缓存 + 前端内存缓存
- **失效机制**: 数据变更时自动清理相关缓存

### 🔧 调试工具 (Debug Tools)

#### 云函数调试脚本
- `debug-auth-issue.ps1`: 用户认证问题调试
- `debug-auth-aimodels.ps1`: AI模型配置调试
- `check-photography-templates.ps1`: 摄影模板数据检查

#### 环境变量配置
```powershell
# 运行环境配置脚本
.\setup-env-vars.ps1

# 检查部署状态
.\deployment-checklist.ps1
```

## 🚀 部署和运维 (Deployment & Operations)

### 生产环境配置
- **环境切换**: 在`project.config.json`中配置生产环境ID
- **环境变量**: 在微信云开发控制台配置所有必要的环境变量
- **权限设置**: 确保云函数有足够的权限访问数据库和存储

### 监控和维护
- **日志监控**: 定期检查云函数运行日志
- **性能监控**: 关注API响应时间和成功率
- **资源使用**: 监控云函数调用次数和存储使用量

---
**本项目全程使用中文对话** 🇨🇳