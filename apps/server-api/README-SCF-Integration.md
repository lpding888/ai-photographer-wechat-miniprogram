# Server API SCF集成文档

## 架构概述

本Server API已成功集成腾讯云SCF函数，实现了完整的AI图像生成服务。

### 调用链路
```
前端/小程序 → Server API → BullMQ Worker → 腾讯云SCF SDK → AI服务
```

### 核心组件

#### 1. SCF服务层 (`src/services/scf-service.ts`)
- **功能**: 腾讯云SCF函数调用封装
- **支持函数**:
  - `ai-image-processor`: 图像处理（压缩、裁剪、水印等）
  - `prompt-generator`: 混元大模型提示词生成
  - `image-generator`: 豆包4.0图像生成
- **特性**: 统一错误处理、重试机制、批量调用

#### 2. AI图像服务 (`src/services/ai-image-service.ts`)
- **功能**: 完整的AI图像生成流程编排
- **流程**: 图像预处理 → 提示词生成 → 图像生成 → 后处理
- **支持**: 独立调用各步骤、完整流程、错误降级

#### 3. BullMQ Worker (`src/workers/ai-image-worker.ts`)
- **功能**: 异步任务处理
- **支持任务类型**:
  - `FULL_GENERATION`: 完整生成流程
  - `PREPROCESS_ONLY`: 仅图像预处理
  - `PROMPT_ONLY`: 仅提示词生成
  - `GENERATE_ONLY`: 仅图像生成
- **特性**: 任务队列、重试机制、并发控制

#### 4. 队列服务 (`src/services/queue-service.ts`)
- **功能**: 任务队列管理
- **特性**: 任务状态跟踪、优先级管理、统计信息

## 环境配置

### 必需的环境变量

```bash
# 腾讯云SCF配置
TENCENTCLOUD_SECRET_ID=your_tencentcloud_secret_id
TENCENTCLOUD_SECRET_KEY=your_tencentcloud_secret_key
TENCENTCLOUD_REGION=ap-beijing

# COS配置（图像处理需要）
COS_BUCKET=your_cos_bucket_name

# 其他配置
DATABASE_URL=mysql://...
REDIS_HOST=localhost
JWT_SECRET=your_jwt_secret
```

### 配置步骤

1. **开发环境**: 复制 `.env.production` 为 `.env.local` 并填入真实值
2. **生产环境**: 直接配置 `.env.production` 中的变量

## API接口

### SCF相关接口

#### SCF健康检查
```
GET /health/scf
```

#### AI生图完整流程
```
POST /api/ai-image/generate
Content-Type: application/json

{
  "clothingImages": ["https://.../clothing1.jpg", "https://.../clothing2.jpg"],
  "sceneType": "indoor",
  "stylePreference": "modern",
  "options": {
    "size": "1024x1024",
    "quality": "standard",
    "n": 2
  }
}
```

#### 仅图像预处理
```
POST /api/ai-image/preprocess
Content-Type: application/json

{
  "images": ["https://.../image.jpg"],
  "options": {
    "compress": true,
    "resize": { "width": 1024, "height": 1024, "mode": "fit" },
    "format": "webp"
  }
}
```

#### 仅生成提示词
```
POST /api/ai-image/generate-prompt
Content-Type: application/json

{
  "imageUrl": "https://.../clothing.jpg",
  "clothingType": "fashion",
  "stylePreference": "modern",
  "sceneType": "indoor"
}
```

#### 仅生成图像
```
POST /api/ai-image/generate-only
Content-Type: application/json

{
  "prompt": "一个穿着时尚服装的模特",
  "options": {
    "size": "1024x1024",
    "quality": "standard",
    "n": 2
  },
  "modelConfig": {
    "model": "doubao-Seedream-4-0-250828"
  }
}
```

### 传统接口（已更新）

#### AI生图任务管理
```
POST /api/v1/ai-generation/create     # 创建任务
GET  /api/v1/ai-generation/tasks/:id # 获取任务状态
DELETE /api/v1/ai-generation/tasks/:id # 取消任务
GET  /api/v1/ai-generation/tasks    # 获取任务列表
```

## 部署和测试

### 本地开发测试

1. **启动服务**:
   ```bash
   npm run dev
   ```

2. **运行SCF集成测试**:
   ```bash
   node test-scf-integration.js
   ```

3. **运行API接口测试**:
   ```bash
   node test-api.js
   ```

### 生产部署

1. **配置环境变量**: 确保 `.env.production` 中所有必需变量已配置
2. **部署SCF函数**: 将 `scf-functions/` 下的函数部署到腾讯云SCF
3. **启动服务**:
   ```bash
   npm run build
   npm start
   ```

## 监控和调试

### 健康检查
- **API健康**: `GET /health`
- **SCF健康**: `GET /health/scf`
- **队列状态**: BullMQ Worker日志

### 日志格式
所有服务使用统一的日志格式：
- 启动: `🚀 服务启动`
- 成功: `✅ 操作成功`
- 错误: `❌ 操作失败`
- 信息: `📊 信息日志`

### 错误处理
- **SCF调用失败**: 自动重试3次
- **任务失败**: 自动退还积分
- **网络异常**: 降级处理机制

## 性能优化

### 并发控制
- **SCF调用**: 限制并发数避免超限
- **Worker处理**: BullMQ队列限流
- **API请求**: 熔断器保护

### 缓存策略
- **提示词结果**: 可缓存相似提示词
- **场景配置**: 内存缓存场景信息
- **用户状态**: Redis缓存用户信息

## 故障排查

### 常见问题

1. **SCF调用失败**
   - 检查环境变量配置
   - 验证SCF函数是否部署
   - 查看SCF函数日志

2. **队列任务阻塞**
   - 检查Redis连接
   - 查看Worker状态
   - 重启队列服务

3. **图片处理超时**
   - 调整图片尺寸
   - 检查网络带宽
   - 优化处理流程

### 调试工具
- **SCF日志**: 腾讯云控制台
- **队列监控**: Redis CLI或管理界面
- **API日志**: 结构化日志输出

## 版本信息

- **架构版本**: 3.0.0
- **SCF架构**: 腾讯云标准架构
- **调用方式**: BullMQ异步处理
- **最后更新**: 2024-01-01

---

**作者**: 老王
**架构**: 腾讯云SCF + BullMQ
**版本**: 3.0.0