// AI造型师云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { eventType, weather, wardrobeItems } = event

  try {
    // TODO: 集成实际的AI模型API（如OpenAI、通义千问等）
    // 这里使用模拟逻辑生成建议

    // 根据事件类型和天气生成建议
    const suggestion = generateStylistSuggestion(eventType, weather, wardrobeItems)

    return {
      success: true,
      suggestion: suggestion
    }
  } catch (error) {
    console.error('AI造型师生成建议失败:', error)
    return {
      success: false,
      message: error.message || 'AI建议生成失败'
    }
  }
}

/**
 * 生成造型建议（模拟AI逻辑）
 */
function generateStylistSuggestion(eventType, weather, wardrobeItems) {
  // 事件类型映射
  const eventStyles = {
    work: { style: '专业商务', colors: ['黑色', '深蓝', '灰色', '白色'], keywords: ['正式', '职业', '干练'] },
    meeting: { style: '正式得体', colors: ['黑色', '深蓝', '灰色'], keywords: ['正式', '专业', '精致'] },
    date: { style: '浪漫优雅', colors: ['粉色', '白色', '浅蓝'], keywords: ['优雅', '浪漫', '时尚'] },
    party: { style: '时尚亮眼', colors: ['红色', '金色', '亮色'], keywords: ['时尚', '亮眼', '个性'] },
    travel: { style: '休闲舒适', colors: ['蓝色', '白色', '卡其'], keywords: ['休闲', '舒适', '实用'] },
    sport: { style: '运动活力', colors: ['黑色', '白色', '荧光色'], keywords: ['运动', '舒适', '透气'] },
    casual: { style: '轻松休闲', colors: ['任意'], keywords: ['休闲', '舒适', '百搭'] },
    other: { style: '随心搭配', colors: ['任意'], keywords: ['舒适', '自然'] }
  }

  // 天气建议
  const weatherAdvice = {
    sunny: { suggestion: '阳光明媚，适合轻薄透气的衣物', items: ['短袖', '短裙', '短裤', '凉鞋'] },
    cloudy: { suggestion: '多云天气，建议搭配薄外套', items: ['长袖', '薄外套', '长裤'] },
    rainy: { suggestion: '下雨天，注意防水防滑', items: ['防水外套', '长裤', '防水鞋'] },
    snowy: { suggestion: '下雪天气，注意保暖', items: ['羽绒服', '毛衣', '厚裤', '靴子'] },
    hot: { suggestion: '炎热天气，选择凉爽透气的衣物', items: ['短袖', '短裙', '短裤', '凉鞋', '防晒'] },
    cold: { suggestion: '寒冷天气，做好保暖措施', items: ['厚外套', '毛衣', '厚裤', '靴子', '围巾'] }
  }

  const eventInfo = eventStyles[eventType] || eventStyles.other
  const weatherInfo = weatherAdvice[weather] || { suggestion: '根据实际天气选择合适衣物', items: [] }

  // 分析衣柜中的衣物
  const tops = wardrobeItems.filter(item => item.category === 'top')
  const bottoms = wardrobeItems.filter(item => item.category === 'bottom')
  const dresses = wardrobeItems.filter(item => item.category === 'dress')
  const shoes = wardrobeItems.filter(item => item.category === 'shoes')
  const accessories = wardrobeItems.filter(item => item.category === 'accessory')

  // 智能匹配衣物
  const matchedItems = smartMatch(eventInfo, weatherInfo, {
    tops,
    bottoms,
    dresses,
    shoes,
    accessories
  })

  // 生成建议文案
  const advice = generateAdviceText(eventType, weather, eventInfo, weatherInfo, matchedItems)

  return {
    eventType,
    weather,
    style: eventInfo.style,
    advice: advice,
    recommendedItems: matchedItems.items,
    reasons: matchedItems.reasons
  }
}

/**
 * 智能匹配衣物
 */
function smartMatch(eventInfo, weatherInfo, wardrobe) {
  const matched = {
    items: [],
    reasons: []
  }

  // 优先选择有相关标签的衣物
  const relevantTags = [...eventInfo.keywords, ...weatherInfo.items]

  // 匹配上装或连衣裙
  if (wardrobe.dresses.length > 0 && Math.random() > 0.5) {
    // 选择连衣裙
    const dress = findBestMatch(wardrobe.dresses, relevantTags)
    if (dress) {
      matched.items.push(dress)
      matched.reasons.push(`${dress.name}适合${eventInfo.style}风格`)
    }
  } else {
    // 选择上装+下装
    const top = findBestMatch(wardrobe.tops, relevantTags)
    const bottom = findBestMatch(wardrobe.bottoms, relevantTags)

    if (top) {
      matched.items.push(top)
      matched.reasons.push(`${top.name}是不错的上装选择`)
    }
    if (bottom) {
      matched.items.push(bottom)
      matched.reasons.push(`${bottom.name}可以很好地搭配`)
    }
  }

  // 选择鞋子
  const shoe = findBestMatch(wardrobe.shoes, relevantTags)
  if (shoe) {
    matched.items.push(shoe)
    matched.reasons.push(`${shoe.name}完美搭配整体造型`)
  }

  // 选择配饰（可选）
  if (wardrobe.accessories.length > 0 && Math.random() > 0.6) {
    const accessory = findBestMatch(wardrobe.accessories, relevantTags)
    if (accessory) {
      matched.items.push(accessory)
      matched.reasons.push(`${accessory.name}能为造型增添亮点`)
    }
  }

  return matched
}

/**
 * 查找最佳匹配的衣物
 */
function findBestMatch(items, tags) {
  if (items.length === 0) return null

  // 计算每件衣物的匹配分数
  const scored = items.map(item => {
    let score = 0

    // 标签匹配
    if (item.tags) {
      item.tags.forEach(tag => {
        if (tags.some(t => tag.toLowerCase().includes(t.toLowerCase()))) {
          score += 2
        }
      })
    }

    // 常穿加分
    if (item.isFavorite) {
      score += 1
    }

    // 使用次数少的优先（增加衣物利用率）
    score += (10 - (item.useCount || 0)) * 0.1

    return { item, score }
  })

  // 按分数排序，选择最高分
  scored.sort((a, b) => b.score - a.score)
  return scored[0].item
}

/**
 * 生成建议文案
 */
function generateAdviceText(eventType, weather, eventInfo, weatherInfo, matchedItems) {
  const eventNames = {
    work: '工作日',
    meeting: '重要会议',
    date: '约会',
    party: '聚会',
    travel: '旅行',
    sport: '运动',
    casual: '休闲时光',
    other: '这个场合'
  }

  const eventName = eventNames[eventType] || '这个场合'
  let advice = `为${eventName}精心准备：\n\n`

  advice += `🎨 **风格建议**\n${eventInfo.style}风格最适合当前场合。`
  advice += `推荐色系：${eventInfo.colors.join('、')}。\n\n`

  advice += `☁️ **天气提示**\n${weatherInfo.suggestion}\n\n`

  if (matchedItems.items.length > 0) {
    advice += `👗 **搭配方案**\n`
    advice += `为您从衣柜中精选了 ${matchedItems.items.length} 件单品：\n`
    matchedItems.items.forEach((item, index) => {
      advice += `${index + 1}. ${item.name}\n`
    })

    advice += `\n💡 **造型师点评**\n`
    matchedItems.reasons.forEach((reason, index) => {
      advice += `• ${reason}\n`
    })
  } else {
    advice += `📦 **温馨提示**\n您的衣柜中暂时没有特别匹配的衣物，建议添加一些${eventInfo.style}风格的单品。`
  }

  advice += `\n✨ 相信您一定能展现最好的状态！`

  return advice
}
