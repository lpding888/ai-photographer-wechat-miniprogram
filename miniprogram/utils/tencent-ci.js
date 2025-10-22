/**
 * 腾讯云数据万象（CI）抠图服务封装
 */

/**
 * 对图片进行AI抠图处理
 * @param {string} imageUrl - 图片cloud://路径或https://路径
 * @returns {Promise<object>} - 返回处理后的图片信息
 */
async function mattingImage(imageUrl) {
  try {
    // 调用云函数处理抠图
    const res = await wx.cloud.callFunction({
      name: 'tencent-ci-matting',
      data: {
        imageUrl: imageUrl
      }
    })

    if (res.result && res.result.success) {
      return {
        success: true,
        processedImageUrl: res.result.processedImageUrl,
        originalImageUrl: imageUrl
      }
    } else {
      throw new Error(res.result.message || '抠图处理失败')
    }
  } catch (error) {
    console.error('腾讯云CI抠图失败:', error)
    return {
      success: false,
      error: error.message || '抠图服务异常',
      originalImageUrl: imageUrl
    }
  }
}

/**
 * 使用模拟抠图（开发测试用）
 * 实际部署时应使用真实的腾讯云CI服务
 */
async function mockMattingImage(imageUrl) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        processedImageUrl: imageUrl, // 暂时返回原图
        originalImageUrl: imageUrl,
        isMocked: true
      })
    }, 2000) // 模拟2秒处理时间
  })
}

module.exports = {
  mattingImage,
  mockMattingImage
}
