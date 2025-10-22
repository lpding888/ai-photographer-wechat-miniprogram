/**
 * 分享海报生成工具
 * 用于生成带二维码的精美分享海报
 */

class PosterGenerator {
  /**
   * 生成作品分享海报
   * @param {Object} options 配置项
   * @param {String} options.workImage 作品图片URL
   * @param {String} options.title 作品标题
   * @param {String} options.userName 用户昵称
   * @param {String} options.avatarUrl 用户头像URL
   * @returns {Promise<String>} 返回海报临时文件路径
   */
  static async generateWorkPoster(options = {}) {
    const {
      workImage = '',
      title = 'AI摄影作品',
      userName = '用户',
      avatarUrl = '/images/default-avatar.png'
    } = options

    return new Promise((resolve, reject) => {
      // 兼容性检查
      if (typeof wx.createOffscreenCanvas !== 'function') {
        reject(new Error('当前微信版本不支持Canvas绘制，请升级微信'))
        return
      }

      // 海报尺寸 (9:16适合朋友圈)
      const posterWidth = 750
      const posterHeight = 1334

      try {
        // 创建离屏Canvas
        const canvas = wx.createOffscreenCanvas({
          type: '2d',
          width: posterWidth,
          height: posterHeight
        })

        const ctx = canvas.getContext('2d')

      // 1. 绘制背景（渐变色）
      const gradient = ctx.createLinearGradient(0, 0, 0, posterHeight)
      gradient.addColorStop(0, '#667eea')
      gradient.addColorStop(1, '#764ba2')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, posterWidth, posterHeight)

      // 2. 加载作品图片
      const workImg = canvas.createImage()
      workImg.onload = () => {
        try {
          // 绘制作品图片（居中，带圆角和阴影）
          const imgWidth = 690
          const imgHeight = 920
          const imgX = (posterWidth - imgWidth) / 2
          const imgY = 120

          // 绘制白色背景卡片
          ctx.fillStyle = '#ffffff'
          ctx.shadowColor = 'rgba(0,0,0,0.3)'
          ctx.shadowBlur = 20
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = 10
          this.roundRect(ctx, imgX - 20, imgY - 20, imgWidth + 40, imgHeight + 40, 20)
          ctx.fill()
          ctx.shadowColor = 'transparent'

          // 绘制作品图片（圆角）
          ctx.save()
          this.roundRect(ctx, imgX, imgY, imgWidth, imgHeight, 16)
          ctx.clip()
          ctx.drawImage(workImg, imgX, imgY, imgWidth, imgHeight)
          ctx.restore()

          // 3. 绘制顶部文案（避免使用emoji，兼容性更好）
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 48px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('AI摄影师', posterWidth / 2, 80)

          // 4. 绘制底部信息区域
          const bottomY = imgY + imgHeight + 80

          // 用户信息（如果有头像）
          if (avatarUrl) {
            this.loadAvatar(canvas, ctx, avatarUrl, 60, bottomY, 60, userName, () => {
              this.finishPoster(canvas, ctx, posterWidth, posterHeight, bottomY, title, resolve, reject)
            })
          } else {
            this.finishPoster(canvas, ctx, posterWidth, posterHeight, bottomY, title, resolve, reject)
          }
        } catch (err) {
          console.error('绘制海报失败:', err)
          reject(err)
        }
      }

      workImg.onerror = (err) => {
        console.error('作品图片加载失败:', err)
        reject(new Error('作品图片加载失败'))
      }

        // 处理cloud://路径
        if (workImage.startsWith('cloud://')) {
          wx.cloud.getTempFileURL({
            fileList: [workImage],
            success: res => {
              if (res.fileList && res.fileList[0]) {
                workImg.src = res.fileList[0].tempFileURL
              } else {
                reject(new Error('获取图片临时链接失败'))
              }
            },
            fail: reject
          })
        } else {
          workImg.src = workImage
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * 完成海报绘制
   */
  static finishPoster(canvas, ctx, posterWidth, posterHeight, bottomY, title, resolve, reject) {
    // 绘制作品标题
    ctx.fillStyle = '#ffffff'
    ctx.font = '36px sans-serif'
    ctx.textAlign = 'center'
    const titleText = title.length > 20 ? title.substring(0, 20) + '...' : title
    ctx.fillText(titleText, posterWidth / 2, bottomY + 100)

    // 绘制提示文案
    ctx.font = '28px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText('长按识别小程序码，一起玩转AI摄影', posterWidth / 2, bottomY + 160)

    // 绘制二维码占位（需要使用小程序码接口）
    ctx.fillStyle = '#ffffff'
    const qrSize = 180
    const qrX = (posterWidth - qrSize) / 2
    const qrY = bottomY + 200
    this.roundRect(ctx, qrX, qrY, qrSize, qrSize, 12)
    ctx.fill()

    // 绘制二维码提示
    ctx.fillStyle = '#666666'
    ctx.font = '24px sans-serif'
    ctx.fillText('小程序码区域', posterWidth / 2, qrY + qrSize / 2)
    ctx.font = '20px sans-serif'
    ctx.fillText('(需调用云函数生成)', posterWidth / 2, qrY + qrSize / 2 + 30)

    // 导出为临时文件
    wx.canvasToTempFilePath({
      canvas: canvas,
      success: (res) => {
        console.log('✅ 海报生成成功:', res.tempFilePath)
        resolve(res.tempFilePath)
      },
      fail: (err) => {
        console.error('❌ 海报导出失败:', err)
        reject(err)
      }
    })
  }

  /**
   * 加载并绘制用户头像
   */
  static loadAvatar(canvas, ctx, avatarUrl, x, y, size, userName, callback) {
    const avatarImg = canvas.createImage()
    avatarImg.onload = () => {
      try {
        // 绘制圆形头像
        ctx.save()
        ctx.beginPath()
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(avatarImg, x, y, size, size)
        ctx.restore()

        // 绘制用户昵称
        ctx.fillStyle = '#ffffff'
        ctx.font = '28px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(userName, x + size + 20, y + size / 2 + 10)

        callback()
      } catch (err) {
        console.warn('头像绘制失败，跳过:', err)
        callback()
      }
    }

    avatarImg.onerror = () => {
      console.warn('头像加载失败，跳过')
      callback()
    }

    // 处理头像URL（支持cloud://路径）
    if (avatarUrl && avatarUrl.startsWith('cloud://')) {
      wx.cloud.getTempFileURL({
        fileList: [avatarUrl],
        success: res => {
          if (res.fileList && res.fileList[0]) {
            avatarImg.src = res.fileList[0].tempFileURL
          } else {
            console.warn('获取头像临时链接失败，使用默认头像')
            callback()
          }
        },
        fail: () => {
          console.warn('获取头像临时链接失败')
          callback()
        }
      })
    } else {
      avatarImg.src = avatarUrl
    }
  }

  /**
   * 绘制圆角矩形
   */
  static roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  /**
   * 生成邀请海报（用于邀请好友得积分）
   * @param {Object} options 配置项
   */
  static async generateInvitePoster(options = {}) {
    const {
      userName = '用户',
      avatarUrl = '/images/default-avatar.png',
      inviteCode = ''
    } = options

    // 简化版：纯色背景 + 文案 + 二维码
    const posterWidth = 750
    const posterHeight = 1334

    return new Promise((resolve, reject) => {
      // 兼容性检查
      if (typeof wx.createOffscreenCanvas !== 'function') {
        reject(new Error('当前微信版本不支持Canvas绘制，请升级微信'))
        return
      }

      try {
        const canvas = wx.createOffscreenCanvas({
          type: '2d',
          width: posterWidth,
          height: posterHeight
        })

        const ctx = canvas.getContext('2d')

        // 背景渐变
        const gradient = ctx.createLinearGradient(0, 0, 0, posterHeight)
        gradient.addColorStop(0, '#667eea')
        gradient.addColorStop(1, '#764ba2')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, posterWidth, posterHeight)

        // 主标题（避免使用emoji）
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 56px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('送你免费体验积分', posterWidth / 2, 300)

        // 副标题
        ctx.font = '36px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fillText('AI摄影师 · 用AI重新定义摄影', posterWidth / 2, 380)

        // 邀请人信息
        ctx.font = '32px sans-serif'
        ctx.fillText(`${userName} 邀请你体验`, posterWidth / 2, 500)

        // 二维码占位区域
        ctx.fillStyle = '#ffffff'
        const qrSize = 280
        const qrX = (posterWidth - qrSize) / 2
        const qrY = 600
        this.roundRect(ctx, qrX, qrY, qrSize, qrSize, 20)
        ctx.fill()

        ctx.fillStyle = '#666666'
        ctx.font = '28px sans-serif'
        ctx.fillText('小程序码', posterWidth / 2, qrY + qrSize / 2)

        // 底部提示
        ctx.fillStyle = '#ffffff'
        ctx.font = '28px sans-serif'
        ctx.fillText('长按识别二维码，立即领取', posterWidth / 2, qrY + qrSize + 80)

        // 导出
        wx.canvasToTempFilePath({
          canvas: canvas,
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        })
      } catch (err) {
        reject(err)
      }
    })
  }
}

module.exports = PosterGenerator
