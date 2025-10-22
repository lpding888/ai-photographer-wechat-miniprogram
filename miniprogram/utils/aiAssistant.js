/**
 * AI助手工具类
 * 提供服装摄影AI辅助功能：姿势生成、Prompt优化、场景推荐
 * 使用微信云开发 AI+ 能力 (wx.cloud.extend.AI)
 */

class AIAssistant {
  constructor() {
    this.model = null
    this.cache = new Map()
    this.cacheExpiry = 30 * 60 * 1000 // 缓存30分钟

    // 系统提示词 - 基于服装摄影专业知识编写
    this.systemPrompts = {
      // 姿势生成器 - 专业服装摄影导演
      poseGenerator: `你是国际顶级服装摄影导演，擅长指导模特摆出专业且自然的拍摄姿势。

**专业知识背景：**
- 掌握时尚摄影的21种经典姿势：站姿（直立、倾斜、弯腰/曲体）、坐姿、动态姿势等
- 熟悉不同拍摄角度：平拍（与模特同高）、俯拍（高角度向下）、仰拍（低角度向上）、45度角
- 理解身体语言：手部位置、视线方向、身体角度、腿部姿态、表情情绪对画面的影响

**输出要求：**
1. 每个姿势描述控制在40字以内，简洁专业
2. 必须包含以下要素：身体姿态 + 手部位置 + 视线方向 + 情绪表达
3. 避免使用"剪刀手"等业余描述，使用专业术语
4. 姿势要符合服装类型和拍摄场景
5. 每次生成5个不同的姿势，每个姿势独立一行，不要编号

**专业术语参考：**
- 身体：自然站立、微微侧转、重心放在一侧、身体呈S形曲线、倾斜15度
- 手部：自然下垂、轻扶腰间、单手插口袋、轻抚头发、托腮、交叉胸前
- 视线：平视镜头、微微低头、眼神望向远方、45度仰视、侧目凝视
- 腿部：双腿并拢、一腿微曲、前后交叉、侧身站立
- 表情：自然微笑、淡然从容、优雅知性、活力阳光、高冷气质`,

      // Prompt优化器 - AI图像生成专家
      promptOptimizer: `你是AI图像生成领域的prompt工程专家，专注于服装摄影类图像生成。

**Prompt结构规范（4要素法）：**
1. **画面主体**：模特 + 服装描述
2. **主体修饰**：姿势、表情、发型等细节
3. **镜头光影**：拍摄角度、光线类型、景深
4. **风格设定**：摄影风格、色调、氛围

**优化规则：**
1. 关键词权重：越靠前权重越高，重要元素前置
2. 关键词数量：控制在50-75个词以内
3. 描述精确：使用具体的摄影术语，避免模糊表达
4. 保持原意：在用户输入基础上扩展，不改变核心意图
5. 格式要求：输出纯文本prompt，不要markdown格式，不要编号

**光线术语：**
- 自然光：柔和自然光、清晨阳光、黄金时刻、散射光
- 人工光：摄影棚灯光、环形灯、侧光、逆光、Rembrandt光
- 氛围：温暖色调、冷色调、高对比度、柔和光影

**构图术语：**
- 角度：平拍、俯拍、仰拍、45度角、低角度
- 景别：全身、半身、特写、膝盖以上
- 景深：浅景深背景虚化、大景深全清晰

**输出格式示例：**
专业女模特穿着商务西装，自然站立姿势，一手自然下垂一手轻扶腰间，身体微微侧转，眼神平视镜头，自信微笑，柔和自然光从侧面打光，现代办公室简约背景，浅景深背景虚化，时尚摄影风格，高清细节

只输出优化后的prompt，不要前缀说明。`,

      // 场景推荐器 - 服装搭配顾问
      sceneRecommender: `你是资深服装搭配顾问和时尚造型师，精通服装风格与拍摄场景的匹配。

**场景库（用户可选的场景）：**
- 商务场景：办公室、会议室、商务酒店大堂
- 休闲场景：咖啡厅、书店、公园、街头
- 时尚场景：T台、摄影棚、艺术画廊
- 自然场景：海滩、森林、花田、湖边
- 都市场景：城市街道、天台、地铁站、商场
- 复古场景：老街、民国风建筑、工业风loft

**分析维度：**
1. **服装类型识别**：正装/休闲/运动/礼服/民族风/潮流
2. **颜色风格**：暖色调/冷色调/中性色/鲜艳色
3. **服装材质**：轻薄/厚重/飘逸/挺括
4. **适合场景**：考虑视觉和谐度、色彩搭配、氛围契合度

**输出要求：**
1. 推荐3个最适合的场景（从场景库中选择）
2. 每个场景说明推荐理由（20字以内）
3. 格式：场景名称 - 推荐理由
4. 按匹配度从高到低排序

**输出格式示例：**
办公室 - 商务西装与现代办公环境完美契合，凸显职业气质
咖啡厅 - 柔和光线衬托服装质感，营造轻松商务氛围
城市街道 - 都市背景增添时尚感，适合展示通勤装扮

只输出推荐结果，不要前缀说明。`
    }
  }

  /**
   * 初始化AI模型
   */
  async init() {
    try {
      if (!this.model) {
        this.model = wx.cloud.extend.AI.createModel("deepseek")
      }
      return true
    } catch (error) {
      console.error('AI模型初始化失败:', error)
      return false
    }
  }

  /**
   * 生成姿势建议
   * @param {String} sceneType - 场景类型（如：办公室、咖啡厅）
   * @param {String} clothingStyle - 服装风格（如：正装、休闲）
   * @param {String} gender - 性别（male/female）
   * @returns {Promise<Array>} 姿势建议数组
   */
  async generatePosePrompts(sceneType, clothingStyle, gender = 'female') {
    const cacheKey = `pose_${sceneType}_${clothingStyle}_${gender}`

    // 检查缓存
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      console.log('[AI助手] 使用缓存的姿势建议')
      return cached
    }

    try {
      await this.init()

      const genderText = gender === 'female' ? '女模特' : '男模特'
      const userPrompt = `场景：${sceneType}，服装风格：${clothingStyle}，模特性别：${genderText}。请生成5个专业的拍摄姿势描述。`

      const res = await this.model.streamText({
        data: {
          model: "deepseek-r1",
          messages: [
            { role: "system", content: this.systemPrompts.poseGenerator },
            { role: "user", content: userPrompt }
          ]
        }
      })

      let result = ''
      for await (let str of res.textStream) {
        result += str
      }

      // 解析结果为数组
      const poses = result
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.length < 100) // 过滤空行和异常长度
        .slice(0, 5) // 最多5个

      // 存入缓存
      this.setCache(cacheKey, poses)

      return poses
    } catch (error) {
      console.error('[AI助手] 生成姿势失败:', error)
      throw new Error('AI生成失败，请稍后重试')
    }
  }

  /**
   * 姿势裂变 - 基于摄影师手札生成新姿势
   * @param {String} photographerNotes - 摄影师手札（第一次生成的完整描述）
   * @param {Number} count - 生成数量（默认9个）
   * @returns {Promise<Array>} 姿势建议数组
   */
  async generatePoseFromPhotographerNotes(photographerNotes, count = 9) {
    try {
      await this.init()

      const userPrompt = `${photographerNotes}

根据这份服装摄影师手札，裂变出${count}个姿势，更好的展示拍摄的服装。

每个姿势单独一行，直接描述姿势即可，不要编号前缀。`

      const res = await this.model.streamText({
        data: {
          model: "deepseek-r1",
          messages: [
            { role: "user", content: userPrompt }
          ]
        }
      })

      let result = ''
      for await (let str of res.textStream) {
        result += str
      }

      console.log('[AI助手] AI返回的原始结果:', result)

      // 智能提取姿势描述
      const poses = this.extractPosesFromText(result, count)

      console.log(`[AI助手] 成功提取${poses.length}个姿势建议`)
      return poses
    } catch (error) {
      console.error('[AI助手] 生成姿势失败:', error)
      throw new Error('AI生成失败，请稍后重试')
    }
  }

  /**
   * 智能提取姿势描述文本
   * 支持多种格式：纯文本、编号、符号等
   * @param {String} text - AI返回的原始文本
   * @param {Number} count - 需要的姿势数量
   * @returns {Array} 姿势描述数组
   */
  extractPosesFromText(text, count = 9) {
    const poses = []

    // 方案1: 尝试按双换行分割（段落）
    let paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0)
    if (paragraphs.length >= count) {
      console.log('[AI助手] 使用段落分割方案')
      return paragraphs.slice(0, count)
    }

    // 方案2: 尝试识别编号格式（1. 2. 或 1、2、或 姿势1:）
    const numberedRegex = /(?:^|\n)\s*(?:[\d一二三四五六七八九十]+[.、:：）)\]]\s*|姿势[\d一二三四五六七八九十]+[:：]\s*)(.+?)(?=(?:\n\s*(?:[\d一二三四五六七八九十]+[.、:：）)\]]|姿势[\d一二三四五六七八九十]+[:：]))|$)/gs
    let match
    while ((match = numberedRegex.exec(text)) !== null) {
      const poseText = match[1].trim()
      if (poseText.length > 5 && poseText.length < 500) {
        poses.push(poseText)
      }
    }
    if (poses.length >= count) {
      console.log('[AI助手] 使用编号识别方案')
      return poses.slice(0, count)
    }

    // 方案3: 按单换行分割
    const lines = text
      .split('\n')
      .map(line => {
        // 清理各种前缀：数字、符号、空格等
        return line
          .replace(/^\s*[\d一二三四五六七八九十]+[.、:：）)\]]\s*/, '') // 数字编号
          .replace(/^\s*[•\-\*·]\s*/, '') // 符号
          .replace(/^姿势[\d一二三四五六七八九十]+[:：]\s*/, '') // "姿势1:"
          .trim()
      })
      .filter(line => {
        // 过滤无效行
        if (line.length < 5) return false // 太短
        if (line.length > 500) return false // 太长
        if (/^[^\u4e00-\u9fa5a-zA-Z]+$/.test(line)) return false // 只有符号
        return true
      })

    if (lines.length > 0) {
      console.log('[AI助手] 使用行分割方案')
      return lines.slice(0, count)
    }

    // 方案4: 兜底 - 按句号分割
    const sentences = text
      .split(/[。！？\n]/)
      .map(s => s.trim())
      .filter(s => s.length >= 10 && s.length < 500)

    console.log('[AI助手] 使用句子分割兜底方案')
    return sentences.slice(0, count)
  }

  /**
   * 姿势裂变 - 基于一个姿势生成变体（已弃用，保留兼容）
   * @deprecated 请使用 generatePoseFromPhotographerNotes
   */
  async generatePoseVariations(basePose, count = 5) {
    console.warn('[AI助手] generatePoseVariations 已弃用，请使用 generatePoseFromPhotographerNotes')
    return this.generatePoseFromPhotographerNotes(basePose, count)
  }

  /**
   * 优化用户输入的Prompt
   * @param {String} userInput - 用户输入的简单描述
   * @param {String} sceneInfo - 场景信息
   * @param {Object} parameters - 模特参数（性别、年龄等）
   * @returns {Promise<String>} 优化后的Prompt
   */
  async optimizeUserPrompt(userInput, sceneInfo = '', parameters = {}) {
    const cacheKey = `prompt_${userInput}_${sceneInfo}_${parameters.gender || 'female'}`

    const cached = this.getFromCache(cacheKey)
    if (cached) {
      console.log('[AI助手] 使用缓存的Prompt优化结果')
      return cached
    }

    try {
      await this.init()

      const gender = parameters.gender === 'male' ? '男模特' : '女模特'
      const age = parameters.age || 25
      const nationality = this.getNationalityText(parameters.nationality)

      const contextInfo = `
场景：${sceneInfo}
模特：${nationality}${gender}，约${age}岁
用户输入：${userInput}

请将用户的简单描述扩展为专业的AI图像生成prompt。`

      const res = await this.model.streamText({
        data: {
          model: "deepseek-r1",
          messages: [
            { role: "system", content: this.systemPrompts.promptOptimizer },
            { role: "user", content: contextInfo }
          ]
        }
      })

      let result = ''
      for await (let str of res.textStream) {
        result += str
      }

      // 清理结果（去除可能的markdown格式）
      const optimized = result
        .replace(/```/g, '')
        .replace(/\*\*/g, '')
        .replace(/^\d+\.\s*/gm, '')
        .trim()

      this.setCache(cacheKey, optimized)

      return optimized
    } catch (error) {
      console.error('[AI助手] 优化Prompt失败:', error)
      throw new Error('AI优化失败，请稍后重试')
    }
  }

  /**
   * 推荐适合的场景
   * @param {String} clothingDesc - 服装描述
   * @param {String} clothingType - 服装类型（可选）
   * @returns {Promise<Array>} 场景推荐数组
   */
  async recommendScenes(clothingDesc, clothingType = '') {
    const cacheKey = `scene_${clothingDesc}_${clothingType}`

    const cached = this.getFromCache(cacheKey)
    if (cached) {
      console.log('[AI助手] 使用缓存的场景推荐')
      return cached
    }

    try {
      await this.init()

      const userPrompt = clothingType
        ? `服装描述：${clothingDesc}，服装类型：${clothingType}。请从场景库中推荐3个最适合的拍摄场景。`
        : `服装描述：${clothingDesc}。请从场景库中推荐3个最适合的拍摄场景。`

      const res = await this.model.streamText({
        data: {
          model: "deepseek-r1",
          messages: [
            { role: "system", content: this.systemPrompts.sceneRecommender },
            { role: "user", content: userPrompt }
          ]
        }
      })

      let result = ''
      for await (let str of res.textStream) {
        result += str
      }

      // 解析结果为数组
      const scenes = result
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.includes('-') || line.includes('：'))
        .slice(0, 3)

      this.setCache(cacheKey, scenes)

      return scenes
    } catch (error) {
      console.error('[AI助手] 推荐场景失败:', error)
      throw new Error('AI推荐失败，请稍后重试')
    }
  }

  /**
   * 从缓存获取数据
   */
  getFromCache(key) {
    const item = this.cache.get(key)
    if (!item) return null

    // 检查是否过期
    if (Date.now() - item.timestamp > this.cacheExpiry) {
      this.cache.delete(key)
      return null
    }

    return item.data
  }

  /**
   * 设置缓存
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  /**
   * 清除所有缓存
   */
  clearCache() {
    this.cache.clear()
  }

  /**
   * 获取国籍文本
   */
  getNationalityText(nationality) {
    const map = {
      'asian': '亚洲',
      'european': '欧洲',
      'african': '非洲',
      'american': '美洲',
      'mixed': '混血'
    }
    return map[nationality] || '亚洲'
  }
}

// 导出单例
const aiAssistant = new AIAssistant()
module.exports = aiAssistant
