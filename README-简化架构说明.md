# 🎯 AI生图流程简化架构说明

## 📋 核心流程（已修正）

**正确的AI生图流程：**

1. **混元分析图片** → 生成结构化分析结果
2. **自动生成提示词** → 根据分析结果自动构建生图提示词
3. **豆包生成图片** → 使用生成的提示词创建高质量图片

**不需要提示词模板系统！**

## 🏗️ 架构设计

```
用户上传图片 → 混元分析 → 自动提示词生成 → 豆包生图 → 返回结果
     ↓              ↓              ↓             ↓
  图片文件    JSON分析结果   自然语言提示词   高质量图片
```

## 📁 项目结构

```
scf-functions/
├── common/
│   ├── adapters/           # 适配器系统
│   │   ├── base-adapter.js    # 基础适配器接口
│   │   ├── hunyuan-adapter.js # 混元适配器（图像分析）
│   │   ├── doubao-adapter.js  # 豆包适配器（图像生成）
│   │   └── factory.js         # 适配器工厂
│   └── config/            # 配置系统
│       ├── config-loader.js    # 配置加载器
│       └── models/            # 模型配置文件
│           ├── hunyuan.json   # 混元配置
│           └── doubao.json    # 豆包配置
├── prompt-generator/         # 提示词生成函数（分析+生成）
├── image-generator/          # 图像生成函数
└── admin-api/               # 管理API（仅模型配置）

admin-web/                    # 简化的管理后台
├── pages/admin/              # 模型配置管理
├── components/admin/         # 配置组件
└── utils/admin/              # 管理工具
```

## 🚀 使用方式

### 1. **调用提示词生成（分析+自动生成）**

```javascript
const result = await cloud.callFunction({
  name: 'prompt-generator',
  data: {
    imageUrls: ['https://example.com/photo.jpg'],
    sceneConfig: {
      name: '时尚摄影',
      category: 'FASHION'
    },
    modelType: 'hunyuan',  // 使用混元分析
    analysisOptions: {
      temperature: 0.3,
      maxTokens: 2000
    }
  }
})

// 返回结果：
{
  success: true,
  data: {
    prompt: "25岁女性，长发，苗条身材，微笑表情，穿着白色时尚风格的连衣裙，丝绸材质，站立姿势，在现代都市环境中，自然城市光线，时尚氛围，专业摄影级别画质，8K超高分辨率，极致精细细节...",
    analysis: {
      person: { age: "25岁", gender: "女性", hair: "长发", ... },
      clothing: { type: "连衣裙", color: "白色", style: "时尚", ... },
      pose: { posture: "站立", action: "自然", ... },
      style: { overall: "时尚", mood: "自然", ... }
    }
  }
}
```

### 2. **调用图像生成（使用自动生成的提示词）**

```javascript
const result = await cloud.callFunction({
  name: 'image-generator',
  data: {
    prompt: "从prompt-generator获取的提示词",
    modelType: 'doubao',  // 使用豆包生图
    options: {
      size: '2K',
      quality: 'hd',
      maxImages: 4
    }
  }
})
```

### 3. **一键式生图流程**

```javascript
// 第一步：分析图片并生成提示词
const analysisResult = await cloud.callFunction({
  name: 'prompt-generator',
  data: {
    imageUrls: ['原图URL'],
    sceneConfig: { name: '时尚摄影', category: 'FASHION' }
  }
})

// 第二步：使用生成的提示词生图
const imageResult = await cloud.callFunction({
  name: 'image-generator',
  data: {
    prompt: analysisResult.data.prompt,
    modelType: 'doubao'
  }
})
```

## ⚙️ 配置管理

### 混元配置 (`hunyuan.json`)
```json
{
  "name": "混元大模型",
  "type": "hunyuan",
  "useCloudBase": true,
  "envId": "your-env-id",
  "defaultModel": "hunyuan-vision",
  "defaultParams": {
    "temperature": 0.3,
    "maxTokens": 2000
  }
}
```

### 豆包配置 (`doubao.json`)
```json
{
  "name": "豆包Seedream 4.0",
  "type": "doubao",
  "apiKey": "your-doubao-api-key",
  "defaultModel": "doubao-Seedream-4-0-250828",
  "defaultParams": {
    "size": "2K",
    "quality": "hd",
    "maxImages": 4
  }
}
```

## 🔄 换模型方法

### **换混元模型**
1. 修改 `hunyuan.json` 配置文件
2. 更新环境变量：`TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY`
3. **代码不需要改动！**

### **换豆包模型**
1. 修改 `doubao.json` 配置文件
2. 更新环境变量：`DOUBAO_API_KEY`
3. **代码不需要改动！**

## 🎯 核心优势

### 1. **智能提示词生成**
- 混元分析图片 → 结构化数据
- 自动分析人物、服装、姿势、风格
- 智能构建适合豆包的自然语言提示词

### 2. **完全抽屉式**
- 换模型只需要修改配置文件
- 不需要修改任何业务代码
- 配置热更新，立即生效

### 3. **标准化流程**
- 输入：图片 + 场景配置
- 输出：高质量图片
- 中间过程全自动

### 4. **高质量输出**
- 专业的分析结果
- 自然的提示词构建
- 电影级的图像质量

## 📊 示例对比

### **输入图片**
时尚模特穿着白色连衣裙的街拍照片

### **混元分析结果**
```json
{
  "person": {
    "age": "25岁",
    "gender": "女性",
    "hair": "棕色长发",
    "bodyType": "苗条",
    "expression": "自然微笑"
  },
  "clothing": {
    "type": "连衣裙",
    "color": "白色",
    "style": "时尚简约",
    "material": "丝绸"
  },
  "pose": {
    "posture": "站立",
    "action": "自然行走",
    "angle": "侧面视角"
  },
  "style": {
    "overall": "时尚街拍",
    "mood": "自信活力",
    "scene_type": "都市街道"
  }
}
```

### **自动生成的提示词**
```
25岁女性棕色长发，苗条身材，自然微笑表情，穿着白色时尚简约风格的连衣裙，丝绸材质，自然行走，侧面视角，在现代都市环境中，自然城市光线，自信活力氛围，专业摄影级别画质，8K超高分辨率，极致精细细节，电影级渲染效果，色彩真实自然，专业摄影构图，完美光影效果，高级质感呈现，艺术审美标准。
```

### **豆包生成结果**
高质量、符合描述的时尚摄影作品

## 🔧 管理后台功能

简化的管理后台只专注于：

1. **模型配置管理**
   - 修改API密钥
   - 调整模型参数
   - 测试连接状态

2. **系统监控**
   - 适配器健康状态
   - 缓存使用情况
   - 调用统计信息

3. **配置管理**
   - 导入/导出配置
   - 配置备份和恢复
   - 批量操作支持

---

**总结：这个架构专注于AI生图的核心流程，混元负责分析，豆包负责生成，中间的提示词完全自动生成，无需手动维护模板！** 🎉