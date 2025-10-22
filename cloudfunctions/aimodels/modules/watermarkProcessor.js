/**
 * 水印处理模块
 * 负责：水印生成、位置计算、图片合成
 */

const Jimp = require('jimp')

class WatermarkProcessor {
  constructor() {
    this.defaultOptions = {
      text: 'AI Generated',
      fontSize: 32, // 使用32px确保有合适的字体
      fillColor: 0x000000FF, // 黑色文字，更容易看见
      position: 'bottom-right',
      padding: 20,
      quality: 85, // 降低质量以提升性能（从95降到85）
      opacity: 0.8 // 添加透明度
    }
  }

  /**
   * 为图片添加AI水印
   * @param {Buffer} imageBuffer - 原始图片buffer
   * @param {Object} options - 水印选项
   * @returns {Buffer} 带水印的图片buffer
   */
  async addWatermark(imageBuffer, options = {}) {
    try {
      console.log('🎨 开始添加AI水印...')

      // 合并选项
      const config = { ...this.defaultOptions, ...options }

      console.log('📷 加载原始图片...')
      const image = await Jimp.read(imageBuffer)
      const { width, height } = { width: image.getWidth(), height: image.getHeight() }

      console.log(`📐 图片尺寸: ${width}x${height}`)

      // 计算水印位置
      const position = this.calculateWatermarkPosition(width, height, config)

      // 简化水印样式（性能优化）
      // 使用简单的白色文字水印，不使用复杂描边效果
      // 注意：前端已经有imageMogr2水印，云函数水印主要用于直接下载的场景
      const font = await this.loadFont(config.fontSize)
      image.print(font, position.x, position.y, config.text)

      // 转换为buffer
      const watermarkedBuffer = await image.quality(config.quality).getBufferAsync(Jimp.MIME_JPEG)

      console.log(`✅ 水印添加成功: ${config.text}, 位置: ${config.position}(${position.x}, ${position.y})`)
      console.log(`📊 处理结果: 原图 ${Math.round(imageBuffer.length/1024)}KB → 水印图 ${Math.round(watermarkedBuffer.length/1024)}KB`)

      return watermarkedBuffer

    } catch (error) {
      console.error('❌ 水印添加失败:', error.message)
      throw new Error(`水印处理失败: ${error.message}`)
    }
  }

  /**
   * 批量添加水印
   * @param {Array} images - 图片数组
   * @param {Object} options - 水印选项
   * @returns {Array} 处理结果
   */
  async addWatermarkBatch(images, options = {}) {
    console.log(`🎨 开始批量添加水印，共 ${images.length} 张图片`)

    const results = []

    for (let i = 0; i < images.length; i++) {
      const imageData = images[i]
      console.log(`🎯 处理第 ${i + 1}/${images.length} 张图片`)

      try {
        let imageBuffer

        // 处理不同格式的输入
        if (Buffer.isBuffer(imageData)) {
          imageBuffer = imageData
        } else if (imageData.buffer) {
          imageBuffer = imageData.buffer
        } else if (imageData.base64) {
          imageBuffer = Buffer.from(imageData.base64, 'base64')
        } else if (imageData.url && imageData.url.startsWith('data:image/')) {
          // 处理base64 data URL
          const base64Data = imageData.url.split(',')[1]
          imageBuffer = Buffer.from(base64Data, 'base64')
        } else {
          throw new Error('无效的图片数据格式')
        }

        // 添加水印
        const watermarkedBuffer = await this.addWatermark(imageBuffer, options)

        results.push({
          success: true,
          index: i,
          buffer: watermarkedBuffer,
          originalSize: imageBuffer.length,
          watermarkedSize: watermarkedBuffer.length,
          metadata: {
            watermark_applied: true,
            watermark_text: options.text || this.defaultOptions.text,
            watermark_position: options.position || this.defaultOptions.position,
            processed_at: new Date()
          }
        })

        console.log(`✅ 第 ${i + 1} 张图片水印处理成功`)

      } catch (error) {
        console.error(`❌ 第 ${i + 1} 张图片水印处理失败:`, error.message)

        results.push({
          success: false,
          index: i,
          error: error.message,
          fallbackBuffer: imageBuffer, // 提供原图作为降级
          metadata: {
            watermark_applied: false,
            watermark_error: error.message,
            fallback_used: true,
            processed_at: new Date()
          }
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`📊 批量水印处理完成: 总数 ${images.length}, 成功 ${successCount}, 失败 ${images.length - successCount}`)

    return results
  }

  /**
   * 计算水印位置
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {Object} config - 配置选项
   * @returns {Object} 位置坐标
   */
  calculateWatermarkPosition(width, height, config) {
    const { position, padding } = config
    const textWidth = config.text.length * config.fontSize * 0.6 // 估算文字宽度
    const textHeight = config.fontSize

    switch (position) {
      case 'top-left':
        return { x: padding, y: padding }

      case 'top-right':
        return { x: width - textWidth - padding, y: padding }

      case 'bottom-left':
        return { x: padding, y: height - textHeight - padding }

      case 'bottom-right':
      default:
        return { x: width - textWidth, y: height - textHeight - padding }

      case 'center':
        return { x: (width - textWidth) / 2, y: (height - textHeight) / 2 }

      case 'top-center':
        return { x: (width - textWidth) / 2, y: padding }

      case 'bottom-center':
        return { x: (width - textWidth) / 2, y: height - textHeight - padding }
    }
  }


  /**
   * 添加毛玻璃透明质感水印
   * @param {Object} image - Jimp图片对象
   * @param {Object} position - 位置坐标
   * @param {Object} config - 配置选项
   */
  async addFrostedGlassWatermark(image, position, config) {
    try {
      console.log('🔮 创建毛玻璃透明质感水印...')

      // 计算文字区域大小
      const textWidth = config.text.length * (config.fontSize * 0.6)
      const textHeight = config.fontSize + 20 // 文字高度加一些padding

      // 创建半透明背景区域
      const bgPadding = 15
      const bgX = position.x - bgPadding
      const bgY = position.y - bgPadding
      const bgWidth = textWidth + (bgPadding * 2)
      const bgHeight = textHeight + (bgPadding * 2)

      // 1. 创建毛玻璃背景效果
      // 提取背景区域并模糊
      const backgroundRegion = image.clone()
        .crop(Math.max(0, bgX), Math.max(0, bgY),
              Math.min(bgWidth, image.getWidth() - bgX),
              Math.min(bgHeight, image.getHeight() - bgY))
        .blur(8) // 高斯模糊创建毛玻璃效果
        .opacity(0.3) // 更高透明度

      // 2. 创建更透明的白色遮罩
      const overlay = new Jimp(bgWidth, bgHeight, 0xFFFFFF30) // 更透明的白色

      // 3. 合成毛玻璃背景（降低不透明度）
      backgroundRegion.composite(overlay, 0, 0, {
        mode: Jimp.BLEND_OVERLAY,
        opacitySource: 0.3
      })

      // 4. 将毛玻璃背景贴回原图（大幅降低不透明度）
      image.composite(backgroundRegion, bgX, bgY, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 0.4
      })

      // 5. 添加文字（黑色，半透明）
      const font = await this.loadFont(config.fontSize)

      // 创建透明文字图层
      const textImage = new Jimp(bgWidth, bgHeight, 0x00000000) // 透明背景

      // 添加半透明灰色文字
      textImage.print(await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK),
                     bgPadding, bgPadding, config.text)

      // 将文字以很低的透明度叠加
      image.composite(textImage, bgX, bgY, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 0.4 // 文字透明度降到40%
      })

      console.log('✨ 毛玻璃水印效果添加完成')

    } catch (error) {
      console.error('❌ 毛玻璃水印创建失败:', error.message)
      // 降级到普通水印
      const font = await this.loadFont(config.fontSize)
      image.print(font, position.x, position.y, config.text)
    }
  }

  /**
   * 加载字体
   * @param {number} fontSize - 字体大小
   * @returns {Object} Jimp字体对象
   */
  async loadFont(fontSize) {
    try {
      // 根据字体大小选择合适的内置字体
      if (fontSize >= 64) {
        return await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE)
      } else if (fontSize >= 32) {
        return await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE)
      } else if (fontSize >= 16) {
        return await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE)
      } else {
        return await Jimp.loadFont(Jimp.FONT_SANS_8_WHITE)
      }
    } catch (error) {
      console.warn('加载字体失败，使用默认字体:', error.message)
      return await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE)
    }
  }

  /**
   * 智能水印位置选择（基于图片内容分析）
   * @param {Buffer} imageBuffer - 图片buffer
   * @returns {string} 推荐的水印位置
   */
  async calculateOptimalPosition(imageBuffer) {
    try {
      // 这里可以实现更复杂的图片内容分析
      // 例如检测图片的亮度分布，选择对比度最好的角落
      // 目前返回默认位置
      return 'bottom-right'
    } catch (error) {
      console.warn('智能位置计算失败，使用默认位置:', error.message)
      return 'bottom-right'
    }
  }

  /**
   * 验证水印是否正确添加
   * @param {Buffer} originalBuffer - 原图buffer
   * @param {Buffer} watermarkedBuffer - 水印图buffer
   * @returns {boolean} 验证结果
   */
  async validateWatermark(originalBuffer, watermarkedBuffer) {
    try {
      // 简单验证：检查文件大小是否有合理变化
      const sizeDiff = watermarkedBuffer.length - originalBuffer.length
      const sizeChangePercent = Math.abs(sizeDiff) / originalBuffer.length * 100

      // 水印添加后文件大小变化应该在合理范围内（1-20%）
      if (sizeChangePercent > 0.1 && sizeChangePercent < 20) {
        console.log(`✅ 水印验证通过: 文件大小变化 ${sizeChangePercent.toFixed(2)}%`)
        return true
      } else {
        console.warn(`⚠️ 水印验证异常: 文件大小变化 ${sizeChangePercent.toFixed(2)}%`)
        return false
      }
    } catch (error) {
      console.error('水印验证失败:', error.message)
      return false
    }
  }

  /**
   * 获取支持的水印样式列表
   * @returns {Array} 样式列表
   */
  getSupportedStyles() {
    return [
      {
        name: 'default',
        description: '默认样式',
        config: this.defaultOptions
      },
      {
        name: 'subtle',
        description: '低调样式',
        config: {
          ...this.defaultOptions,
          fontSize: 10,
          fillColor: 'rgba(255, 255, 255, 0.6)',
          strokeColor: 'rgba(0, 0, 0, 0.6)'
        }
      },
      {
        name: 'prominent',
        description: '醒目样式',
        config: {
          ...this.defaultOptions,
          fontSize: 16,
          fillColor: 'rgba(255, 255, 255, 0.9)',
          strokeColor: 'rgba(0, 0, 0, 0.9)',
          strokeWidth: 2
        }
      }
    ]
  }
}

module.exports = WatermarkProcessor
