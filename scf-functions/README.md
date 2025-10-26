# AI摄影师SCF函数集合 v3.0.0

## 架构概述

本项目基于腾讯云SCF标准架构，提供完整的AI图像生成和处理服务。

### 正确的调用链
```
前端 → server-api → BullMQ Worker → 腾讯云SCF SDK → AI服务
```

## SCF函数列表

### 1. ai-image-processor (v3.0.0)
- **功能**: 腾讯云CI图像处理和优化操作
- **支持操作**: 压缩、调整尺寸、格式转换、水印、智能裁剪、人脸美颜、图片增强、批量处理
- **架构**: 标准腾讯云SCF，使用tencentcloud-sdk-nodejs
- **触发方式**: 腾讯云SDK调用
- **运行时**: Node.js 16.13+
- **内存**: 1024MB
- **超时**: 120秒

### 2. prompt-generator (v3.0.0)
- **功能**: 使用混元大模型分析图片并生成AI绘画提示词
- **架构**: 标准腾讯云SCF，直接调用混元API
- **触发方式**: 腾讯云SDK调用
- **运行时**: Node.js 16.13+
- **内存**: 1024MB
- **超时**: 60秒

### 3. image-generator (v3.0.0)
- **功能**: 使用豆包Seedream 4.0模型生成高质量图像
- **架构**: 标准腾讯云SCF，直接调用豆包API
- **触发方式**: 腾讯云SDK调用
- **运行时**: Node.js 16.13+
- **内存**: 2048MB
- **超时**: 300秒

## 环境变量配置

### 统一环境变量 (所有函数)
```bash
# 腾讯云访问密钥
TENCENTCLOUD_SECRET_ID=your_tencentcloud_secret_id
TENCENTCLOUD_SECRET_KEY=your_tencentcloud_secret_key
TENCENTCLOUD_REGION=ap-beijing

# COS配置 (ai-image-processor)
COS_BUCKET=your_bucket_name
```

## API调用示例

### ai-image-processor 调用示例
```javascript
const tencentcloud = require('tencentcloud-sdk-nodejs')
const scf = new tencentcloud.SCF({...})

// 压缩图片
const compressResult = await scf.Invoke({
  FunctionName: 'ai-image-processor',
  Payload: JSON.stringify({
    action: 'compressImage',
    imageUrl: 'https://bucket.cos.region.myqcloud.com/image.jpg',
    quality: 80
  })
})

// 智能裁剪
const cropResult = await scf.Invoke({
  FunctionName: 'ai-image-processor',
  Payload: JSON.stringify({
    action: 'smartCrop',
    imageUrl: 'https://bucket.cos.region.myqcloud.com/image.jpg',
    width: 1024,
    height: 1024,
    scenes: '1'
  })
})
```

### prompt-generator 调用示例
```javascript
const generatePrompt = await scf.Invoke({
  FunctionName: 'prompt-generator',
  Payload: JSON.stringify({
    imageUrl: 'https://example.com/clothing.jpg',
    clothingType: 'fashion',
    stylePreference: 'modern',
    sceneType: 'indoor'
  })
})
```

### image-generator 调用示例
```javascript
const generateImage = await scf.Invoke({
  FunctionName: 'image-generator',
  Payload: JSON.stringify({
    prompt: '一个穿着时尚服装的模特',
    options: {
      size: '1024x1024',
      quality: 'standard',
      n: 2
    },
    modelConfig: {
      model: 'doubao-Seedream-4-0-250828'
    }
  })
})
```

## 响应格式

### 成功响应
```javascript
{
  success: true,
  data: {
    // 具体数据内容
  },
  message: '操作成功',
  timestamp: '2024-01-01T10:00:00.000Z',
  version: '3.0.0',
  request_id: 'request-id'
}
```

### 错误响应
```javascript
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: '错误描述',
    type: 'ErrorType'
  },
  timestamp: '2024-01-01T10:00:00.000Z',
  version: '3.0.0'
}
```

## 部署说明

### 前置要求
1. 腾讯云账号已开通SCF服务
2. 已配置访问密钥
3. 已创建COS存储桶（图像处理函数需要）

### 部署步骤
1. 通过腾讯云SCF控制台创建函数
2. 上传对应的index.js和package.json
3. 配置环境变量
4. 设置内存和超时参数
5. 测试函数功能

## 监控和调试

### 日志格式
- 使用emoji前缀增强可读性
- 结构化JSON输出关键信息
- 完整的请求-响应生命周期记录

### 健康检查
每个函数都提供health_check方法：
```javascript
{
  status: 'healthy',
  function: 'function-name',
  version: '3.0.0',
  architecture: 'tencent_cloud_scf',
  environment: {...},
  timestamp: '2024-01-01T10:00:00.000Z'
}
```

## 版本变更

### v3.0.0 (当前版本)
- ✅ 完全重构为腾讯云SCF标准架构
- ✅ 移除错误的适配器模式
- ✅ 统一使用tencentcloud-sdk-nodejs
- ✅ 标准化main_handler入口
- ✅ 完善的错误处理和日志记录
- ✅ 支持action路由（多功能函数）

### v2.0.0 (已废弃)
- ❌ 错误的适配器架构
- ❌ 混合使用多种SDK
- ❌ 复杂的目录结构

## 注意事项

1. **不要直接从前端调用SCF函数**
   - 必须通过server-api → BullMQ Worker → SCF的调用链
   - 确保安全性和流量控制

2. **环境变量安全**
   - 所有密钥通过环境变量配置
   - 不要在代码中硬编码任何密钥

3. **资源限制**
   - 注意SCF的内存和时间限制
   - 合理设置超时时间避免任务中断

4. **错误处理**
   - 实现完善的降级机制
   - API失败时提供备用方案

---

**作者**: 老王
**架构**: 腾讯云SCF标准架构
**版本**: 3.0.0
**更新时间**: 2024-01-01