import { PrismaClient, SceneCategory, SceneType } from '@prisma/client'

const prisma = new PrismaClient()

export async function seedScenes() {
  console.log('🎬 开始创建AI生图场景配置...')

  const scenes = [
    // 城市场景
    {
      name: '都市街拍',
      description: '现代城市街道，展现都市时尚感',
      category: SceneCategory.URBAN,
      type: SceneType.PHOTOGRAPHY,
      promptTemplate: `【场景】现代都市街道，背景有高楼大厦、咖啡馆、街边店铺
【光线】自然日光，柔和的城市光线
【氛围】时尚、现代、都市感
【构图】全身构图，展现人物与环境的和谐
【风格】写实摄影，高清细节`,
      negativePrompt: '模糊, 低质量, 扭曲, 失真, 暗光',
      previewImage: 'https://example.com/previews/urban-street.jpg',
      thumbnailImage: 'https://example.com/thumbnails/urban-street.jpg',
      styleTags: ['时尚', '都市', '现代', '街拍'],
      defaultParams: {
        temperature: 0.7,
        top_p: 0.9,
        guidance_scale: 7.5
      },
      supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
      maxGenerateCount: 6,
      creditsPerImage: 15,
      baseCredits: 25,
      sortOrder: 10
    },
    {
      name: '上海外滩',
      description: '上海外滩夜景，展现国际大都市魅力',
      category: SceneCategory.URBAN,
      type: SceneType.PHOTOGRAPHY,
      promptTemplate: `【场景】上海外滩，黄浦江畔，天际线背景
【光线】夜晚城市灯光，霓虹灯效果
【氛围】浪漫、现代、国际化
【构图】全身构图，背景有东方明珠等标志性建筑
【风格】夜景摄影，灯光效果`,
      negativePrompt: '白天, 晴天, 简单背景, 低质量',
      previewImage: 'https://example.com/previews/shanghai-bund.jpg',
      thumbnailImage: 'https://example.com/thumbnails/shanghai-bund.jpg',
      styleTags: ['夜景', '浪漫', '国际', '地标'],
      defaultParams: {
        temperature: 0.6,
        top_p: 0.9,
        guidance_scale: 8.0
      },
      supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
      maxGenerateCount: 4,
      creditsPerImage: 20,
      baseCredits: 30,
      sortOrder: 9,
      isPremium: true
    },

    // 自然场景
    {
      name: '樱花公园',
      description: '春日樱花盛开的公园，营造浪漫氛围',
      category: SceneCategory.NATURE,
      type: SceneType.PHOTOGRAPHY,
      promptTemplate: `【场景】春季公园，满树樱花盛开
【光线】柔和的春日阳光，透过花瓣的光影
【氛围】浪漫、清新、自然
【构图】全身构图，樱花作为背景和前景
【风格】自然摄影，色彩鲜艳`,
      negativePrompt: '冬季, 秋天, 室内, 人工背景',
      previewImage: 'https://example.com/previews/cherry-blossom.jpg',
      thumbnailImage: 'https://example.com/thumbnails/cherry-blossom.jpg',
      styleTags: ['春天', '樱花', '浪漫', '自然'],
      defaultParams: {
        temperature: 0.8,
        top_p: 0.95,
        guidance_scale: 7.0
      },
      supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
      maxGenerateCount: 6,
      creditsPerImage: 12,
      baseCredits: 20,
      sortOrder: 8
    },
    {
      name: '海边日落',
      description: '夕阳西下的海滩，金色阳光洒在身上',
      category: SceneCategory.NATURE,
      type: SceneType.PHOTOGRAPHY,
      promptTemplate: `【场景】海边沙滩，夕阳西下
【光线】金色日落阳光，温暖的光线
【氛围】浪漫、宁静、温暖
【构图】全身构图，海平面和夕阳作为背景
【风格】日落摄影，暖色调`,
      negativePrompt: '白天, 阴天, 室内, 冷色调',
      previewImage: 'https://example.com/previews/sunset-beach.jpg',
      thumbnailImage: 'https://example.com/thumbnails/sunset-beach.jpg',
      styleTags: ['日落', '海滩', '浪漫', '温暖'],
      defaultParams: {
        temperature: 0.7,
        top_p: 0.9,
        guidance_scale: 7.5
      },
      supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
      maxGenerateCount: 4,
      creditsPerImage: 15,
      baseCredits: 25,
      sortOrder: 7
    },

    // 室内场景
    {
      name: '咖啡厅',
      description: '温馨的咖啡厅，展现休闲生活气息',
      category: SceneCategory.INDOOR,
      type: SceneType.PHOTOGRAPHY,
      promptTemplate: `【场景】现代咖啡厅，有咖啡机、书架、装饰品
【光线】温暖的室内灯光，自然光从窗户透入
【氛围】温馨、休闲、文艺
【构图】半身或全身构图，咖啡厅环境背景
【风格】室内摄影，生活化场景`,
      negativePrompt: '户外, 空旷, 简单背景, 商业感',
      previewImage: 'https://example.com/previews/coffee-shop.jpg',
      thumbnailImage: 'https://example.com/thumbnails/coffee-shop.jpg',
      styleTags: ['室内', '温馨', '文艺', '休闲'],
      defaultParams: {
        temperature: 0.6,
        top_p: 0.9,
        guidance_scale: 7.0
      },
      supportedSizes: ['1024x1024', '1024x1536'],
      maxGenerateCount: 4,
      creditsPerImage: 10,
      baseCredits: 15,
      sortOrder: 6
    },
    {
      name: '书店角落',
      description: '安静的书店角落，充满文艺气息',
      category: SceneCategory.INDOOR,
      type: SceneType.PHOTOGRAPHY,
      promptTemplate: `【场景】书店内部，书架林立，有阅读角
【光线】温暖的室内灯光，营造安静氛围
【氛围】文艺、安静、知性
【构图】半身构图，书籍作为背景元素
【风格】室内摄影，文艺氛围`,
      negativePrompt: '户外, 嘈杂, 现代, 商业化',
      previewImage: 'https://example.com/previews/bookstore.jpg',
      thumbnailImage: 'https://example.com/thumbnails/bookstore.jpg',
      styleTags: ['室内', '文艺', '安静', '知性'],
      defaultParams: {
        temperature: 0.5,
        top_p: 0.85,
        guidance_scale: 7.0
      },
      supportedSizes: ['1024x1024', '1024x1536'],
      maxGenerateCount: 4,
      creditsPerImage: 10,
      baseCredits: 15,
      sortOrder: 5
    },

    // 生活场景
    {
      name: '居家休闲',
      description: '舒适的居家环境，展现日常生活状态',
      category: SceneCategory.LIFESTYLE,
      type: SceneType.LIFESTYLE,
      promptTemplate: `【场景】现代客厅，有沙发、茶几、装饰品
【光线】自然室内光线，舒适明亮
【氛围】舒适、自然、生活化
【构图】半身构图，居家环境背景
【风格】生活摄影，自然放松`,
      negativePrompt: '正式, 商业, 户外, 拘谨',
      previewImage: 'https://example.com/previews/living-room.jpg',
      thumbnailImage: 'https://example.com/thumbnails/living-room.jpg',
      styleTags: ['居家', '舒适', '生活', '自然'],
      defaultParams: {
        temperature: 0.6,
        top_p: 0.9,
        guidance_scale: 6.5
      },
      supportedSizes: ['1024x1024', '1024x1536'],
      maxGenerateCount: 4,
      creditsPerImage: 8,
      baseCredits: 12,
      sortOrder: 4
    },

    // 商业场景
    {
      name: '简约商务',
      description: '现代商务环境，展现专业形象',
      category: SceneCategory.COMMERCIAL,
      type: SceneType.PHOTOGRAPHY,
      promptTemplate: `【场景】现代商务空间，简约办公环境
【光线】专业的照明光线，明亮均匀
【氛围】专业、自信、现代
【构图】半身构图，商务环境背景
【风格】商业摄影，专业形象`,
      negativePrompt: '随意, 休闲, 杂乱, 不专业',
      previewImage: 'https://example.com/previews/business.jpg',
      thumbnailImage: 'https://example.com/thumbnails/business.jpg',
      styleTags: ['商务', '专业', '现代', '简约'],
      defaultParams: {
        temperature: 0.4,
        top_p: 0.8,
        guidance_scale: 7.0
      },
      supportedSizes: ['1024x1024', '1024x1536'],
      maxGenerateCount: 4,
      creditsPerImage: 12,
      baseCredits: 20,
      sortOrder: 3
    },

    // 艺术场景
    {
      name: '艺术画廊',
      description: '现代艺术画廊，充满艺术氛围',
      category: SceneCategory.ARTISTIC,
      type: SceneType.PHOTOGRAPHY,
      promptTemplate: `【场景】艺术画廊，有画作、雕塑等艺术品
【光线】专业的画廊照明，突出艺术氛围
【氛围】艺术、高雅、文化
【构图】全身构图，艺术作品作为背景
【风格】艺术摄影，高雅氛围`,
      negativePrompt: '普通, 日常, 嘈杂, 低俗',
      previewImage: 'https://example.com/previews/art-gallery.jpg',
      thumbnailImage: 'https://example.com/thumbnails/art-gallery.jpg',
      styleTags: ['艺术', '高雅', '文化', '画廊'],
      defaultParams: {
        temperature: 0.7,
        top_p: 0.9,
        guidance_scale: 8.0
      },
      supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
      maxGenerateCount: 4,
      creditsPerImage: 18,
      baseCredits: 28,
      sortOrder: 2,
      isPremium: true
    },

    // 季节场景
    {
      name: '秋日森林',
      description: '秋季森林，金黄色的落叶氛围',
      category: SceneCategory.SEASONAL,
      type: SceneType.PHOTOGRAPHY,
      promptTemplate: `【场景】秋季森林，满地金黄色落叶
【光线】秋季柔和的阳光，透过树叶的光影
【氛围】浪漫、温暖、季节感
【构图】全身构图，森林和落叶作为背景
【风格】自然摄影，秋季色彩`,
      negativePrompt: '春季, 夏季, 绿色, 室内',
      previewImage: 'https://example.com/previews/autumn-forest.jpg',
      thumbnailImage: 'https://example.com/thumbnails/autumn-forest.jpg',
      styleTags: ['秋季', '森林', '浪漫', '自然'],
      defaultParams: {
        temperature: 0.8,
        top_p: 0.95,
        guidance_scale: 7.5
      },
      supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
      maxGenerateCount: 6,
      creditsPerImage: 15,
      baseCredits: 25,
      sortOrder: 1
    }
  ]

  try {
    // 清除现有场景数据
    await prisma.scene.deleteMany()
    console.log('已清除现有场景数据')

    // 创建新场景
    for (const sceneData of scenes) {
      const scene = await prisma.scene.create({
        data: sceneData
      })
      console.log(`✅ 创建场景: ${scene.name}`)
    }

    console.log(`🎉 成功创建 ${scenes.length} 个AI生图场景`)

    // 统计信息
    const totalScenes = await prisma.scene.count()
    const freeScenes = await prisma.scene.count({ where: { isPremium: false } })
    const premiumScenes = await prisma.scene.count({ where: { isPremium: true } })

    console.log(`📊 场景统计: 总计 ${totalScenes} 个，免费 ${freeScenes} 个，高级 ${premiumScenes} 个`)

  } catch (error) {
    console.error('❌ 创建场景失败:', error)
    throw error
  }
}

// 如果直接运行此文件
if (require.main === module) {
  seedScenes()
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}