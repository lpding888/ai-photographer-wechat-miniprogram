/**
 * AI造型师工具
 */

/**
 * 获取AI造型师建议
 * @param {string} eventType - 事件类型
 * @param {string} weather - 天气
 * @param {Array} wardrobeItems - 衣柜衣物列表
 * @returns {Promise<object>} - AI建议结果
 */
async function getStylistSuggestion(eventType, weather, wardrobeItems) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'ai-stylist',
      data: {
        eventType,
        weather,
        wardrobeItems
      }
    })

    if (res.result && res.result.success) {
      return {
        success: true,
        suggestion: res.result.suggestion
      }
    } else {
      throw new Error(res.result.message || 'AI建议生成失败')
    }
  } catch (error) {
    console.error('调用AI造型师失败:', error)
    return {
      success: false,
      error: error.message || 'AI服务异常'
    }
  }
}

/**
 * 模拟AI建议（用于开发测试）
 */
async function mockStylistSuggestion(eventType, weather, wardrobeItems) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 简单的模拟逻辑
      const eventNames = {
        work: '工作',
        meeting: '会议',
        date: '约会',
        party: '聚会',
        travel: '旅行',
        sport: '运动',
        casual: '休闲',
        other: '日常'
      }

      const weatherNames = {
        sunny: '晴天☀️',
        cloudy: '多云☁️',
        rainy: '雨天🌧️',
        snowy: '雪天❄️',
        hot: '炎热🔥',
        cold: '寒冷🧊'
      }

      const eventName = eventNames[eventType] || '这个场合'
      const weatherName = weatherNames[weather] || '当前天气'
      const items = wardrobeItems.slice(0, Math.min(3, wardrobeItems.length))

      let advice = `为${eventName}精心准备：\n\n`
      advice += `🎨 **风格建议**\n${eventNames[eventType] || '日常'}风格最适合当前场合。\n\n`
      advice += `☁️ **天气提示**\n考虑到${weatherName}，建议选择舒适得体的装扮。\n\n`

      if (items.length > 0) {
        advice += `👗 **搭配方案**\n为您从衣柜中精选了 ${items.length} 件单品：\n`
        items.forEach((item, index) => {
          advice += `${index + 1}. ${item.name}\n`
        })
        advice += `\n💡 **造型师点评**\n`
        advice += `• 这套搭配适合当前场合\n`
        advice += `• 颜色搭配和谐\n`
        advice += `• 舒适度和风格兼顾\n`
      }

      advice += `\n✨ 相信您一定能展现最好的状态！`

      const suggestion = {
        eventType,
        weather,
        style: `${eventNames[eventType] || '日常'}风格`,
        advice: advice,
        recommendedItems: items,
        reasons: [
          '这套搭配适合当前场合',
          '颜色搭配和谐',
          '舒适度和风格兼顾'
        ]
      }

      resolve({
        success: true,
        suggestion: suggestion
      })
    }, 1500) // 模拟网络延迟
  })
}

module.exports = {
  getStylistSuggestion,
  mockStylistSuggestion
}
