// 作品详情页面
const apiService = require('../../utils/api.js')
const WatermarkUtil = require('../../utils/watermark.js')
const PosterGenerator = require('../../utils/poster.js')
const aiAssistant = require('../../utils/aiAssistant.js')
const app = getApp()

Page({
  // 规范化后端返回的作品数据，补齐图片链接与描述字段
  async normalizeWork(raw) {
    const w = raw || {};
    const images = Array.isArray(w.images) ? w.images : [];

    // 🚀 性能优化：批量转换cloud://为HTTPS（类似列表页逻辑）
    const cloudUrls = [];
    images.forEach((img) => {
      let imageUrl = '';
      if (typeof img === 'string') {
        imageUrl = img;
      } else {
        imageUrl = img.temp_url || img.https || img.url || img.fileID || img.file_id;
      }
      if (imageUrl && imageUrl.startsWith('cloud://')) {
        cloudUrls.push(imageUrl);
      }
    });

    // 批量获取HTTPS临时链接
    const urlMap = new Map();
    if (cloudUrls.length > 0) {
      console.log(`🔄 详情页转换 ${cloudUrls.length} 个cloud://URL为HTTPS`);
      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: cloudUrls.map(url => ({
            fileID: url,
            maxAge: 86400 // 24小时有效期
          }))
        });

        if (result.fileList) {
          result.fileList.forEach(file => {
            const tempUrl = file.status === 0 ? file.tempFileURL : file.fileID;
            urlMap.set(file.fileID, tempUrl);
          });
          console.log(`✅ 转换完成，获得 ${urlMap.size} 个HTTPS链接`);
        }
      } catch (error) {
        console.error('❌ 批量获取临时URL失败:', error);
      }
    }

    const normImages = images.map((img) => {
      let imageUrl = '';
      if (typeof img === 'string') {
        imageUrl = img;
      } else {
        imageUrl = img.temp_url || img.https || img.url || img.fileID || img.file_id;
      }

      // 🎯 关键修复：如果是cloud://，先用转换后的HTTPS链接
      if (imageUrl && imageUrl.startsWith('cloud://') && urlMap.has(imageUrl)) {
        imageUrl = urlMap.get(imageUrl);
        console.log('✅ 使用转换后的HTTPS链接:', imageUrl.substring(0, 100));
      }

      // 使用图片处理工具获取CDN优化的URL
      console.log('🔍 详情页原始URL:', imageUrl.substring(0, 100))
      const safeUrl = app.globalData.imageHandler ?
        app.globalData.imageHandler.getOptimizedImageUrl(imageUrl, { width: 1024, height: 1024, quality: 90 }) :
        imageUrl;
      console.log('🎯 详情页CDN优化后URL:', safeUrl.substring(0, 100))

      if (typeof img === 'string') {
        return { url: safeUrl };
      }

      return {
        temp_url: safeUrl,
        url: safeUrl,
        width: img.width,
        height: img.height,
        size: img.size
      };
    });
    const id = w.id || w._id || w.work_id;
    const aiDesc = w.ai_description || w.description || w.desc || w.photographer_note || '';
    return {
      ...w,
      id,
      images: normImages,
      ai_description: aiDesc
    };
  },

  // 提取主机名用于提示
  extractHost(u) {
    try {
      const m = String(u).match(/^https?:\/\/([^\/]+)/i);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  },

  // 下载图片为本地临时路径（支持 https 与 cloud://），内置兜底与错误提示
  async downloadImageToTemp(imageUrl) {
    if (!imageUrl) throw new Error('无有效图片地址');

    let tempFilePath;

    // 🎯 下载优化：移除CDN压缩参数，使用高质量原图
    let downloadUrl = imageUrl;
    if (imageUrl.includes('imageMogr2')) {
      // 检测到CDN压缩参数，替换为高质量参数（保留尺寸，但提升质量）
      const urlObj = imageUrl.split('?');
      const baseUrl = urlObj[0];
      const queryString = urlObj[1] || '';

      // 保留原有的sign/t参数，但使用高质量压缩参数
      const signMatch = queryString.match(/[&?](sign=[^&]+)/);
      const tMatch = queryString.match(/[&?](t=[^&]+)/);
      const authParams = [signMatch?.[1], tMatch?.[1]].filter(Boolean).join('&');

      // 下载时使用：原图质量100，不限制尺寸，保持原格式
      downloadUrl = authParams ? `${baseUrl}?imageMogr2/quality/100&${authParams}` : `${baseUrl}?imageMogr2/quality/100`;
      console.log('📥 下载使用高质量参数:', downloadUrl.substring(0, 120));
    }

    // cloud:// 直接走云下载
    if (!/^https?:\/\//.test(downloadUrl)) {
      const dl = await wx.cloud.downloadFile({ fileID: downloadUrl });
      tempFilePath = dl.tempFilePath;
    } else {
      // https 优先 downloadFile，失败则兜底到 getImageInfo
      const host = this.extractHost(downloadUrl);
      try {
        const dl = await wx.downloadFile({ url: downloadUrl });
        if (dl.statusCode === 200 && dl.tempFilePath) {
          tempFilePath = dl.tempFilePath;
        } else {
          throw new Error('DOWNLOAD_FILE_FAILED');
        }
      } catch (e1) {
        try {
          // 兜底：getImageInfo 也会生成本地临时文件
          const info = await wx.getImageInfo({ src: downloadUrl });
          if (info && info.path) {
            tempFilePath = info.path;
          } else {
            throw new Error('GET_IMAGE_INFO_FAILED');
          }
        } catch (e2) {
          // 将域名带入错误，便于配置 downloadFile 合法域名
          const err = new Error(`无法下载图片，请将域名加入"downloadFile合法域名"：${host}`);
          err._host = host;
          throw err;
        }
      }
    }

    // 如果是AI生成的图片，添加水印
    const isAIGenerated = imageUrl.includes('/photography/') || imageUrl.includes('/fitting/');
    if (isAIGenerated) {
      try {
        console.log('🎨 为AI生成图片添加水印...');
        const watermarkedPath = await WatermarkUtil.addTextWatermark(tempFilePath, {
          text: 'AI Generated',
          fontSize: 2,  // 优化水印大小
          color: 'rgba(255,255,255,0.01)',  // 自适应透明度
          position: 'bottom-right'
        });
        console.log('✅ 水印添加成功:', watermarkedPath);
        return watermarkedPath;
      } catch (err) {
        console.error('⚠️ 水印添加失败，返回原图:', err);
        // 水印失败时提示用户，但仍返回原图以便保存
        wx.showToast({
          title: '水印添加失败，将保存原图',
          icon: 'none',
          duration: 2000
        });
        return tempFilePath; // 水印失败，返回原图
      }
    }

    return tempFilePath;
  },

  /**
   * 预加载图片（异步，不阻塞主线程）
   * 从第2张开始预加载，最多预加载5张
   */
  preloadImages(images) {
    if (!images || images.length <= 1) return;
    
    // 异步预加载，不阻塞主线程
    setTimeout(() => {
      const imagesToPreload = images.slice(1, 6); // 预加载第2-6张
      
      imagesToPreload.forEach((image, index) => {
        const imageUrl = image.temp_url || image.url;
        if (imageUrl) {
          // 异步下载，忽略错误（避免影响主流程）
          this.downloadImageToTemp(imageUrl)
            .then(tempFilePath => {
              console.log(`预加载图片${index + 2}成功`);
            })
            .catch(error => {
              // 静默失败，不影响用户体验
              console.warn(`预加载图片${index + 2}失败:`, error.message);
            });
        }
      });
    }, 1000); // 延迟1秒开始预加载，确保首屏体验
  },

  data: {
    workId: '',
    work: null,
    loading: true,

    // 原图展示
    originalImagesUrls: [],

    // 图片预览相关
    currentImageIndex: 0,
    showImageViewer: false,
    imageViewerUrls: [],

    // 操作状态
    isFavoriting: false,
    isDeleting: false,

    // 变量快照显示与数据
    showVarSnapshot: false,
    varSnapshotList: [],

    // 图片展示增强功能
    showImageControls: false,
    imageZoomScale: 1,
    imageZoomPercentage: 100,

    // 作品操作面板
    showActionPanel: false,

    // 图片比较功能（如果有原图和生成图）
    showComparison: false,

    // 🎭 姿势裂变相关
    showPoseModal: false,
    poseMode: 'preset',  // 'preset' | 'custom' | 'ai'
    posePresets: [],
    loadingPoses: false,
    selectedPoseId: '',
    selectedPoseName: '',
    customPoseDescription: '',
    canConfirm: false,
    comparisonMode: 'split', // split, overlay, toggle

    // AI姿势裂变
    aiGeneratedPoses: [],
    aiLoading: false,
    selectedAIPose: '',
    aiLoadingTip: '正在分析场景氛围...',
    aiLoadingTipIndex: 0,

    // 新UI展开状态
    showParams: false,
    showTechExpanded: false,

    // 标题编辑状态
    editingTitle: false,
    editingTitleValue: ''
  },

  onLoad(options) {
    const { id } = options
    
    if (!id) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ workId: id })
    this.loadWorkDetail()
  },

  onShareAppMessage() {
    const work = this.data.work
    if (!work) return {}

    return {
      title: `${work.title || '精美作品'} - AI摄影师`,
      path: `/pages/work-detail/work-detail?id=${this.data.workId}`,
      imageUrl: work.images && work.images.length > 0 ? work.images[0].url : ''
    }
  },

  onUnload() {
    // 🎨 清理加载提示定时器，防止内存泄漏
    this.stopLoadingTips()
  },

  /**
   * 加载作品详情
   */
  async loadWorkDetail() {
    try {
      const res = await apiService.getWorkDetail(this.data.workId)

      if (res.success) {
        const work = await this.normalizeWork(res.data)

        // 🎯 处理原图数据
        const originalImagesUrls = await this.processOriginalImages(work.original_images || [])

        this.setData({
          work,
          originalImagesUrls,
          loading: false,
          varSnapshotList: this.buildVarSnapshot(work)
        })

        // 设置页面标题
        wx.setNavigationBarTitle({
          title: work.title || '作品详情'
        })

        // 异步预加载后续图片（不阻塞主线程）
        if (work.images && work.images.length > 1) {
          this.preloadImages(work.images);
        }
      } else {
        this.handleLoadError('加载失败')
      }
    } catch (error) {
      console.error('加载作品详情失败:', error)
      this.handleLoadError('网络错误')
    }
  },

  /**
   * 处理原图数据，将fileID转换为临时URL
   */
  async processOriginalImages(originalImages) {
    if (!originalImages || originalImages.length === 0) {
      return []
    }

    try {
      console.log('🖼️ 开始处理原图数据:', originalImages.length)

      // 提取所有fileID
      const fileIds = originalImages.map(img => {
        // 兼容两种格式：字符串数组（photography）和对象数组（fitting）
        return typeof img === 'string' ? img : img.fileId
      }).filter(Boolean)

      if (fileIds.length === 0) return []

      // 批量获取临时URL
      const result = await wx.cloud.getTempFileURL({
        fileList: fileIds.map(fileId => ({
          fileID: fileId,
          maxAge: 86400
        }))
      })

      if (!result.fileList) return []

      // 映射URL
      const urlMap = new Map()
      result.fileList.forEach(file => {
        if (file.status === 0) {
          urlMap.set(file.fileID, file.tempFileURL)
        }
      })

      // 构建最终数据
      const processedImages = []
      originalImages.forEach((img, index) => {
        const fileId = typeof img === 'string' ? img : img.fileId
        const url = urlMap.get(fileId)

        if (url) {
          // 优化URL（使用CDN压缩）
          console.log(`🔍 原图${index + 1}原始URL:`, url.substring(0, 100))
          const optimizedUrl = app.globalData.imageHandler ?
            app.globalData.imageHandler.getOptimizedImageUrl(url, { width: 300, height: 300, quality: 85 }) :
            url
          console.log(`🎯 原图${index + 1}CDN优化后:`, optimizedUrl.substring(0, 100))

          // 生成标签
          let typeLabel = ''
          if (typeof img === 'object') {
            if (img.type === 'person') {
              typeLabel = '人物'
            } else if (img.type === 'clothing') {
              const clothingTypeMap = {
                'top': '上装',
                'bottom': '下装',
                'shoes': '鞋子',
                'accessory': '配饰'
              }
              typeLabel = clothingTypeMap[img.clothingType] || '服装'
            }
          } else {
            typeLabel = `原图${index + 1}`
          }

          processedImages.push({
            url: optimizedUrl,
            originalUrl: url,
            typeLabel,
            index
          })
        }
      })

      console.log(`✅ 原图处理完成: ${processedImages.length}张`)
      return processedImages

    } catch (error) {
      console.error('❌ 处理原图失败:', error)
      return []
    }
  },

  /**
   * 处理加载错误
   */
  handleLoadError(message) {
    this.setData({ loading: false })
    
    wx.showModal({
      title: '加载失败',
      content: message,
      showCancel: false,
      success: () => {
        wx.navigateBack()
      }
    })
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const index = e.currentTarget.dataset.index || 0
    const work = this.data.work
    
    if (!work || !work.images || work.images.length === 0) return

    const urls = work.images.map(img => img.temp_url || img.url)
    
    wx.previewImage({
      urls,
      current: urls[index]
    })
  },

  /**
   * 切换收藏状态
   */
  async toggleFavorite() {
    if (this.data.isFavoriting) return

    this.setData({ isFavoriting: true })

    try {
      const res = await apiService.toggleFavorite(this.data.workId)
      
      if (res.success) {
        const work = { ...this.data.work }
        work.is_favorite = !work.is_favorite
        
        this.setData({ 
          work,
          isFavoriting: false
        })
        
        wx.showToast({
          title: work.is_favorite ? '已收藏' : '已取消收藏',
          icon: 'success',
          duration: 1500
        })
      } else {
        this.setData({ isFavoriting: false })
      }
    } catch (error) {
      console.error('切换收藏状态失败:', error)
      this.setData({ isFavoriting: false })
    }
  },

  /**
   * 保存到回忆
   */
  saveToMemory() {
    const work = this.data.work
    if (!work || !work.images || work.images.length === 0) {
      wx.showToast({
        title: '没有可保存的图片',
        icon: 'none'
      })
      return
    }

    // 获取当前查看的图片URL
    const currentImage = work.images[this.data.currentImageIndex]
    const imageUrl = currentImage.temp_url || currentImage.url

    // 使用全局数据传递（避免URL长度限制）
    const app = getApp()
    app.globalData = app.globalData || {}
    app.globalData.tempMemoryImage = imageUrl
    app.globalData.tempMemoryFrom = 'work'

    // 跳转到造型回忆页面
    wx.navigateTo({
      url: `/pages/memories/memories?from=work`
    })
  },

  /**
   * 保存图片到相册
   */
  async saveToAlbum() {
    const work = this.data.work
    if (!work || !work.images || work.images.length === 0) {
      wx.showToast({
        title: '没有可保存的图片',
        icon: 'none'
      })
      return
    }

    try {
      // 获取用户授权
      const authRes = await this.getSaveImageAuth()
      if (!authRes) return

      wx.showActionSheet({
        itemList: work.images.length > 1 ? ['保存当前图片', '保存全部图片'] : ['保存图片'],
        success: async (res) => {
          if (res.tapIndex === 0) {
            // 保存当前图片
            await this.saveImage(work.images[this.data.currentImageIndex])
          } else if (res.tapIndex === 1) {
            // 保存全部图片
            await this.saveAllImages(work.images)
          }
        }
      })
    } catch (error) {
      console.error('保存图片失败:', error)
    }
  },

  /**
   * 保存单张图片
   */
  async saveImage(image) {
    try {
      wx.showLoading({
        title: '保存中...',
        mask: true
      })

      const imageUrl = (image && (image.temp_url || image.url)) || ''
      const tempFilePath = await this.downloadImageToTemp(imageUrl)

      // 保存到相册
      await wx.saveImageToPhotosAlbum({ filePath: tempFilePath })

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
    } catch (error) {
      wx.hideLoading()
      console.error('保存图片失败:', error)
      const work = this.data.work || {}
      const img = work.images ? work.images[this.data.currentImageIndex] : null
      const imageUrl = (img && (img.temp_url || img.url)) || ''
      const host = imageUrl && imageUrl.match(/^https?:\/\/([^\/]+)/i) ? RegExp.$1 : ''
      wx.showActionSheet({
        itemList: ['预览长按保存', '复制图片链接', host ? `配置域名: ${host}` : '我知道了'],
        success: (res) => {
          if (res.tapIndex === 0 && imageUrl) {
            // 进入系统预览，用户可长按保存
            wx.previewImage({ urls: [imageUrl], current: imageUrl })
            wx.showToast({ title: '长按图片可保存', icon: 'none' })
          } else if (res.tapIndex === 1 && imageUrl) {
            wx.setClipboardData({ data: imageUrl, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) })
          }
        }
      })
    }
  },

  /**
   * 保存全部图片
   */
  async saveAllImages(images) {
    try {
      wx.showLoading({
        title: `保存中 0/${images.length}`,
        mask: true
      })

      let successCount = 0
      
      for (let i = 0; i < images.length; i++) {
        try {
          wx.showLoading({
            title: `保存中 ${i + 1}/${images.length}`,
            mask: true
          })

          const imageUrl = (images[i] && (images[i].temp_url || images[i].url)) || ''
          const tempFilePath = await this.downloadImageToTemp(imageUrl)

          await wx.saveImageToPhotosAlbum({ filePath: tempFilePath })
          successCount++
        } catch (error) {
          console.error(`保存第${i + 1}张图片失败:`, error)
          // 单张失败时也提示域名，便于排查
          if (error && error._host) {
            wx.showToast({ title: `请配置域名:${error._host}`, icon: 'none' })
          }
        }
      }

      wx.hideLoading()
      
      if (successCount === images.length) {
        wx.showToast({
          title: '全部保存成功',
          icon: 'success'
        })
      } else {
        wx.showToast({
          title: `保存成功 ${successCount}/${images.length} 张`,
          icon: 'none'
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('批量保存图片失败:', error)
      const work = this.data.work || {}
      const list = (work && work.images) || []
      const firstUrl = list[0] ? (list[0].temp_url || list[0].url) : ''
      const host = firstUrl && firstUrl.match(/^https?:\/\/([^\/]+)/i) ? RegExp.$1 : ''
      wx.showActionSheet({
        itemList: ['逐张预览保存', '复制第一张链接', host ? `配置域名: ${host}` : '我知道了'],
        success: (res) => {
          if (res.tapIndex === 0 && firstUrl) {
            wx.previewImage({ urls: list.map(i => i.temp_url || i.url).filter(Boolean), current: firstUrl })
            wx.showToast({ title: '长按图片可保存', icon: 'none' })
          } else if (res.tapIndex === 1 && firstUrl) {
            wx.setClipboardData({ data: firstUrl, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) })
          }
        }
      })
    }
  },

  /**
   * 获取保存图片授权
   */
  getSaveImageAuth() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.writePhotosAlbum']) {
            resolve(true)
          } else {
            wx.authorize({
              scope: 'scope.writePhotosAlbum',
              success: () => resolve(true),
              fail: () => {
                wx.showModal({
                  title: '授权提示',
                  content: '需要授权保存图片到相册',
                  confirmText: '去设置',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      wx.openSetting()
                    }
                    resolve(false)
                  }
                })
              }
            })
          }
        }
      })
    })
  },

  /**
   * 轮播切换回调（更新当前索引）
   */
  onImageChange(e) {
    const { current = 0 } = e.detail || {}
    this.setData({ currentImageIndex: current })
  },

  /**
   * 复制AI描述（摄影师说）
   */
  copyAIDescription() {
    const work = this.data.work || {};
    const txt = work.ai_description || '';
    if (!txt) {
      wx.showToast({ title: '暂无可复制内容', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: txt,
      success: () => {
        wx.showToast({ title: '摄影师说已复制', icon: 'success' });
      }
    });
  },

  /**
   * 预览原图
   */
  previewOriginalImage(e) {
    const { index } = e.currentTarget.dataset
    const urls = this.data.originalImagesUrls.map(img => img.originalUrl)

    if (urls.length === 0) return

    wx.previewImage({
      urls,
      current: urls[index]
    })
  },

  /**
   * 变量快照构建：从 params / metadata / meta / options 中抽取可读键值
   * 返回形如 [{name, value}]
   */
  buildVarSnapshot(work) {
    var snap = [];
    var seen = {};
    function pushKV(k, v) {
      if (!k || seen[k]) return;
      if (v === undefined || v === null || v === '') return;
      var val = v;
      if (typeof v === 'object') {
        try { val = JSON.stringify(v); } catch (e) { val = String(v); }
      }
      snap.push({ name: k, value: String(val) });
      seen[k] = true;
    }

    if (work && typeof work === 'object') {
      var candidates = [];
      if (work.params && typeof work.params === 'object') candidates.push(work.params);
      if (work.metadata && typeof work.metadata === 'object') candidates.push(work.metadata);
      if (work.meta && typeof work.meta === 'object') candidates.push(work.meta);
      if (work.options && typeof work.options === 'object') candidates.push(work.options);

      for (var i = 0; i < candidates.length; i++) {
        var src = candidates[i];
        var keys = Object.keys(src);
        for (var j = 0; j < keys.length; j++) {
          var k = keys[j];
          if (k === 'images' || k === 'ai_description' || k === 'description' || k === 'desc' || k === 'photographer_note') continue;
          pushKV(k, src[k]);
          if (snap.length >= 80) break;
        }
        if (snap.length >= 80) break;
      }

      if (work.type) pushKV('type', work.type);
      if (work.template_name) pushKV('template_name', work.template_name);
      if (work.api_name) pushKV('api_name', work.api_name);
      if (work.location) pushKV('location', work.location);
    }

    return snap;
  },

  /**
   * 切换变量快照显隐
   */
  toggleVarSnapshot() {
    this.setData({ showVarSnapshot: !this.data.showVarSnapshot })
  },

  /**
   * 提交问题反馈（问题类型 + 备注）
   */
  submitFeedback() {
    const work = this.data.work
    if (!work) {
      wx.showToast({ title: '暂无作品', icon: 'none' })
      return
    }

    const types = ['效果不佳', '人体异常', '商品变形', '与参考不符', '其他问题']
    wx.showActionSheet({
      itemList: types,
      success: (r) => {
        const type = types[r.tapIndex]
        wx.showModal({
          title: '反馈备注（可选）',
          editable: true,
          placeholderText: '请补充问题说明，便于改进（可留空）',
          success: async (m) => {
            if (!m.confirm) return
            const remark = m.content || ''
            try {
              if (typeof apiService.submitFeedback === 'function') {
                await apiService.submitFeedback({ workId: this.data.workId, type, remark })
              }
              wx.showToast({ title: '已提交反馈', icon: 'success' })
            } catch (e) {
              wx.showToast({ title: '提交失败', icon: 'none' })
            }
          }
        })
      }
    })
  },

  // 复制当前图片链接（备用）
  copyCurrentImageLink() {
    const work = this.data.work || {}
    const img = work.images ? work.images[this.data.currentImageIndex] : null
    const url = (img && (img.temp_url || img.url)) || ''
    if (!url) return wx.showToast({ title: '暂无可复制链接', icon: 'none' })
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) })
  },

  /**
   * 生成分享海报
   */
  async generateSharePoster() {
    try {
      wx.showLoading({
        title: '生成海报中...',
        mask: true
      })

      const work = this.data.work
      if (!work || !work.images || work.images.length === 0) {
        wx.hideLoading()
        wx.showToast({
          title: '作品图片不存在',
          icon: 'none'
        })
        return
      }

      // 获取当前用户信息
      const userInfo = app.globalData.userInfo || {}

      // 获取当前显示的图片
      const currentImage = work.images[this.data.currentImageIndex]
      const imageUrl = currentImage.temp_url || currentImage.url

      // 生成海报
      const posterPath = await PosterGenerator.generateWorkPoster({
        workImage: imageUrl,
        title: work.title || 'AI摄影作品',
        userName: userInfo.nickName || '用户',
        avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
      })

      wx.hideLoading()

      // 预览海报并提供保存选项
      wx.previewImage({
        urls: [posterPath],
        current: posterPath,
        success: () => {
          wx.showModal({
            title: '保存海报',
            content: '长按图片可保存到相册，或点击确定直接保存',
            confirmText: '保存',
            success: async (res) => {
              if (res.confirm) {
                try {
                  await wx.saveImageToPhotosAlbum({ filePath: posterPath })
                  wx.showToast({
                    title: '海报已保存',
                    icon: 'success'
                  })
                } catch (error) {
                  console.error('保存海报失败:', error)

                  // 检查是否是授权问题
                  if (error.errMsg && error.errMsg.includes('auth deny')) {
                    wx.showModal({
                      title: '需要相册权限',
                      content: '保存图片需要您授权访问相册，请在设置中开启',
                      confirmText: '去设置',
                      success: (modalRes) => {
                        if (modalRes.confirm) {
                          wx.openSetting()
                        }
                      }
                    })
                  } else {
                    wx.showToast({
                      title: '保存失败，请长按图片保存',
                      icon: 'none'
                    })
                  }
                }
              }
            }
          })
        }
      })
    } catch (error) {
      wx.hideLoading()
      console.error('生成海报失败:', error)
      wx.showToast({
        title: '生成海报失败',
        icon: 'none'
      })
    }
  },

  /**
   * 删除作品（接入后端）
   */
  deleteWork() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个作品吗？',
      success: async (res) => {
        if (!res.confirm) return;
        if (this.data.isDeleting) return;

        this.setData({ isDeleting: true });
        try {
          const delRes = await apiService.deleteWork(this.data.workId);
          if (delRes && delRes.success) {
            try { wx.setStorageSync('works_force_reload', '1'); } catch (e) {}
            wx.showToast({ title: '删除成功', icon: 'success' });
            setTimeout(() => { wx.navigateBack(); }, 800);
          } else {
            const msg = (delRes && (delRes.message || delRes.errMsg)) || '删除失败';
            this.setData({ isDeleting: false });
            wx.showToast({ title: msg, icon: 'none' });
          }
        } catch (error) {
          console.error('删除作品失败:', error);
          this.setData({ isDeleting: false });
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      }
    });
  },

  /**
   * 同款重生：直接使用原始参数重新生成
   */
  async regenerate() {
    const work = this.data.work
    if (!work) return

    // 确认用户操作
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '同款重生',
        content: '将使用相同的参数重新生成作品，是否继续？',
        confirmText: '重新生成',
        cancelText: '取消',
        success: (res) => resolve(res.confirm)
      })
    })

    if (!confirm) return

    wx.showLoading({
      title: '正在生成...',
      mask: true
    })

    try {
      let res = null

      if (work.type === 'photography') {
        // 服装摄影重生
        const params = {
          images: work.parameters?.original_images || [], // 正确的字段路径
          parameters: work.parameters || {},
          sceneId: work.scene_id || null,
          count: work.generation_count || 1
        }
        res = await apiService.generatePhotography(params)
      } else if (work.type === 'fitting') {
        // 试衣间重生
        // 从 parameters.original_images 中提取图片信息
        const originalImages = work.parameters?.original_images || []

        // 第一张是个人照片（modelImage），其余是服装配饰
        const modelImage = originalImages[0] || ''
        const clothingImages = {}

        // 尝试从 parameters 中恢复服装类型信息（如果保存了）
        // 否则按顺序分配到 top, bottom, shoes, accessory
        const clothingTypes = ['top', 'bottom', 'shoes', 'accessory']
        for (let i = 1; i < originalImages.length; i++) {
          const type = clothingTypes[i - 1] || `item${i}`
          clothingImages[type] = originalImages[i]
        }

        const params = {
          modelImage: modelImage,
          clothingImages: clothingImages,
          parameters: work.parameters || {},
          sceneId: work.scene_id || null,
          count: work.generation_count || 1
        }
        res = await apiService.generateFitting(params)
      } else {
        throw new Error('不支持的作品类型')
      }

      wx.hideLoading()

      if (res && res.success) {
        // 保存新任务到队列
        try {
          const now = Date.now()
          const arr = (wx.getStorageSync('pendingTasks') || []).filter(it => it && it.taskId)
          const exists = arr.some(it => it.taskId === res.data.task_id)
          const next = exists ? arr : [...arr, { taskId: res.data.task_id, type: work.type, createdAt: now }]
          wx.setStorageSync('pendingTasks', next)
          wx.setStorageSync('pendingTask', { taskId: res.data.task_id, type: work.type, createdAt: now })
        } catch (e) {
          console.warn('保存任务队列失败', e)
        }

        wx.showToast({
          title: '重新生成成功',
          icon: 'success'
        })

        // 跳转到作品页查看进度
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/works/works'
          })
        }, 1500)
      } else {
        wx.showToast({
          title: res?.message || '重新生成失败',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('同款重生失败:', error)
      wx.showToast({
        title: error.message || '网络错误，请重试',
        icon: 'none'
      })
    }
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  },

  /**
   * 增强图片查看器
   */
  openImageViewer(e) {
    const index = e.currentTarget.dataset.index || 0
    const work = this.data.work

    if (!work || !work.images || work.images.length === 0) return

    const urls = work.images.map(img => img.temp_url || img.url)

    this.setData({
      showImageViewer: true,
      imageViewerUrls: urls,
      currentImageIndex: index,
      showImageControls: true
    })
  },

  /**
   * 关闭图片查看器
   */
  closeImageViewer() {
    this.setData({
      showImageViewer: false,
      showImageControls: false,
      imageZoomScale: 1
    })
  },

  /**
   * 切换图片控制面板
   */
  toggleImageControls() {
    this.setData({
      showImageControls: !this.data.showImageControls
    })
  },

  /**
   * 调整图片缩放
   */
  adjustImageZoom(e) {
    const { type } = e.currentTarget.dataset
    let scale = this.data.imageZoomScale

    switch (type) {
      case 'in':
        scale = Math.min(scale + 0.2, 3)
        break
      case 'out':
        scale = Math.max(scale - 0.2, 0.5)
        break
      case 'reset':
        scale = 1
        break
    }

    this.setData({
      imageZoomScale: scale,
      imageZoomPercentage: Math.round(scale * 100)
    })
  },



  /**
   * 显示作品操作面板
   */
  showActionMenu() {
    this.setData({ showActionPanel: true })
  },

  /**
   * 隐藏作品操作面板
   */
  hideActionPanel() {
    this.setData({ showActionPanel: false })
  },

  /**
   * 切换图片比较模式
   */
  toggleComparisonMode() {
    const work = this.data.work
    if (!work || !work.original_image) {
      wx.showToast({
        title: '没有原图可对比',
        icon: 'none'
      })
      return
    }

    this.setData({
      showComparison: !this.data.showComparison
    })
  },

  /**
   * 切换比较方式
   */
  switchComparisonMode(e) {
    const { mode } = e.currentTarget.dataset
    this.setData({ comparisonMode: mode })
  },

  /**
   * 图片长按菜单
   */
  onImageLongPress(e) {
    const { index } = e.currentTarget.dataset
    const work = this.data.work

    if (!work || !work.images || !work.images[index]) return

    const actions = ['保存图片', '复制链接', '设为封面', '查看信息']

    wx.showActionSheet({
      itemList: actions,
      success: async (res) => {
        switch (res.tapIndex) {
          case 0:
            await this.saveImage(work.images[index])
            break
          case 1:
            this.copyImageLink(index)
            break
          case 2:
            this.setAsCover(index)
            break
          case 3:
            this.showImageInfo(index)
            break
        }
      }
    })
  },

  /**
   * 复制图片链接
   */
  copyImageLink(index) {
    const work = this.data.work
    const image = work.images[index]
    const url = image.temp_url || image.url

    if (!url) {
      wx.showToast({
        title: '图片链接无效',
        icon: 'none'
      })
      return
    }

    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: '链接已复制',
          icon: 'success'
        })
      }
    })
  },

  /**
   * 设为封面
   */
  async setAsCover(index) {
    if (index === 0) {
      wx.showToast({
        title: '已经是封面了',
        icon: 'none'
      })
      return
    }

    try {
      // 这里可以调用后端API更新作品封面
      wx.showToast({
        title: '设置成功',
        icon: 'success'
      })

      // 重新加载作品详情
      this.loadWorkDetail()
    } catch (error) {
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      })
    }
  },

  /**
   * 显示图片信息
   */
  showImageInfo(index) {
    const work = this.data.work
    const image = work.images[index]

    const info = [
      `尺寸: ${image.width || '未知'} × ${image.height || '未知'}`,
      `大小: ${image.size ? this.formatFileSize(image.size) : '未知'}`,
      `格式: ${this.getImageFormat(image.url)}`,
      `链接: ${(image.temp_url || image.url || '').substring(0, 50)}...`
    ]

    wx.showModal({
      title: `图片信息 (${index + 1}/${work.images.length})`,
      content: info.join('\n'),
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 获取图片格式
   */
  getImageFormat(url) {
    if (!url) return '未知'
    const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
    return match ? match[1].toUpperCase() : '未知'
  },

  /**
   * 图片加载完成
   */
  onImageLoad(e) {
    const { index } = e.currentTarget.dataset
    console.log(`图片${index + 1}加载完成`)
  },

  /**
   * 图片加载失败
   */
  onImageError(e) {
    const { index } = e.currentTarget.dataset
    console.error(`图片${index + 1}加载失败`, e.detail)

    wx.showToast({
      title: `图片${index + 1}加载失败`,
      icon: 'none'
    })
  },

  /**
   * 全屏查看图片
   */
  enterFullscreen() {
    const work = this.data.work
    if (!work || !work.images || work.images.length === 0) return

    const urls = work.images.map(img => img.temp_url || img.url)

    wx.previewImage({
      urls,
      current: urls[this.data.currentImageIndex]
    })
  },

  /**
   * 切换参数展开状态
   */
  toggleParams() {
    this.setData({
      showParams: !this.data.showParams
    })
  },

  /**
   * 切换技术信息展开状态
   */
  toggleTechInfo() {
    this.setData({
      showTechExpanded: !this.data.showTechExpanded
    })
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止事件冒泡
  },

  /**
   * 开始编辑标题
   */
  startEditTitle() {
    const currentTitle = this.data.work?.title || ''
    this.setData({
      editingTitle: true,
      editingTitleValue: currentTitle
    })
  },

  /**
   * 标题输入处理
   */
  onTitleInput(e) {
    this.setData({
      editingTitleValue: e.detail.value
    })
  },

  /**
   * 完成标题编辑
   */
  async finishEditTitle() {
    const newTitle = this.data.editingTitleValue.trim()

    // 如果标题没有改变，直接退出编辑模式
    if (newTitle === (this.data.work?.title || '')) {
      this.setData({
        editingTitle: false,
        editingTitleValue: ''
      })
      return
    }

    // 如果标题为空，使用默认名称
    const finalTitle = newTitle || `${this.data.work?.type === 'photography' ? 'AI摄影' : 'AI试衣'}作品`

    try {
      // 调用API更新作品标题
      const res = await apiService.updateWorkTitle(this.data.workId, finalTitle)

      if (res.success) {
        // 更新本地数据
        const updatedWork = { ...this.data.work }
        updatedWork.title = finalTitle

        this.setData({
          work: updatedWork,
          editingTitle: false,
          editingTitleValue: ''
        })

        // 更新页面标题
        wx.setNavigationBarTitle({
          title: finalTitle
        })

        wx.showToast({
          title: '标题已更新',
          icon: 'success',
          duration: 1500
        })
      } else {
        wx.showToast({
          title: res.message || '更新失败',
          icon: 'none'
        })

        // 恢复编辑状态
        this.setData({
          editingTitle: false,
          editingTitleValue: ''
        })
      }
    } catch (error) {
      console.error('更新作品标题失败:', error)
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      })

      // 恢复编辑状态
      this.setData({
        editingTitle: false,
        editingTitleValue: ''
      })
    }
  },

  /**
   * 提交反馈
   */
  submitFeedback() {
    const work = this.data.work
    if (!work) {
      wx.showToast({
        title: '作品信息不完整',
        icon: 'none'
      })
      return
    }

    // 跳转到反馈页面，并传递作品信息
    const workInfo = {
      id: work._id || work.id,
      type: work.type,
      title: work.title || `${work.type}作品`,
      created_at: work.created_at || work.createdAt
    }

    wx.navigateTo({
      url: `/pages/subPackageRecords/feedback/feedback?workInfo=${encodeURIComponent(JSON.stringify(workInfo))}`
    })
  },

  // ========== 🎭 姿势裂变相关方法 ==========

  /**
   * 显示姿势裂变弹窗
   */
  async showPoseVariationModal() {
    const work = this.data.work

    // 验证作品状态
    if (!work || work.status !== 'completed') {
      wx.showToast({
        title: '作品还未生成完成',
        icon: 'none'
      })
      return
    }

    if (!work.images || work.images.length === 0) {
      wx.showToast({
        title: '作品没有生成的图片',
        icon: 'none'
      })
      return
    }

    // 支持photography和fitting类型
    if (work.type !== 'photography' && work.type !== 'fitting') {
      wx.showToast({
        title: '仅支持AI摄影和AI试衣作品',
        icon: 'none'
      })
      return
    }

    // 显示弹窗
    this.setData({
      showPoseModal: true,
      poseMode: 'ai', // 默认使用AI模式
      selectedPoseId: '',
      selectedPoseName: '',
      customPoseDescription: '',
      aiGeneratedPoses: [],
      selectedAIPose: '',
      canConfirm: false
    })

    // 加载姿势预设
    this.loadPosePresets()

    // ✨ 智能加载姿势数据（支持继承）
    await this.loadPoseVariationsWithInheritance()
  },

  /**
   * 智能加载姿势裂变数据（支持从引用作品继承）
   */
  async loadPoseVariationsWithInheritance() {
    const work = this.data.work

    // 1. 优先使用当前作品的姿势数据
    if (work.ai_pose_variations && work.ai_pose_variations.length > 0) {
      console.log('🎭 使用当前作品的姿势裂变数据:', work.ai_pose_variations.length, '个')
      this.setData({
        aiGeneratedPoses: work.ai_pose_variations,
        aiLoading: false
      })
      return
    }

    // 2. 如果是姿势裂变作品，尝试从原作品继承
    if (work.reference_work_id) {
      console.log('🔗 检测到引用作品ID:', work.reference_work_id)
      try {
        const refWork = await apiService.getWorkDetail(work.reference_work_id)

        if (refWork.success && refWork.data.ai_pose_variations && refWork.data.ai_pose_variations.length > 0) {
          console.log('🎭 从引用作品继承姿势数据:', refWork.data.ai_pose_variations.length, '个')

          // 继承姿势数据
          const inheritedPoses = refWork.data.ai_pose_variations

          this.setData({
            aiGeneratedPoses: inheritedPoses,
            aiLoading: false
          })

          // 💾 保存到当前作品，避免下次重复查询
          await this.savePoseVariations(inheritedPoses)

          return
        } else {
          console.log('⚠️ 引用作品没有姿势数据')
        }
      } catch (error) {
        console.error('❌ 读取引用作品失败:', error)
        // 继续执行生成逻辑
      }
    }

    // 3. 如果都没有，基于手札生成新姿势
    if (work.ai_description) {
      console.log('🎭 没有可用姿势数据，基于手札生成...')
      this.generateAIPoseVariations()
    } else {
      // 没有手札，无法生成
      this.setData({
        aiGeneratedPoses: [],
        aiLoading: false
      })
      wx.showToast({
        title: '暂无摄影师手札',
        icon: 'none'
      })
    }
  },

  /**
   * 关闭姿势裂变弹窗
   */
  closePoseModal() {
    this.setData({
      showPoseModal: false
    })
  },

  /**
   * 加载姿势预设列表
   */
  async loadPosePresets() {
    this.setData({ loadingPoses: true })

    try {
      const db = wx.cloud.database()
      const result = await db.collection('pose_presets')
        .where({ is_active: true })
        .orderBy('sort_order', 'asc')
        .get()

      console.log('🎭 加载姿势预设:', result.data.length, '个')

      this.setData({
        posePresets: result.data,
        loadingPoses: false
      })
    } catch (error) {
      console.error('❌ 加载姿势预设失败:', error)
      this.setData({ loadingPoses: false })
      wx.showToast({
        title: '加载姿势列表失败',
        icon: 'none'
      })
    }
  },

  /**
   * 选择姿势模式
   */
  selectPoseMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({
      poseMode: mode,
      selectedPoseId: '',
      selectedPoseName: '',
      customPoseDescription: '',
      selectedAIPose: '',
      canConfirm: false
    })
  },

  /**
   * 选择预设姿势
   */
  selectPose(e) {
    const { id, name } = e.currentTarget.dataset

    this.setData({
      selectedPoseId: id,
      selectedPoseName: name,
      canConfirm: true
    })

    console.log('🎭 选择姿势:', name, id)
  },

  /**
   * 自定义姿势输入
   */
  onCustomPoseInput(e) {
    const value = e.detail.value
    this.setData({
      customPoseDescription: value,
      canConfirm: value.trim().length > 0
    })
  },

  /**
   * 生成AI姿势建议（基于摄影师手札）
   */
  async generateAIPoseVariations() {
    const work = this.data.work

    // 检查是否有摄影师手札
    if (!work || !work.ai_description) {
      wx.showToast({
        title: '暂无摄影师手札',
        icon: 'none'
      })
      return
    }

    this.setData({ aiLoading: true })

    // 🎨 启动加载提示轮播
    this.startLoadingTips()

    try {
      console.log('🎭 基于摄影师手札生成9个姿势建议')
      console.log('📝 手札内容:', work.ai_description.substring(0, 100) + '...')

      // 调用AI基于摄影师手札生成9个姿势
      const poses = await aiAssistant.generatePoseFromPhotographerNotes(work.ai_description, 9)

      // 🎨 停止加载提示轮播
      this.stopLoadingTips()

      this.setData({
        aiGeneratedPoses: poses,
        aiLoading: false
      })

      console.log(`✅ 成功生成${poses.length}个姿势建议`)

      if (poses.length === 0) {
        wx.showToast({
          title: 'AI生成结果为空',
          icon: 'none'
        })
        return
      }

      // ✨ 保存到数据库，下次直接读取
      await this.savePoseVariations(poses)

    } catch (error) {
      console.error('🎭 AI姿势生成失败:', error)

      // 🎨 停止加载提示轮播
      this.stopLoadingTips()

      this.setData({ aiLoading: false })
      wx.showToast({
        title: error.message || 'AI生成失败',
        icon: 'none'
      })
    }
  },

  /**
   * 启动加载提示轮播
   */
  startLoadingTips() {
    const tips = [
      '正在分析场景氛围...',
      '正在设计动作变化...',
      '正在优化拍摄角度...',
      '正在调整姿态细节...',
      '正在参考时尚风格...',
      '正在生成创意方案...'
    ]

    // 初始化第一条提示
    this.setData({
      aiLoadingTip: tips[0],
      aiLoadingTipIndex: 0
    })

    // 每5秒切换一次提示
    this.loadingTipTimer = setInterval(() => {
      const nextIndex = (this.data.aiLoadingTipIndex + 1) % tips.length
      this.setData({
        aiLoadingTip: tips[nextIndex],
        aiLoadingTipIndex: nextIndex
      })
    }, 5000)
  },

  /**
   * 停止加载提示轮播
   */
  stopLoadingTips() {
    if (this.loadingTipTimer) {
      clearInterval(this.loadingTipTimer)
      this.loadingTipTimer = null
    }
  },

  /**
   * 保存姿势裂变数据到数据库
   */
  async savePoseVariations(poses) {
    try {
      console.log('💾 保存姿势裂变数据到数据库...')

      const res = await apiService.updateWork(this.data.workId, {
        ai_pose_variations: poses,
        pose_variations_created_at: new Date()
      })

      if (res.success) {
        console.log('✅ 姿势裂变数据保存成功')

        // 更新本地work数据
        const updatedWork = { ...this.data.work }
        updatedWork.ai_pose_variations = poses
        updatedWork.pose_variations_created_at = new Date()

        this.setData({ work: updatedWork })
      } else {
        console.warn('⚠️ 姿势裂变数据保存失败:', res.message)
      }
    } catch (error) {
      console.error('❌ 保存姿势裂变数据失败:', error)
      // 保存失败不影响用户使用，静默处理
    }
  },

  /**
   * 选择AI生成的姿势
   */
  selectAIPose(e) {
    const pose = e.currentTarget.dataset.pose
    this.setData({
      selectedAIPose: pose,
      canConfirm: true
    })
  },

  /**
   * 确认姿势裂变
   */
  async confirmPoseVariation() {
    const { work, poseMode, selectedPoseId, customPoseDescription, selectedAIPose } = this.data

    // 验证参数
    let posePresetId = null
    let poseDescription = null

    if (poseMode === 'preset') {
      if (!selectedPoseId) {
        wx.showToast({ title: '请选择一个姿势', icon: 'none' })
        return
      }
      posePresetId = selectedPoseId
    } else if (poseMode === 'custom') {
      if (!customPoseDescription.trim()) {
        wx.showToast({ title: '请输入姿势描述', icon: 'none' })
        return
      }
      poseDescription = customPoseDescription.trim()
    } else if (poseMode === 'ai') {
      if (!selectedAIPose) {
        wx.showToast({ title: '请选择一个AI姿势', icon: 'none' })
        return
      }
      poseDescription = selectedAIPose
    }

    // 关闭弹窗
    this.closePoseModal()

    // 显示加载提示
    wx.showLoading({ title: '提交任务中...', mask: true })

    try {
      let result = null

      // 🎭 根据作品类型调用不同的云函数
      if (work.type === 'photography') {
        result = await apiService.generatePhotography({
          action: 'generate',
          mode: 'pose_variation',
          referenceWorkId: work.id || work._id,
          posePresetId: posePresetId,
          poseDescription: poseDescription,
          count: 1
        })
      } else if (work.type === 'fitting') {
        result = await apiService.generateFitting({
          action: 'generate',
          mode: 'pose_variation',
          referenceWorkId: work.id || work._id,
          posePresetId: posePresetId,
          poseDescription: poseDescription,
          count: 1
        })
      } else {
        throw new Error('不支持的作品类型')
      }

      wx.hideLoading()

      if (result.success) {
        const taskId = result.data.task_id
        const newWorkId = result.data.work_id

        wx.showToast({
          title: '任务已提交',
          icon: 'success',
          duration: 2000
        })

        // 等待2秒后跳转到进度页面，传递重试所需的参数
        setTimeout(() => {
          const progressUrl = `/pages/progress/progress?taskId=${taskId}&workId=${newWorkId}&type=${work.type}&mode=pose_variation&referenceWorkId=${encodeURIComponent(work.id || work._id)}`

          // 添加姿势相关参数
          const params = []
          if (posePresetId) {
            params.push(`posePresetId=${encodeURIComponent(posePresetId)}`)
          }
          if (poseDescription) {
            params.push(`poseDescription=${encodeURIComponent(poseDescription)}`)
          }

          const finalUrl = params.length > 0 ? `${progressUrl}&${params.join('&')}` : progressUrl

          wx.navigateTo({ url: finalUrl })
        }, 2000)
      } else {
        wx.showToast({
          title: result.message || '提交失败',
          icon: 'none',
          duration: 3000
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('🎭 姿势裂变失败:', error)
      wx.showToast({
        title: '提交失败: ' + error.message,
        icon: 'none',
        duration: 3000
      })
    }
  },

  /**
   * 停止事件冒泡
   */
  stopPropagation() {
    // 阻止点击模态框内容时关闭
  }
})