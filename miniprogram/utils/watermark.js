/**
 * 客户端水印工具类
 * 使用小程序原生Canvas添加水印
 */

class WatermarkUtil {
  /**
   * 给图片添加文字水印（使用原生Canvas）
   * @param {string} imageSrc - 图片路径
   * @param {object} options - 水印配置
   * @returns {Promise<string>} - 返回带水印的临时文件路径
   */
  static addTextWatermark(imageSrc, options = {}) {
    const {
      text = 'AI Generated',
      fontSize = 2,  // 轻量级水印，不影响用户体验
      color = 'rgba(255,255,255,0.01)',  // 优化透明度，避免遮挡图片内容
      position = 'bottom-right',
      padding = 20,
      canvasId = 'watermarkCanvas_' + Date.now()
    } = options

    return new Promise((resolve, reject) => {
      // 1. 获取图片信息
      wx.getImageInfo({
        src: imageSrc,
        success: (imageInfo) => {
          const { width, height, path } = imageInfo

          // 2. 检查是否支持离屏Canvas
          if (typeof wx.createOffscreenCanvas !== 'function') {
            console.error('❌ 当前微信版本不支持离屏Canvas，无法添加水印')
            reject(new Error('不支持离屏Canvas'))
            return
          }

          // 使用离屏Canvas
          const canvas = wx.createOffscreenCanvas({
            type: '2d',
            width: width,
            height: height
          })

          const ctx = canvas.getContext('2d')

          // 3. 加载并绘制原图
          const img = canvas.createImage()

          img.onload = () => {
            // 绘制原图
            ctx.drawImage(img, 0, 0, width, height)

            // 4. 计算水印位置
            const pos = this.calculatePosition(width, height, text, fontSize, position, padding)

            // 5. 使用标准Canvas 2D API（离屏Canvas必须用标准API）
            ctx.font = `${fontSize}px sans-serif`

            // 添加文字描边（优化视觉效果）
            ctx.strokeStyle = 'rgba(0,0,0,0.005)'
            ctx.lineWidth = 0.5
            ctx.strokeText(text, pos.x, pos.y)

            // 6. 添加水印文字
            ctx.fillStyle = color
            ctx.fillText(text, pos.x, pos.y)

            // 7. 导出为临时文件
            wx.canvasToTempFilePath({
              canvas: canvas,
              success: (res) => {
                console.log('✅ 水印添加成功:', res.tempFilePath)
                resolve(res.tempFilePath)
              },
              fail: (err) => {
                console.error('❌ 导出canvas失败:', err)
                reject(err)
              }
            })
          }

          img.onerror = (err) => {
            console.error('❌ 图片加载失败:', err)
            reject(err)
          }

          img.src = path
        },
        fail: (err) => {
          console.error('❌ 获取图片信息失败:', err)
          reject(err)
        }
      })
    })
  }

  /**
   * 计算水印位置
   */
  static calculatePosition(imgWidth, imgHeight, text, fontSize, position, padding) {
    // 估算文字宽度
    const textWidth = text.length * fontSize * 0.6

    let x, y

    switch (position) {
      case 'top-left':
        x = padding
        y = padding + fontSize
        break
      case 'top-right':
        x = imgWidth - textWidth - padding
        y = padding + fontSize
        break
      case 'bottom-left':
        x = padding
        y = imgHeight - padding
        break
      case 'bottom-right':
      default:
        x = imgWidth - textWidth - padding
        y = imgHeight - padding
        break
      case 'center':
        x = (imgWidth - textWidth) / 2
        y = imgHeight / 2
        break
    }

    return { x, y }
  }

  /**
   * 批量添加水印
   */
  static async addWatermarkBatch(imagePaths, options = {}) {
    const results = []

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i]

      try {
        console.log(`🎨 处理第${i+1}/${imagePaths.length}张图片...`)
        const watermarkedPath = await this.addTextWatermark(imagePath, options)

        results.push({
          success: true,
          original: imagePath,
          watermarked: watermarkedPath
        })
      } catch (error) {
        console.error(`❌ 第${i+1}张图片水印失败:`, error)

        results.push({
          success: false,
          original: imagePath,
          watermarked: imagePath, // 失败时返回原图
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`📊 批量水印完成: ${successCount}/${imagePaths.length}`)

    return results
  }
}

module.exports = WatermarkUtil
