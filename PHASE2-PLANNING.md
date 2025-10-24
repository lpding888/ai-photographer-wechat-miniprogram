# AI摄影师小程序 - 二期架构升级规划

## 📋 项目概述

**项目名称**：AI摄影师微信小程序架构升级
**当前版本**：基于微信云开发的无服务器架构
**目标架构**：服务器 + SCF + COS + CI 混合云架构
**预计工期**：6-8周
**负责人**：老王架构设计

## 🎯 升级目标

### **性能提升**
- 图片加载速度提升 50%+（CDN加速）
- API响应时间减少 30%（本地计算）
- 并发处理能力提升 100%（服务器集群）

### **成本优化**
- 月度运营成本降低 42%（￥650 → ￥380）
- 存储成本降低 50%（COS更便宜）
- 计算成本降低 35%（服务器特惠套餐）

### **功能增强**
- 实时图片处理（数据万象CI）
- 智能缓存策略
- 更丰富的图片处理功能
- 更好的用户监控和分析

## 🏗️ 目标架构图

```
┌─────────┐    ┌─────────────┐    ┌─────────────────┐    ┌─────────────┐
│ 小程序   │ ──▶│ Nginx(服务器) │ ──▶│ Node.js API(服务器)│ ──▶│ SCF云函数   │
└─────────┘    └─────────────┘    └─────────────────┘    └─────────────┘
                      │                        │                      │
                      ▼                        ▼                      ▼
               ┌─────────────┐    ┌─────────────────┐    ┌─────────────┐
               │ 静态资源     │    │ TencentDB      │    │ COS+CI      │
               │ 缓存         │    │ 数据库          │    │ 图片存储     │
               └─────────────┘    └─────────────────┘    └─────────────┘
```

## 📅 详细实施计划

### **第一阶段：服务器基础环境搭建（第1周）**

#### **第1天：服务器配置和基础安装**
```bash
# 系统更新
sudo yum update -y

# 安装Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 安装Nginx
sudo yum install -y nginx

# 安装PM2
sudo npm install -g pm2

# 创建项目目录
sudo mkdir -p /var/www/ai-photographer
sudo chown -R $USER:$USER /var/www/ai-photographer
```

**检查清单**：
- [ ] Node.js版本确认：`node --version`
- [ ] Nginx状态检查：`sudo systemctl status nginx`
- [ ] 防火墙配置：`sudo ufw status`
- [ ] 磁盘空间检查：`df -h`

#### **第2-3天：项目代码结构搭建**

**目录结构**：
```
/var/www/ai-photographer/
├── src/
│   ├── app.js              # 主应用入口
│   ├── config/             # 配置文件
│   ├── middleware/         # 中间件
│   ├── routes/             # 路由
│   ├── services/           # 服务层
│   ├── models/             # 数据模型
│   └── utils/              # 工具函数
├── static/                 # 静态文件
├── logs/                   # 日志目录
├── scripts/                # 脚本文件
├── package.json
├── .env                    # 环境变量
└── ecosystem.config.js     # PM2配置
```

#### **第4-5天：数据库配置和连接**

**数据库选型**：腾讯云MySQL（推荐）或PostgreSQL

**连接配置**：
```javascript
// src/config/database.js
module.exports = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}
```

#### **第6-7天：Nginx配置和SSL证书**

**域名配置**：
```nginx
# /etc/nginx/sites-available/ai-photographer
server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://localhost:3000;
        client_max_body_size 50M;
    }

    location /static/ {
        alias /var/www/ai-photographer/static/;
        expires 30d;
    }
}
```

### **第二阶段：核心API服务开发（第2-3周）**

#### **第1周：用户认证和基础API**

**核心文件**：
- `src/app.js` - Express应用主入口
- `src/middleware/auth.js` - 微信认证中间件
- `src/routes/user.js` - 用户相关路由
- `src/services/wx-service.js` - 微信服务

**API端点设计**：
```
POST /api/user/login          # 用户登录
GET  /api/user/info           # 获取用户信息
PUT  /api/user/info           # 更新用户信息
POST /api/user/refresh        # 刷新token
```

#### **第2周：文件上传和存储集成**

**核心文件**：
- `src/routes/upload.js` - 文件上传路由
- `src/services/cos-service.js` - COS存储服务
- `src/middleware/upload.js` - 上传中间件

**API端点设计**：
```
POST /api/upload/sign         # 获取上传签名
POST /api/upload/complete     # 完成上传确认
DELETE /api/upload/file/:id   # 删除文件
```

#### **第3周：摄影和试衣API**

**核心文件**：
- `src/routes/photography.js` - 摄影API
- `src/routes/fitting.js` - 试衣API
- `src/services/scf-service.js` - SCF调用服务

**API端点设计**：
```
POST /api/photography/generate    # 生成摄影作品
GET  /api/photography/progress/:taskId  # 获取进度
POST /api/fitting/generate         # 生成试衣作品
GET  /api/fitting/progress/:taskId     # 获取进度
```

### **第三阶段：SCF云函数迁移（第4-5周）**

#### **第4周：核心云函数迁移**

**迁移列表**：
1. `photography` - AI摄影生成
2. `photography-worker` - 摄影后台处理
3. `fitting` - AI试衣生成
4. `fitting-worker` - 试衣后台处理

**SCF配置**：
```yaml
# serverless.yml
service: ai-photographer-scf

functions:
  photography:
    handler: photography.main_handler
    runtime: Node.js18.15
    timeout: 60
    memory: 512MB
    events:
      - http:
          path: /photography
          method: post
```

#### **第5周：API网关配置和测试**

**API网关配置**：
- 创建API网关服务
- 配置路径映射
- 设置CORS策略
- 配置限流规则

**测试验证**：
- 单元测试编写
- 集成测试执行
- 性能测试验证
- 错误处理测试

### **第四阶段：数据万象CI集成（第6周）**

#### **CI功能集成**

**图片处理功能**：
- 智能缩放：`imageMogr2/thumbnail/400x300`
- 质量压缩：`quality/80`
- 格式转换：`format/webp`
- 智能裁剪：`imageMogr2/crop/400x300/gravity/center`
- 水印添加：`watermark/2/text/SGVsbG8=`

**服务代码**：
```javascript
// src/services/image-service.js
class ImageService {
  generateProcessUrl(originalUrl, options) {
    const baseUrl = this.parseCosUrl(originalUrl)
    const params = this.buildCIParams(options)
    return `${baseUrl}?${params}`
  }

  buildCIParams(options) {
    const params = []
    if (options.thumbnail) params.push(`imageMogr2/thumbnail/${options.thumbnail}`)
    if (options.quality) params.push(`quality/${options.quality}`)
    if (options.format) params.push(`format/${options.format}`)
    return params.join('/')
  }
}
```

### **第五阶段：智能图片处理流程（第7周）**

#### **🤖 智能图片处理架构**

**完整流程设计**：
```
用户上传图片 → 万象智能抠图 → 多模态大模型分析 → 提示词工程优化 → AI生成 → 结果入库
```

**核心组件**：
1. **万象智能抠图**：自动识别主体，去除背景
2. **多模态大模型**：GPT-4V、文心一言等描述图片
3. **提示词工程**：基于描述生成专业摄影提示词
4. **图片元数据管理**：结构化存储图片信息

#### **万象抠图集成**

```javascript
// src/services/ci-matting-service.js
class CIMattingService {
  constructor() {
    this.ciService = require('./ci-service')
    this.cosService = require('./cos-service')
  }

  /**
   * 智能抠图处理
   * @param {string} originalKey - 原始图片COS Key
   * @param {Object} options - 抠图选项
   */
  async intelligentMatting(originalKey, options = {}) {
    try {
      // 1. 调用万象智能抠图
      const mattingResult = await this.ciService.processImage({
        key: originalKey,
        operations: {
          'ci-process': 'image-matting',           // 抠图功能
          'matting-type': options.type || 'auto', // auto/human/product
          'matting-version': options.version || 'v2.0',
          'matting-edgesmooth': options.edgeSmooth || 'level_3',
          'matting-feather': options.feather || '10'
        }
      })

      // 2. 保存抠图结果到COS
      const mattingKey = this.generateMattingKey(originalKey)
      await this.saveMattingResult(mattingKey, mattingResult.data)

      return {
        success: true,
        data: {
          originalKey,
          mattingKey,
          mattingUrl: this.cosService.getFileUrl(mattingKey, 86400),
          confidence: mattingResult.confidence,
          processTime: mattingResult.processTime
        }
      }
    } catch (error) {
      console.error('智能抠图失败:', error)
      throw new Error(`抠图处理失败: ${error.message}`)
    }
  }

  /**
   * 批量抠图处理
   */
  async batchMatting(imageKeys, options = {}) {
    const results = []

    for (const key of imageKeys) {
      try {
        const result = await this.intelligentMatting(key, options)
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          key,
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * 生成抠图文件Key
   */
  generateMattingKey(originalKey) {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 6)
    const path = originalKey.replace(/^(.*)\.(.*?)$/, '$1')
    return `${path}_matting_${timestamp}_${random}.png`
  }

  /**
   * 保存抠图结果
   */
  async saveMattingResult(mattingKey, imageBuffer) {
    return await this.cosService.uploadFile(mattingKey, imageBuffer, 'image/png')
  }
}

module.exports = new CIMattingService()
```

#### **多模态大模型图片分析**

```javascript
// src/services/multimodal-service.js
class MultimodalService {
  constructor() {
    this.models = {
      'gpt4v': require('./models/gpt4v'),
      'qwen-vl': require('./models/qwen-vl'),
      'yi-vision': require('./models/yi-vision'),
      'claude3': require('./models/claude3')
    }
  }

  /**
   * 智能图片分析
   * @param {string} imageUrl - 图片URL
   * @param {Object} options - 分析选项
   */
  async analyzeImage(imageUrl, options = {}) {
    const {
      model = 'gpt4v',           // 使用的大模型
      analysisType = 'comprehensive', // 分析类型
      language = 'zh-CN',        // 语言
      detail = true              // 详细分析
    } = options

    try {
      // 1. 获取图片临时访问URL
      const tempImageUrl = await this.getTempImageUrl(imageUrl)

      // 2. 调用多模态大模型
      const analysis = await this.callMultimodalModel(tempImageUrl, {
        model,
        analysisType,
        language,
        detail
      })

      // 3. 结构化分析结果
      const structuredAnalysis = this.structureAnalysis(analysis)

      // 4. 保存分析结果到数据库
      await this.saveImageAnalysis(imageUrl, structuredAnalysis)

      return {
        success: true,
        data: structuredAnalysis
      }
    } catch (error) {
      console.error('图片分析失败:', error)
      throw new Error(`图片分析失败: ${error.message}`)
    }
  }

  /**
   * 调用多模态大模型
   */
  async callMultimodalModel(imageUrl, options) {
    const { model, analysisType, language, detail } = options

    const prompt = this.buildAnalysisPrompt(analysisType, language, detail)

    switch (model) {
      case 'gpt4v':
        return await this.models.gpt4v.analyze(imageUrl, prompt)
      case 'qwen-vl':
        return await this.models['qwen-vl'].analyze(imageUrl, prompt)
      case 'yi-vision':
        return await this.models['yi-vision'].analyze(imageUrl, prompt)
      case 'claude3':
        return await this.models.claude3.analyze(imageUrl, prompt)
      default:
        throw new Error(`不支持的大模型: ${model}`)
    }
  }

  /**
   * 构建分析提示词
   */
  buildAnalysisPrompt(analysisType, language, detail) {
    const prompts = {
      comprehensive: {
        'zh-CN': `请详细分析这张图片，提供以下信息：
1. 主要内容和主题
2. 人物特征（性别、年龄、服饰、发型等）
3. 场景环境（室内/室外、光线、背景等）
4. 色彩搭配和风格
5. 情感氛围和意境
6. 适合的摄影风格和建议
7. 可能的改进建议

请以JSON格式返回结构化数据。`,
        'en-US': `Please analyze this image in detail and provide the following information:
1. Main content and theme
2. Person characteristics (gender, age, clothing, hairstyle, etc.)
3. Scene environment (indoor/outdoor, lighting, background, etc.)
4. Color scheme and style
5. Emotional atmosphere and mood
6. Suitable photography styles and suggestions
7. Possible improvement recommendations

Please return structured data in JSON format.`
      },
      fashion: {
        'zh-CN': `请专注于分析这张图片中的时尚元素：
1. 服装款式和风格
2. 颜色搭配
3. 材质和质感
4. 适合的体型和场合
5. 流行趋势分析
6. 搭配建议
7. 时尚评分（1-10分）

请以JSON格式返回。`,
        'en-US': `Please focus on analyzing the fashion elements in this image:
1. Clothing style and design
2. Color coordination
3. Materials and textures
4. Suitable body types and occasions
5. Trend analysis
6. Styling suggestions
7. Fashion score (1-10)

Please return in JSON format.`
      },
      photography: {
        'zh-CN': `请从专业摄影角度分析这张图片：
1. 构图分析（三分法、引导线、对称等）
2. 光线条件（自然光、人造光、方向、强度）
3. 焦点和景深效果
4. 色温和白平衡
5. 对比度和曝光
6. 建议的拍摄参数
7. 后期处理建议

请以JSON格式返回。`,
        'en-US': `Please analyze this image from a professional photography perspective:
1. Composition analysis (rule of thirds, leading lines, symmetry, etc.)
2. Lighting conditions (natural/artificial light, direction, intensity)
3. Focus and depth of field
4. Color temperature and white balance
5. Contrast and exposure
6. Recommended shooting parameters
7. Post-processing suggestions

Please return in JSON format.`
      }
    }

    return prompts[analysisType]?.[language] || prompts.comprehensive['zh-CN']
  }

  /**
   * 结构化分析结果
   */
  structureAnalysis(rawAnalysis) {
    try {
      // 尝试解析JSON格式
      if (typeof rawAnalysis === 'string') {
        return JSON.parse(rawAnalysis)
      }

      // 如果不是JSON，尝试提取结构化信息
      return {
        content: rawAnalysis.content || rawAnalysis,
        metadata: rawAnalysis.metadata || {},
        confidence: rawAnalysis.confidence || 0.8,
        model: rawAnalysis.model || 'unknown',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('结构化分析失败:', error)
      return {
        content: rawAnalysis,
        metadata: {},
        confidence: 0.5,
        model: 'unknown',
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 保存图片分析结果
   */
  async saveImageAnalysis(imageUrl, analysis) {
    const db = require('../config/database')

    await db.query(`
      INSERT INTO image_analysis (
        image_url, analysis_data, confidence, model, created_at
      ) VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      analysis_data = VALUES(analysis_data),
      confidence = VALUES(confidence),
      model = VALUES(model),
      updated_at = NOW()
    `, [
      imageUrl,
      JSON.stringify(analysis),
      analysis.confidence || 0.8,
      analysis.model,
      new Date()
    ])
  }

  /**
   * 获取临时图片URL
   */
  async getTempImageUrl(imageUrl, expiresIn = 3600) {
    if (imageUrl.includes('cos.') || imageUrl.includes('myqcloud.com')) {
      const cosService = require('./cos-service')
      const key = imageUrl.split('/').pop()
      return await cosService.getFileUrl(key, expiresIn)
    }
    return imageUrl
  }
}

module.exports = new MultimodalService()
```

#### **提示词工程服务**

```javascript
// src/services/prompt-engineering-service.js
class PromptEngineeringService {
  constructor() {
    this.templates = require('./prompt-templates')
    this.multimodalService = require('./multimodal-service')
  }

  /**
   * 生成专业摄影提示词
   * @param {Object} analysis - 图片分析结果
   * @param {Object} requirements - 生成要求
   */
  async generatePhotographyPrompt(analysis, requirements = {}) {
    const {
      style = 'professional',
      mood = 'natural',
      enhancement = 'moderate',
      outputFormat = 'dalle3'
    } = requirements

    try {
      // 1. 基础提示词模板选择
      const baseTemplate = this.selectBaseTemplate(style, mood)

      // 2. 结合图片分析结果优化
      const enhancedPrompt = await this.enhancePromptWithAnalysis(
        baseTemplate,
        analysis,
        requirements
      )

      // 3. 针对不同AI模型优化
      const modelOptimizedPrompt = this.optimizeForModel(enhancedPrompt, outputFormat)

      // 4. 添加技术参数
      const finalPrompt = this.addTechnicalParameters(
        modelOptimizedPrompt,
        requirements
      )

      // 5. 保存提示词记录
      await this.savePromptRecord(analysis, finalPrompt, requirements)

      return {
        success: true,
        data: {
          prompt: finalPrompt,
          template: baseTemplate.name,
          style: style,
          mood: mood,
          estimatedQuality: this.estimatePromptQuality(finalPrompt),
          tokens: this.countTokens(finalPrompt)
        }
      }
    } catch (error) {
      console.error('提示词生成失败:', error)
      throw new Error(`提示词生成失败: ${error.message}`)
    }
  }

  /**
   * 选择基础提示词模板
   */
  selectBaseTemplate(style, mood) {
    const templates = {
      professional: {
        natural: this.templates.professional.natural,
        dramatic: this.templates.professional.dramatic,
        artistic: this.templates.professional.artistic
      },
      fashion: {
        editorial: this.templates.fashion.editorial,
        commercial: this.templates.fashion.commercial,
        street: this.templates.fashion.street
      },
      lifestyle: {
        casual: this.templates.lifestyle.casual,
        elegant: this.templates.lifestyle.elegant,
        modern: this.templates.lifestyle.modern
      }
    }

    return templates[style]?.[mood] || templates.professional.natural
  }

  /**
   * 基于图片分析优化提示词
   */
  async enhancePromptWithAnalysis(template, analysis, requirements) {
    const { content, metadata } = analysis

    // 1. 提取关键信息
    const keyInfo = this.extractKeyInformation(content)

    // 2. 分析人物特征
    const personFeatures = this.analyzePersonFeatures(metadata.person || {})

    // 3. 分析场景环境
    const sceneInfo = this.analyzeSceneEnvironment(metadata.scene || {})

    // 4. 分析时尚元素
    const fashionInfo = this.analyzeFashionElements(metadata.fashion || {})

    // 5. 构建增强提示词
    const enhancedPrompt = template
      .replace('{{PERSON_FEATURES}}', personFeatures)
      .replace('{{SCENE_INFO}}', sceneInfo)
      .replace('{{FASHION_INFO}}', fashionInfo)
      .replace('{{KEY_INFO}}', keyInfo)
      .replace('{{MOOD}}', requirements.mood || 'natural')
      .replace('{{STYLE}}', requirements.style || 'professional')

    return enhancedPrompt
  }

  /**
   * 针对不同AI模型优化
   */
  optimizeForModel(prompt, model) {
    const optimizers = {
      'dalle3': this.optimizeForDalle3,
      'midjourney': this.optimizeForMidjourney,
      'stable-diffusion': this.optimizeForStableDiffusion,
      'firefly': this.optimizeForFirefly
    }

    return optimizers[model]?.call(this, prompt) || prompt
  }

  /**
   * DALL-E 3 优化
   */
  optimizeForDalle3(prompt) {
    // DALL-E 3 喜欢详细的描述性提示词
    return `Create a professional fashion photograph: ${prompt}. High resolution, 8K, sharp focus, natural lighting, realistic details, professional color grading.`
  }

  /**
   * Midjourney 优化
   */
  optimizeForMidjourney(prompt) {
    // Midjourney 喜欢艺术化的关键词
    return `${prompt} --ar 3:4 --style raw --v 6.0 --s 250 --c 5`
  }

  /**
   * Stable Diffusion 优化
   */
  optimizeForStableDiffusion(prompt) {
    // Stable Diffusion 需要负向提示词
    return {
      positive: `(masterpiece, best quality, ultra-detailed, 8k, photorealistic), ${prompt}`,
      negative: `(worst quality, low quality, normal quality, blurry, distorted, ugly, bad anatomy, bad hands, text, watermark, signature)`
    }
  }

  /**
   * 添加技术参数
   */
  addTechnicalParameters(prompt, requirements) {
    const {
      camera = 'canon eos r5',
      lens = '50mm f/1.2',
      lighting = 'natural soft light',
      composition = 'rule of thirds',
      postProcessing = 'light color correction'
    } = requirements

    return `${prompt}. Shot on ${camera} with ${lens}, ${lighting}, ${composition} composition, ${postProcessing} post-processing.`
  }

  /**
   * 提取关键信息
   */
  extractKeyInformation(content) {
    // 从分析内容中提取关键信息
    const keywords = []

    if (typeof content === 'string') {
      // 使用正则表达式提取关键词
      const patterns = {
        colors: /(?:颜色|色彩|color)[:：]?\s*([^\n.，,。.]+)/gi,
        style: /(?:风格|style)[:：]?\s*([^\n.，,。.]+)/gi,
        mood: /(?:氛围|情绪|mood|atmosphere)[:：]?\s*([^\n.，,。.]+)/gi
      }

      Object.values(patterns).forEach(pattern => {
        const matches = content.match(pattern)
        if (matches) {
          keywords.push(...matches.map(m => m.split(/[:：]/)[1]?.trim()))
        }
      })
    }

    return keywords.filter(Boolean).join(', ')
  }

  /**
   * 分析人物特征
   */
  analyzePersonFeatures(person) {
    if (!person || Object.keys(person).length === 0) {
      return 'professional model'
    }

    const features = []

    if (person.gender) features.push(person.gender)
    if (person.age) features.push(`age ${person.age}`)
    if (person.ethnicity) features.push(person.ethnicity)
    if (person.hairstyle) features.push(`${person.hairstyle} hair`)
    if (person.expression) features.push(`${person.expression} expression`)

    return features.length > 0 ? features.join(', ') : 'professional model'
  }

  /**
   * 分析场景环境
   */
  analyzeSceneEnvironment(scene) {
    if (!scene || Object.keys(scene).length === 0) {
      return 'professional studio setting'
    }

    const elements = []

    if (scene.location) elements.push(scene.location)
    if (scene.lighting) elements.push(scene.lighting)
    if (scene.background) elements.push(`${scene.background} background`)
    if (scene.time) elements.push(scene.time)

    return elements.length > 0 ? elements.join(', ') : 'professional studio setting'
  }

  /**
   * 分析时尚元素
   */
  analyzeFashionElements(fashion) {
    if (!fashion || Object.keys(fashion).length === 0) {
      return 'fashionable outfit'
    }

    const elements = []

    if (fashion.style) elements.push(fashion.style)
    if (fashion.colors) elements.push(`${fashion.colors} color scheme`)
    if (fashion.materials) elements.push(`${fashion.materials} materials`)
    if (fashion.accessories) elements.push(fashion.accessories)

    return elements.length > 0 ? elements.join(', ') : 'fashionable outfit'
  }

  /**
   * 估算提示词质量
   */
  estimatePromptQuality(prompt) {
    // 基于提示词长度和关键词丰富度估算质量
    const length = prompt.length
    const keywordCount = (prompt.match(/\b(adjective|color|style|mood|camera|lens)\b/gi) || []).length

    let score = 0.5 // 基础分

    // 长度加分
    if (length > 100) score += 0.2
    if (length > 200) score += 0.1

    // 关键词加分
    score += Math.min(keywordCount * 0.05, 0.2)

    return Math.min(score, 1.0)
  }

  /**
   * 计算Token数量
   */
  countTokens(prompt) {
    // 简单的Token计算（实际应该使用对应模型的tokenizer）
    return Math.ceil(prompt.length / 4)
  }

  /**
   * 保存提示词记录
   */
  async savePromptRecord(analysis, prompt, requirements) {
    const db = require('../config/database')

    await db.query(`
      INSERT INTO prompt_records (
        image_analysis_id, prompt_content, requirements,
        estimated_quality, token_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      analysis.id,
      prompt.prompt,
      JSON.stringify(requirements),
      prompt.estimatedQuality,
      prompt.tokens,
      new Date()
    ])
  }
}

module.exports = new PromptEngineeringService()
```

#### **智能图片处理API路由**

```javascript
// src/routes/intelligent-image.js
const express = require('express')
const router = express.Router()

const ciMattingService = require('../services/ci-matting-service')
const multimodalService = require('../services/multimodal-service')
const promptEngineeringService = require('../services/prompt-engineering-service')

/**
 * 智能图片处理完整流程
 */
router.post('/process', async (req, res) => {
  try {
    const {
      imageKeys,           // 图片Key数组
      processingOptions = {}, // 处理选项
      generationRequirements = {} // 生成要求
    } = req.body

    const results = []

    for (const imageKey of imageKeys) {
      try {
        // 1. 万象智能抠图
        const mattingResult = await ciMattingService.intelligentMatting(
          imageKey,
          processingOptions.matting
        )

        if (!mattingResult.success) {
          results.push({
            imageKey,
            success: false,
            error: mattingResult.error
          })
          continue
        }

        // 2. 多模态大模型分析
        const analysisResult = await multimodalService.analyzeImage(
          mattingResult.data.mattingUrl,
          processingOptions.analysis
        )

        // 3. 提示词工程优化
        const promptResult = await promptEngineeringService.generatePhotographyPrompt(
          analysisResult.data,
          generationRequirements
        )

        // 4. 保存处理结果
        const processResult = await saveIntelligentProcessResult({
          originalKey: imageKey,
          mattingKey: mattingResult.data.mattingKey,
          analysisData: analysisResult.data,
          promptData: promptResult.data,
          requirements: generationRequirements
        })

        results.push({
          imageKey,
          success: true,
          data: {
            matting: mattingResult.data,
            analysis: analysisResult.data,
            prompt: promptResult.data,
            processId: processResult.id
          }
        })

      } catch (error) {
        console.error('图片处理失败:', imageKey, error)
        results.push({
          imageKey,
          success: false,
          error: error.message
        })
      }
    }

    res.json({
      success: true,
      data: results,
      message: '智能图片处理完成'
    })

  } catch (error) {
    console.error('智能图片处理API错误:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * 获取图片分析结果
 */
router.get('/analysis/:imageKey', async (req, res) => {
  try {
    const { imageKey } = req.params

    const analysis = await getImageAnalysis(imageKey)

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: '未找到图片分析结果'
      })
    }

    res.json({
      success: true,
      data: analysis
    })

  } catch (error) {
    console.error('获取图片分析失败:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * 批量分析图片
 */
router.post('/batch-analyze', async (req, res) => {
  try {
    const { imageKeys, analysisOptions = {} } = req.body

    const results = []

    for (const imageKey of imageKeys) {
      try {
        const result = await multimodalService.analyzeImage(imageKey, analysisOptions)
        results.push({
          imageKey,
          success: true,
          data: result.data
        })
      } catch (error) {
        results.push({
          imageKey,
          success: false,
          error: error.message
        })
      }
    }

    res.json({
      success: true,
      data: results
    })

  } catch (error) {
    console.error('批量分析失败:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * 保存智能处理结果
 */
async function saveIntelligentProcessResult(data) {
  const db = require('../config/database')

  const [result] = await db.query(`
    INSERT INTO intelligent_process_results (
      original_key, matting_key, analysis_data, prompt_data,
      requirements, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [
    data.originalKey,
    data.mattingKey,
    JSON.stringify(data.analysisData),
    JSON.stringify(data.promptData),
    JSON.stringify(data.requirements),
    new Date()
  ])

  return { id: result.insertId }
}

/**
 * 获取图片分析结果
 */
async function getImageAnalysis(imageKey) {
  const db = require('../config/database')

  const [rows] = await db.query(`
    SELECT * FROM image_analysis
    WHERE image_url LIKE ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [`%${imageKey}%`])

  return rows.length > 0 ? rows[0] : null
}

module.exports = router
```

### **第五阶段：前端小程序改造（第7周）**

#### **API服务层改造**

**新API服务**：
```javascript
// utils/api-new.js
class NewApiService {
  constructor() {
    this.baseUrl = 'https://your-domain.com/api'
    this.token = wx.getStorageSync('auth_token')
  }

  async request(url, options) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.baseUrl}${url}`,
        method: options.method || 'GET',
        data: options.data,
        header: {
          'Authorization': this.token ? `Bearer ${this.token}` : '',
          ...options.headers
        },
        success: resolve,
        fail: reject
      })
    })
  }

  // 智能图片处理
  async intelligentImageProcess(imageKeys, options) {
    return this.request('/intelligent-image/process', {
      method: 'POST',
      data: { imageKeys, ...options }
    })
  }
}
```

**页面适配**：
- 登录页面适配新认证方式
- 上传页面适配COS直传 + 智能处理
- 作品展示页面适配CI处理
- 进度页面适配新的轮询机制

### **第六阶段：数据迁移和上线（第8周）**

#### **数据迁移脚本**

```javascript
// scripts/migrate-data.js
class DataMigration {
  async migrateUsers() {
    // 从微信云开发导出用户数据
    const wxUsers = await this.exportWxCloudData('users')

    // 批量插入新数据库
    for (const user of wxUsers) {
      await this.insertUser(user)
    }
  }

  async migrateWorks() {
    // 迁移作品数据和图片
    const works = await this.exportWxCloudData('works')

    for (const work of works) {
      // 迁移图片到COS
      await this.migrateImages(work.images)
      // 插入新数据库
      await this.insertWork(work)
    }
  }
}
```

**上线检查清单**：
- [ ] 服务器环境验证
- [ ] 数据库连接测试
- [ ] COS服务配置
- [ ] SCF函数部署
- [ ] API网关配置
- [ ] 域名DNS解析
- [ ] SSL证书配置
- [ ] 监控告警设置

## 💰 成本分析

### **当前架构成本（月活1万用户）**
```
微信云开发：
- 云函数调用：￥300/月
- 云存储：￥200/月
- 数据库：￥150/月
- 其他费用：￥50/月
总计：￥700/月
```

### **目标架构成本**
```
混合云架构：
- 服务器：￥89/月（特惠型）
- SCF调用：￥50/月（仅AI生成）
- COS存储：￥100/月
- CDN流量：￥80/月
- TencentDB：￥120/月
总计：￥439/月
```

**成本节省：37%（￥261/月）**

## 🔧 技术栈配置

### **服务器技术栈**
```
运行时：Node.js 18.x
框架：Express.js
进程管理：PM2
Web服务器：Nginx
数据库：MySQL 8.0
缓存：Redis 6.0
```

### **云服务配置**
```
对象存储：腾讯云COS
图片处理：数据万象CI
计算服务：腾讯云SCF
数据库：腾讯云MySQL
CDN：腾讯云CDN
```

### **开发工具**
```
版本控制：Git
API测试：Postman
监控：PM2 Monitoring
日志：Winston + ELK
部署：Shell脚本
```

## 📊 性能指标

### **目标性能**
```
API响应时间：< 200ms（95%分位）
图片加载时间：< 1s（CDN加速）
并发处理能力：1000+ QPS
系统可用性：99.9%
错误率：< 0.1%
```

### **监控指标**
```
服务器指标：CPU、内存、磁盘、网络
应用指标：响应时间、QPS、错误率
业务指标：用户活跃度、功能使用率
成本指标：资源使用率、费用趋势
```

## 🚨 风险控制

### **技术风险**
- **数据丢失**：完整备份 + 迁移验证
- **服务中断**：灰度发布 + 快速回滚
- **性能下降**：压测验证 + 监控告警
- **安全漏洞**：安全审计 + 渗透测试

### **业务风险**
- **用户流失**：功能无感知迁移
- **成本超支**：用量监控 + 预警机制
- **合规问题**：数据安全 + 隐私保护

## 📈 后续优化

### **三期规划（未来3-6个月）**
- 引入Redis缓存层
- 实现分布式部署
- 增加AI处理能力
- 优化图片压缩算法
- 增加数据分析和报表

### **长期规划（6-12个月）**
- 多地域部署
- 容器化改造
- 微服务架构
- 智能运维
- 成本自动优化

## 📝 实施注意事项

### **开发规范**
- 代码审查制度
- 单元测试覆盖率 > 80%
- API文档完整
- 错误日志规范
- 性能监控埋点

### **部署流程**
- 开发 → 测试 → 预生产 → 生产
- 每个环境独立配置
- 数据库变更脚本化
- 回滚方案准备

### **监控告警**
- 服务器资源监控
- 应用性能监控
- 业务指标监控
- 错误日志告警
- 成本异常告警

---

**文档版本**：v1.0
**创建日期**：2025-10-23
**最后更新**：2025-10-23
**下次审查**：2025-11-23

**注意事项**：
1. 本规划为二期架构升级的指导文档
2. 具体实施时需根据实际情况调整
3. 所有代码示例仅供参考，需结合实际业务逻辑
4. 成本估算基于当前资源价格，实际以腾讯云官方价格为准

**联系方式**：
- 架构设计：老王
- 技术支持：团队技术组
- 项目管理：产品负责人