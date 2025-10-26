# AI生图SCF函数集合

## 函数概述

本项目包含3个腾讯云SCF函数，用于AI生图完整流程：

### 1. ai-image-processor
- **功能**: 图像预处理（抠图、旋转、压缩、格式转换）
- **触发方式**: API调用
- **运行时**: Node.js 16.13
- **内存**: 512MB
- **超时**: 30秒

### 2. prompt-generator
- **功能**: 使用混元大模型分析图片并生成AI绘画提示词
- **触发方式**: API调用
- **运行时**: Node.js 16.13
- **内存**: 1024MB
- **超时**: 60秒

### 3. image-generator
- **功能**: 使用豆包4.0大模型生成高质量图像
- **触发方式**: API调用
- **运行时**: Node.js 16.13
- **内存**: 2048MB
- **超时**: 300秒

## 环境变量配置

### ai-image-processor
```bash
COS_SECRET_ID=your_cos_secret_id
COS_SECRET_KEY=your_cos_secret_key
COS_BUCKET=your_bucket_name
COS_REGION=ap-guangzhou
COS_DOMAIN=custom-domain.com
```

### prompt-generator
```bash
HUNYUAN_SECRET_ID=your_hunyuan_secret_id
HUNYUAN_SECRET_KEY=your_hunyuan_secret_key
HUNYUAN_REGION=ap-beijing
HUNYUAN_MODEL=hunyuan-vision
```

### image-generator
```bash
DOUBAO_API_KEY=your_doubao_api_key
DOUBAO_API_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=doubao-v4
COS_SECRET_ID=your_cos_secret_id
COS_SECRET_KEY=your_cos_secret_key
COS_BUCKET=your_bucket_name
COS_REGION=ap-guangzhou
```

## 部署方式

### 1. 使用腾讯云控制台部署
1. 登录腾讯云SCF控制台
2. 创建新函数
3. 选择"自定义创建"
4. 上传代码zip包
5. 配置环境变量
6. 设置触发器（API网关触发器）

### 2. 使用CLI部署
```bash
# 安装SCF CLI
npm install -g @tencentcloud/scf-cli

# 配置认证信息
scf configure set --secret-id your_secret_id --secret-key your_secret_key --region ap-guangzhou

# 部署函数
scf deploy --template template.json
```

### 3. 使用Serverless Framework
```bash
# 安装Serverless Framework
npm install -g serverless

# 部署
serverless deploy
```

## 调用方式

### ai-image-processor
```json
{
  "images": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
  "options": {
    "enableMatting": true,
    "enableOrientationCorrection": true,
    "resize": "1024x1024",
    "quality": 0.9,
    "format": "jpg"
  }
}
```

### prompt-generator
```json
{
  "imageUrls": ["https://example.com/processed1.jpg"],
  "sceneId": "scene_xxx",
  "sceneConfig": {
    "name": "都市街拍",
    "category": "URBAN",
    "promptTemplate": "现代都市街道背景..."
  },
  "modelConfig": {
    "height": 170,
    "weight": 55,
    "bodyType": "slim"
  },
  "generationMode": "NORMAL"
}
```

### image-generator
```json
{
  "prompt": "详细的AI绘画提示词...",
  "count": 4,
  "size": "1024x1024",
  "options": {
    "steps": 50,
    "cfgScale": 7.5,
    "style": "photographic",
    "quality": "hd"
  }
}
```

## 监控和日志

### 日志查看
- 腾讯云SCF控制台 → 函数管理 → 日志查询
- 使用CloudLens进行日志聚合分析

### 性能监控
- 监控指标：执行时间、内存使用、错误率
- 告警配置：错误率、超时率、并发数

### 成本优化
- 配置适当的内存大小
- 设置合理的超时时间
- 使用预置并发减少冷启动

## 故障排除

### 常见问题
1. **内存不足**: 增加内存配置或优化代码
2. **超时**: 增加超时时间或优化处理逻辑
3. **API调用失败**: 检查网络连接和API密钥
4. **权限错误**: 检查IAM角色和权限配置

### 调试技巧
- 使用console.log输出调试信息
- 本地调试后再部署到SCF
- 使用测试事件验证函数逻辑

## 版本管理

- 使用Git进行代码版本控制
- SCF函数版本管理
- 灰度发布策略

## 安全考虑

- API密钥使用环境变量存储
- 启用API网关认证
- 设置访问频率限制
- 定期轮换密钥

## 更新记录

- v1.0.0 (2025-01-26): 初始版本发布
  - 实现基础的图像预处理功能
  - 集成混元大模型提示词生成
  - 集成豆包4.0图像生成
  - 完整的错误处理和日志记录

## 联系方式

- 作者: 老王
- 项目地址: [GitHub仓库链接]
- 问题反馈: [Issues链接]