/**
 * 占位图片工具类
 * 用于生成临时占位图片，解决开发阶段图片资源缺失问题
 */

class PlaceholderService {
  /**
   * 生成占位图片的base64数据
   * @param {number} width 宽度
   * @param {number} height 高度
   * @param {string} text 显示文字
   * @param {string} bgColor 背景色
   * @param {string} textColor 文字颜色
   */
  generatePlaceholder(width = 200, height = 200, text = '占位图', bgColor = '#f0f0f0', textColor = '#666') {
    // 创建canvas元素
    const canvas = wx.createCanvasContext('placeholder-canvas')
    
    // 设置背景
    canvas.setFillStyle(bgColor)
    canvas.fillRect(0, 0, width, height)
    
    // 设置文字
    canvas.setFillStyle(textColor)
    canvas.setFontSize(16)
    canvas.setTextAlign('center')
    canvas.fillText(text, width / 2, height / 2)
    
    return canvas
  }

  /**
   * 获取默认头像占位图
   */
  getDefaultAvatar() {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iNDAiIGZpbGw9IiNGMEYwRjAiLz4KPGNpcmNsZSBjeD0iNDAiIGN5PSIzMiIgcj0iMTIiIGZpbGw9IiM5OTk5OTkiLz4KPHBhdGggZD0iTTIwIDY4QzIwIDU2IDI4IDQ4IDQwIDQ4QzUyIDQ4IDYwIDU2IDYwIDY4IiBmaWxsPSIjOTk5OTk5Ii8+Cjwvc3ZnPgo='
  }

  /**
   * 获取Logo占位图
   */
  getLogo() {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiByeD0iMjAiIGZpbGw9IiM0Qzc5RkYiLz4KPHN2ZyB4PSI1MCIgeT0iNTAiIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IndoaXRlIj4KPHA+QUk8L3A+CjwvZz4KPC9zdmc+Cg=='
  }

  /**
   * 获取积分图标占位图
   */
  getCreditsIcon() {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiNGRkQ3MDAiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzMzMzMzMyI+CjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01aDNWOGg0djRoM2wtNSA1eiIvPgo8L3N2Zz4KPC9zdmc+Cg=='
  }
}

// 创建单例实例
const placeholderService = new PlaceholderService()

module.exports = placeholderService