// 作品页面
const apiService = require('../../utils/api.js')
const WatermarkUtil = require('../../utils/watermark.js')
const app = getApp()

// 浅比较函数，用于避免不必要的setData
function shallowEqual(objA, objB) {
  if (objA === objB) return true;
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (let key of keysA) {
    if (objA[key] !== objB[key]) return false;
  }
  return true;
}

Page({
  // 页面路径（用于全局轮询管理）
  pagePath: 'pages/works/works',

  // 私有字段，用于JS层管理完整数据，避免频繁setData大数组
  _works: null,
  _isPageVisible: true,
  _pollingTimers: null,          // 在onLoad中初始化为Set
  _activeTaskPolling: null,      // 在onLoad中初始化为Set
  _multiPollingActive: false,    // 多任务轮询幂等性检查
  _notifiedTasks: null,          // 在onLoad中初始化为Set
  _watcher: null,                // 数据库实时监听器
  _notifiedWorks: null,          // 已通知的作品ID集合（防止重复提示）

  // 性能优化缓存
  _urlCache: new Map(),          // URL转换缓存
  _batchProcessing: false,       // 批量处理状态标识

  /**
   * 优化的setData包装，支持批处理和节流（2024年最佳实践）
   */
  setDataSafe(data, callback) {
    // 避免无意义的setData调用
    if (!data || Object.keys(data).length === 0) {
      return
    }

    // 如果是高优先级更新（如用户交互），直接执行
    if (callback || this._immediateUpdate) {
      this._immediateUpdate = false
      return this._performSetData(data, callback)
    }

    // 🔧 防御性检查：确保队列已初始化
    if (!this.setDataQueue) {
      console.warn('⚠️ setDataQueue未初始化，重新初始化')
      this.setDataQueue = []
    }

    // 批处理队列处理
    this.setDataQueue.push(data)

    // 清除已有的延迟定时器
    if (this.setDataTimer) {
      clearTimeout(this.setDataTimer)
    }

    // 设置节流定时器
    this.setDataTimer = setTimeout(() => {
      this._processBatchedSetData()
    }, this.SETDATA_THROTTLE)
  },

  /**
   * 处理批量setData更新
   */
  _processBatchedSetData() {
    if (this.setDataQueue.length === 0) return

    // 合并队列中的所有数据
    const mergedData = this.setDataQueue.reduce((acc, data) => {
      return { ...acc, ...data }
    }, {})

    // 清空队列
    this.setDataQueue = []
    this.setDataTimer = null

    // 执行合并后的setData
    this._performSetData(mergedData)
  },

  /**
   * 实际执行setData的函数
   */
  _performSetData(data, callback) {
    // 开发环境下监控setData大小
    try {
      const appBaseInfo = wx.getAppBaseInfo();
      if (appBaseInfo && appBaseInfo.host && appBaseInfo.host.env === 'develop') {
        const dataSize = JSON.stringify(data).length;
        if (dataSize > 256 * 1024) { // 256KB阈值
          console.warn('setData数据量过大:', dataSize, 'bytes', Object.keys(data));
        } else if (dataSize > 128 * 1024) { // 128KB提醒
          console.info('setData数据量较大:', dataSize, 'bytes');
        }
      }
    } catch (e) {
      // 忽略错误，正常执行setData
    }

    return this.setData(data, callback);
  },

  /**
   * 立即执行setData（跳过批处理）
   */
  setDataImmediate(data, callback) {
    this._immediateUpdate = true
    return this.setDataSafe(data, callback)
  },

  /**
   * 安全的进度卡片更新，包含对比和节流
   */
  updateProgressCardSafely(newData) {
    if (shallowEqual(this.data.progressCard, newData)) {
      return; // 数据无变化，跳过更新
    }
    this.setDataSafe({ progressCard: newData });
  },

  /**
   * 比较两个进度列表是否相等（深度比较关键字段）
   */
  isProgressListEqual(listA, listB) {
    if (!Array.isArray(listA) || !Array.isArray(listB)) return false
    if (listA.length !== listB.length) return false

    for (let i = 0; i < listA.length; i++) {
      const a = listA[i]
      const b = listB[i]

      // 比较关键字段
      if (a.taskId !== b.taskId ||
          a.percent !== b.percent ||
          a.status !== b.status ||
          a.message !== b.message ||
          a.etaText !== b.etaText ||
          a.completed !== b.completed ||
          a.total !== b.total) {
        return false
      }
    }
    return true
  },

  /**
   * 检查页面是否可见
   */
  isPageVisible() {
    const pages = getCurrentPages();
    return pages.length > 0 && pages[pages.length - 1].route === 'pages/works/works';
  },

  /**
   * 安全的定时器管理
   */
  setSafeInterval(callback, interval) {
    const timer = setInterval(() => {
      if (this._isPageVisible && this.isPageVisible()) {
        callback();
      }
    }, interval);
    this._pollingTimers.add(timer);
    return timer;
  },

  /**
   * 清理所有定时器
   */
  clearAllTimers() {
    // 安全地清理定时器集合
    if (this._pollingTimers && typeof this._pollingTimers.forEach === 'function') {
      this._pollingTimers.forEach(timer => {
        clearInterval(timer);
        clearTimeout(timer);
      });
      this._pollingTimers.clear();
    }

    // 清理多任务轮询定时器
    if (this.multiPollingTimer) {
      clearInterval(this.multiPollingTimer);
      this.multiPollingTimer = null;
    }

    // 清理单任务轮询定时器
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    // 重置轮询状态
    this._pollingStarted = false;
    this._multiPollingActive = false;
    this._justCompletedPolling = false;

    // 安全地清理任务轮询集合
    if (this._activeTaskPolling && typeof this._activeTaskPolling.clear === 'function') {
      this._activeTaskPolling.clear();
    }
  },
  // 工具：时间格式化
  formatTimestamp(ts) {
    try {
      if (!ts) return '';
      const d = typeof ts === 'number' ? new Date(ts) : new Date(ts._seconds ? ts._seconds * 1000 : ts);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) {
      return '';
    }
  },

  // 获取有效的图片URL
  getValidImageUrl(imgObj) {
    if (!imgObj) return '';

    // 如果imgObj本身就是字符串（直接URL）
    if (typeof imgObj === 'string') {
      return imgObj;
    }

    // 优先使用临时URL（上传中图片或AI生成图片）
    if (imgObj.temp_url && typeof imgObj.temp_url === 'string') {
      return imgObj.temp_url;
    }

    // 其次使用云存储URL
    if (imgObj.url && typeof imgObj.url === 'string') {
      return imgObj.url;
    }

    // 其他可能的字段
    const possibleFields = ['fileID', 'file_id', 'thumbnail_url', 'cloud_url', 'cover_url', 'thumbnail'];
    for (const field of possibleFields) {
      if (imgObj[field] && typeof imgObj[field] === 'string') {
        return imgObj[field];
      }
    }

    return '';
  },

  // 获取可在小程序中显示的图片URL（处理云存储文件ID）
  async getDisplayableImageUrl(imgObj) {
    const url = this.getValidImageUrl(imgObj);
    if (!url) return '';

    // 如果是HTTPS URL，直接返回
    if (url.startsWith('https://') || url.startsWith('http://')) {
      return url;
    }

    // 如果是云存储文件ID，转换为临时URL
    if (url.startsWith('cloud://')) {
      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: [url]
        });

        if (result.fileList && result.fileList[0] && result.fileList[0].tempFileURL) {
          let tempUrl = result.fileList[0].tempFileURL;

          // 注意：缩略图不添加水印以提升性能
          // 水印会在作品详情页（work-detail）通过Canvas添加

          return tempUrl;
        }
      } catch (error) {
        console.warn('获取临时URL失败:', error);
      }
    }

    // 兜底：返回原URL（可能无法显示，但不会破坏功能）
    return url;
  },

  // 去重作品数据（基于ID）
  deduplicateWorks(works) {
    const seen = new Set()
    const unique = []
    for (const work of works) {
      if (work.id && !seen.has(work.id)) {
        seen.add(work.id)
        unique.push(work)
      }
    }
    if (unique.length !== works.length) {
      console.warn(`作品列表去重：${works.length} -> ${unique.length}`)
    }
    return unique
  },

  // 过滤模拟数据（可选，用于临时隐藏placeholder图片）
  filterMockData(works, enableFilter = false) {
    if (!enableFilter) return works

    const filtered = works.filter(work => {
      // 检查是否为模拟数据
      const hasMockImages = work.images && work.images.some(img =>
        img.url && (
          img.url.includes('via.placeholder.com') ||
          img.url.includes('placeholder.com') ||
          (img.metadata && img.metadata.model === 'mock-fashion-ai-v1.0')
        )
      )

      const hasMockThumbnail = work.thumbnail && (
        work.thumbnail.includes('via.placeholder.com') ||
        work.thumbnail.includes('placeholder.com')
      )

      return !hasMockImages && !hasMockThumbnail
    })

    if (filtered.length !== works.length) {
      console.warn(`过滤模拟数据：${works.length} -> ${filtered.length}`)
    }

    return filtered
  },

  // 规范化后端返回的作品数据（兼容 api.listWorks 与旧接口）
  /**
   * 批量获取云存储临时URL（性能优化）
   */
  async batchGetTempUrls(urls) {
    if (!urls || urls.length === 0) return new Map();

    const urlMap = new Map();
    const uncachedUrls = [];

    // 确保缓存初始化
    if (!this._urlCache) {
      this._urlCache = new Map();
    }

    // 检查缓存（支持带时间戳的缓存数据）
    const CACHE_TTL = 23 * 60 * 60 * 1000; // 🎯 优化：23小时（微信临时链接有效期24小时，预留1小时缓冲）
    const now = Date.now();

    for (const url of urls) {
      if (this._urlCache.has(url)) {
        const cached = this._urlCache.get(url);
        // 兼容新旧缓存格式
        if (typeof cached === 'string') {
          // 旧格式：直接是URL字符串
          urlMap.set(url, cached);
        } else if (cached && cached.url && cached.timestamp) {
          // 新格式：包含时间戳的对象
          if (now - cached.timestamp < CACHE_TTL) {
            urlMap.set(url, cached.url);
          } else {
            // 缓存过期，需要重新获取
            this._urlCache.delete(url);
            uncachedUrls.push(url);
          }
        } else {
          // 格式异常，重新获取
          this._urlCache.delete(url);
          uncachedUrls.push(url);
        }
      } else if (url && url.startsWith('cloud://')) {
        uncachedUrls.push(url);
      } else {
        urlMap.set(url, url); // 非云存储URL直接使用
      }
    }

    // 批量获取未缓存的URL（考虑微信50个文件限制）
    if (uncachedUrls.length > 0) {
      const BATCH_SIZE = 50; // 微信API限制每次最多50个文件
      const batchCount = Math.ceil(uncachedUrls.length / BATCH_SIZE);
      console.log(`批量获取 ${uncachedUrls.length} 个云存储URL，分${batchCount}批并发处理`);

      // 🚀 性能优化：并发处理所有批次，而非串行
      const batchPromises = [];
      for (let i = 0; i < uncachedUrls.length; i += BATCH_SIZE) {
        const batch = uncachedUrls.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

        const batchPromise = this.retryWithBackoff(async () => {
          return await wx.cloud.getTempFileURL({
            fileList: batch.map(url => ({
              fileID: url,
              maxAge: 86400 // 🎯 优化：24小时有效期（从2小时延长）
            }))
          })
        }, { maxRetries: 2, baseDelay: 300 })
        .then(result => {
          if (result.fileList) {
            result.fileList.forEach(file => {
              const tempUrl = file.status === 0 ? file.tempFileURL : file.fileID;
              // 添加时间戳进行缓存管理
              this._urlCache.set(file.fileID, {
                url: tempUrl,
                timestamp: Date.now()
              });
              urlMap.set(file.fileID, tempUrl);
            });
          }
          console.log(`✅ 批次 ${batchIndex}/${batchCount} 完成`);
        })
        .catch(error => {
          console.warn(`⚠️ 批次 ${batchIndex}/${batchCount} 获取临时URL失败:`, error);
          // 失败时使用原始URL
          batch.forEach(url => {
            urlMap.set(url, url);
          });
        });

        batchPromises.push(batchPromise);
      }

      // 🚀 性能优化：等待所有批次并发完成
      await Promise.all(batchPromises);
      console.log(`✅ 所有${batchCount}个批次并发处理完成`);
    }

    return urlMap;
  },

  /**
   * 异步分片处理数据（性能优化）
   */
  async normalizeWorksData(list, options = {}) {
    if (!list || list.length === 0) return [];

    const { isFirstLoad = false, batchSize = 6 } = options;
    const fmt = this.formatTimestamp;

    // 收集所有需要转换的URL
    const allUrls = new Set();
    for (const w of list) {
      const cover = w.cover_url || w.thumbnail || '';
      if (cover) allUrls.add(cover);

      const images = Array.isArray(w.images) ? w.images : [];
      for (const img of images) {
        const url = this.getValidImageUrl(img);
        if (url) allUrls.add(url);
      }
    }

    // 批量获取临时URL
    const urlMap = await this.batchGetTempUrls(Array.from(allUrls));

    // 分片处理数据，避免主线程阻塞
    const normalizedWorks = [];

    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);

      for (const w of batch) {
        const id = w._id || w.id || w.work_id;
        const cover = w.cover_url || w.thumbnail || '';
        const created = w.created_time || w.create_time || w.createdAt || w.created_at || w.createTime;
        const images = Array.isArray(w.images)
          ? w.images
          : (w.images && typeof w.images === 'object'
              ? Object.values(w.images)
              : []);

        // 快速处理图片数组
        const normImages = [];
        for (const img of images) {
          const originalUrl = this.getValidImageUrl(img);
          if (originalUrl) {
            const displayUrl = urlMap.get(originalUrl) || originalUrl;
            const safeUrl = app.globalData.imageHandler ?
              app.globalData.imageHandler.getSafeImageUrl(displayUrl, 'work') : displayUrl;
            normImages.push({
              url: safeUrl,
              originalUrl: originalUrl
            });
          }
        }

        // 获取缩略图（使用优化的缩略图URL，已包含水印参数）
        let thumbnail = '';
        if (cover) {
          const displayUrl = urlMap.get(cover) || cover;
          // 生成优化的缩略图URL（getThumbnailUrl已经包含水印参数）
          if (app.globalData.imageHandler) {
            thumbnail = app.globalData.imageHandler.getThumbnailUrl(displayUrl, 'medium');
          } else {
            thumbnail = displayUrl;
          }
        } else if (normImages.length > 0) {
          // 对第一张图片也应用优化（getThumbnailUrl已经包含水印参数）
          if (app.globalData.imageHandler) {
            thumbnail = app.globalData.imageHandler.getThumbnailUrl(normImages[0].url, 'medium');
          } else {
            thumbnail = normImages[0].url;
          }
        }

        if (!thumbnail && app.globalData.imageHandler) {
          thumbnail = app.globalData.imageHandler.getDefaultImage('work');
        }

        // 计算当前项在整个列表中的索引位置
        const currentIndex = normalizedWorks.length;

        normalizedWorks.push({
          ...w,
          id,
          images: normImages,
          thumbnail: thumbnail,
          display_time: w.display_time || fmt(created),
          description_text: (w.description || w.desc || ''),
          // 优化加载策略：
          // - 首次加载(isFirstLoad=true)时，前6个立即显示
          // - 加载更多(isFirstLoad=false)时，全部通过懒加载
          shouldLoad: isFirstLoad ? (currentIndex < 6) : false
        });
      }

      // 给UI线程喜息机会，避免阻塞（只在非最后一批时执行）
      if (i + batchSize < list.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    return normalizedWorks;
  },

  // 获取当前 tab 的 key
  getCurrentTabKey() {
    const t = this.data.tabs[this.data.currentTab];
    return t ? t.key : 'all';
  },

  // 优先加载缓存（首屏秒开）
  async loadCacheForCurrentTab() {
    try {
      const key = this.getCurrentTabKey();
      const cache = wx.getStorageSync('works_cache_' + key);
      if (cache && Array.isArray(cache.list)) {
        const works = await this.normalizeWorksData(cache.list, {
          isFirstLoad: true // 缓存也算首次加载
        });
        // 使用直接setData，避免批处理延迟
        this.setData({
          works,
          isEmpty: works.length === 0,
          lastRefreshAt: cache.ts || 0,
          firstLoadDone: false // 保持false，等真正加载完成再设置
        });
        this._works = works;
      }
    } catch (_) {}
  },

  // 基于提交起点的阶段估算（10分钟四阶段，15分钟超时）
  computeStage(elapsedMs, totalMs = 10 * 60 * 1000) {
    const TIMEOUT_MS = 15 * 60 * 1000; // 15分钟超时

    // 检查是否超时
    if (elapsedMs >= TIMEOUT_MS) {
      return {
        stage: 'timeout',
        message: '任务超时，请重试',
        percent: 0,
        etaText: '已超时',
        timeout: true
      };
    }

    const clamp = (n) => Math.max(0, Math.min(100, n));
    const percent = clamp(Math.floor((elapsedMs / totalMs) * 100));
    let stage = 'planning';
    let message = '摄影师正在设计拍摄计划…';
    if (elapsedMs >= 2 * 60 * 1000 && elapsedMs < 6 * 60 * 1000) {
      stage = 'shooting';
      message = '摄影师正在拍摄…';
    } else if (elapsedMs >= 6 * 60 * 1000 && elapsedMs < 9 * 60 * 1000) {
      stage = 'retouch';
      message = '摄影师正在修图…';
    } else if (elapsedMs >= 9 * 60 * 1000 && elapsedMs < 10 * 60 * 1000) {
      stage = 'uploading';
      message = '摄影师已完成拍摄，正在上传作品…';
    }
    const remainMs = Math.max(0, totalMs - elapsedMs);
    const mm = String(Math.floor(remainMs / 60000)).padStart(2, '0');
    const ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
    const etaText = `约${mm}:${ss}`;
    return { stage, message, percent, etaText, timeout: false };
  },

  data: {
    // 作品数据
    works: [],
    loading: false,
    hasMore: true,
    // 分页游标
    last_id: null,
    last_created_at: null,
    pageSize: 12,
    
    // 缓存与刷新节流
    lastRefreshAt: 0,
    firstLoadDone: false,
    
    // 筛选条件
    currentTab: 0,
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'photography', label: '服装摄影' },
      { key: 'fitting', label: '模特换装' },
      { key: 'fitting-personal', label: '个人试衣' },
      { key: 'travel', label: '全球旅行' },
      { key: 'favorite', label: '我的收藏' }
    ],
    
    // 排序方式
    sortType: 'create_time', // create_time, favorite_time
    
    // 页面状态
    isEmpty: false,
    showFilterPanel: false,

    // 进行中卡片（单任务）
    progressCard: {
      visible: false,
      stage: 'planning', // planning | shooting | retouch | uploading | failed
      message: '',
      percent: 0,
      etaText: '',
      completed: null,
      total: null
    },

    // 多任务进行中列表
    progressList: [], // [{ taskId, startedAt, stage, message, percent, etaText, completed, total, status }]
    
    // 轮询节流/计时
    _pollTick: 0,
    _taskStartAt: 0,
    _multiPollTick: 0
  },

  onLoad(options) {
    // 初始化复杂类型对象（避免Free data警告）
    this._pollingTimers = new Set()
    this._activeTaskPolling = new Set()
    this._notifiedTasks = new Set()
    this._notifiedWorks = new Set()  // 初始化已通知作品集合

    // 确保缓存初始化
    if (!this._urlCache) {
      this._urlCache = new Map()
    }

    // 初始化轮询状态
    this._pollingStarted = false;

    // 初始化内存管理（2024年最佳实践）
    this.initMemoryManagement();

    // 启用图片懒加载优化 - 移到数据加载完成后初始化
    // this.initLazyLoading();
    
    // 首屏优先渲染缓存，减少白屏与抖动
    this.loadCacheForCurrentTab();
    // 若带入单个 taskId，加入多任务队列
    if (options && options.taskId) {
      console.log(`works.js: onLoad 收到 taskId: ${options.taskId}，加入多任务列表`);
      this.addPendingTasks([{ taskId: options.taskId, createdAt: Date.now() }], { startPolling: true, hideGlobalLoading: true });
      return;
    }

    // 尝试从本地读取 pendingTasks（数组）与 legacy pendingTask（单个），进行合并
    this.loadPendingTasksFromStorage();

    // 如有进行中任务，启动多任务轮询；否则常规加载列表
    if (this.data.progressList.length > 0) {
      if (!this._multiPollingActive) {
        this.startMultiPolling();
      }
    } else {
      this.loadWorks();
    }

    // 启动实时监听
    this.startRealtimeWatch();
  },

  onShow() {
    // 更新自定义TabBar（先刷新列表，再设置选中）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const mode = wx.getStorageSync('app_mode') || 'commercial'
      const tabBar = this.getTabBar()

      // 刷新TabBar的tab列表
      if (tabBar.updateList) {
        tabBar.updateList()
      }

      // 设置选中状态
      const selected = mode === 'commercial' ? 1 : 2 // 商业=1, 个人=2
      tabBar.setData({ selected })
    }

    this._isPageVisible = true;

    // 🔧 防御性检查：确保关键数据结构已初始化
    if (!this.setDataQueue) {
      this.setDataQueue = []
    }

    // 检查是否需要切换到指定tab（从progress页面跳转过来）
    const app = getApp()
    if (app.globalData.worksDefaultTab !== undefined) {
      const targetTab = app.globalData.worksDefaultTab
      delete app.globalData.worksDefaultTab // 使用后清除
      if (targetTab !== this.data.currentTab) {
        this.switchTab({ currentTarget: { dataset: { index: targetTab } } })
        return // 切换tab后会触发loadWorks，直接返回
      }
    }

    // 临时修复：清理可能的错误任务存储
    this.cleanupInvalidTasks();
    // 合并本地新增任务
    this.loadPendingTasksFromStorage();

    if (this.data.progressList.length > 0) {
      // 有进行中任务：开启/恢复多任务轮询（避免重复启动）
      if (!this._multiPollingActive) {
        this.startMultiPolling();
      }
    } else {
      // 无进行中任务：做节流，避免每次切页都刷新
      const now = Date.now();
      const within1min = now - (this.data.lastRefreshAt || 0) < 60 * 1000;

      if (this.data.works.length > 0 && within1min) {
        // 1分钟内再次进入，不刷新，直接展示
        return;
      }

      if (this.data.works.length > 0 && !within1min) {
        this.refreshWorks();
      } else {
        this.loadWorks();
      }
    }
  },

  onHide() {
    this._isPageVisible = false;
    // 进入后台时清理所有定时器，避免页面不在前台还继续轮询
    this.clearAllTimers();
  },

  onPullDownRefresh() {
    this.refreshWorks()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  /**
   * 加载作品列表
   */
  async loadWorks() {
    if (this.data.loading) return

    // 只在加载更多时设置loading，首次加载不设置（避免闪烁）
    if (this.data.last_id) {
      this.setDataSafe({ loading: true })
    }

    try {
      const tabKey = this.data.tabs[this.data.currentTab]?.key || 'all'
      const res = await apiService.listWorks({
        tab: tabKey,
        onlyCompleted: false,
        pageSize: this.data.pageSize,
        last_id: this.data.last_id,
        last_created_at: this.data.last_created_at
      })

      if (res && res.success) {
        // 适配后端数据格式：data 可能是数组(新格式)或包含items的对象(旧格式)
        const rawItems = Array.isArray(res.data) ? res.data : (res.data?.items || [])
        const works = await this.normalizeWorksData(rawItems, {
          isFirstLoad: !this.data.last_id // 首次加载时启用立即显示
        })
        
        // 缓存首屏
        if (!this.data.last_id) {
          try {
            wx.setStorageSync('works_cache_' + tabKey, { list: rawItems, ts: Date.now() })
          } catch (_) {}
        }

        // 使用增量更新避免concat操作，并进行去重
        if (this.data.last_id) {
          // 加载更多：先去重，再使用keyPath增量追加
          const existingIds = new Set(this.data.works.map(w => w.id))
          const newWorks = works.filter(w => !existingIds.has(w.id))

          if (newWorks.length > 0) {
            const baseLength = this.data.works.length
            const updates = {}
            newWorks.forEach((item, index) => {
              updates[`works[${baseLength + index}]`] = item
            })
            updates['hasMore'] = works.length >= this.data.pageSize
            updates['loading'] = false
            if (works.length > 0) {
              const lastWork = works[works.length - 1]
              updates['last_id'] = lastWork.id
              // 获取时间戳，兼容多种时间字段格式
              let timestamp = null
              if (lastWork.created_time) {
                timestamp = typeof lastWork.created_time === 'string' ? lastWork.created_time : lastWork.created_time.toISOString()
              } else if (lastWork.created_at) {
                timestamp = typeof lastWork.created_at === 'string' ? lastWork.created_at : lastWork.created_at.toISOString()
              } else if (lastWork.display_time) {
                timestamp = lastWork.display_time
              }
              updates['last_created_at'] = timestamp
            }

            this.setDataSafe(updates, () => {
              // 加载更多完成后，重新初始化懒加载观察器
              setTimeout(() => {
                this.initLazyLoading()
              }, 100)
            })
            // 维护私有完整数据
            this._works = [...(this._works || []), ...newWorks]
          } else {
            // 没有新数据，只更新状态
            this.setDataSafe({
              hasMore: works.length >= this.data.pageSize,
              loading: false
            })
          }
        } else {
          // 🎯 首次加载或刷新：智能合并数据，保持realtime listener的更新
          let finalWorks = []

          // 检查当前是否有数据（可能是realtime listener的更新）
          const currentWorks = this.data.works || []
          const hasCurrentData = currentWorks.length > 0

          if (hasCurrentData) {
            // 🔄 智能合并模式：保持realtime listener移到顶部的已完成作品
            console.log('🔄 智能合并模式：保持realtime更新，合并数据库数据')

            // 找出顶部的已完成作品（可能是realtime listener刚移上去的）
            const topCompletedWorks = []
            for (let i = 0; i < currentWorks.length; i++) {
              const work = currentWorks[i]
              if (work.status === 'completed' && work.images && work.images.length > 0) {
                topCompletedWorks.push(work)
              } else {
                break // 遇到第一个未完成的作品就停止
              }
            }

            // 合并：顶部已完成作品 + 新数据（去重）
            const newWorksIds = new Set(works.map(w => w.id))
            const existingTopIds = new Set(topCompletedWorks.map(w => w.id))

            // 先添加顶部已完成的作品（来自realtime listener）
            finalWorks = [...topCompletedWorks]

            // 再添加新数据（跳过已在顶部的）
            const newUniqueWorks = works.filter(w => !existingTopIds.has(w.id))
            finalWorks = [...finalWorks, ...newUniqueWorks]

            // 去重
            finalWorks = this.deduplicateWorks(finalWorks)

            console.log(`✅ 智能合并完成：保留${topCompletedWorks.length}个顶部已完成作品，合并${newUniqueWorks.length}个新作品`)
          } else {
            // 🆕 正常首次加载：直接使用新数据
            finalWorks = this.deduplicateWorks(works)
            console.log('🆕 首次加载：直接使用新数据')
          }

          // 更新数据
          this.setData({
            works: finalWorks,
            hasMore: works.length >= this.data.pageSize,
            isEmpty: finalWorks.length === 0,
            lastRefreshAt: Date.now(),
            firstLoadDone: true,
            last_id: finalWorks.length ? finalWorks[finalWorks.length - 1].id : null,
            last_created_at: finalWorks.length ? (() => {
              const lastWork = finalWorks[finalWorks.length - 1]
              if (lastWork.created_time) {
                return typeof lastWork.created_time === 'string' ? lastWork.created_time : lastWork.created_time.toISOString()
              } else if (lastWork.created_at) {
                return typeof lastWork.created_at === 'string' ? lastWork.created_at : lastWork.created_at.toISOString()
              } else if (lastWork.display_time) {
                return lastWork.display_time
              }
              return null
            })() : null
          }, () => {
            // 数据加载完成后，重新初始化懒加载观察器
            // 需要延迟一下让DOM更新完成
            setTimeout(() => {
              this.initLazyLoading()
            }, 100)
          })
          this._works = finalWorks
        }
      } else {
        this.setData({
          loading: false,
          isEmpty: !this.data.last_id
        })
      }
    } catch (error) {
      console.error('加载作品失败:', error)
      this.setData({
        loading: false,
        isEmpty: !this.data.last_id
      })
      // 重新抛出错误，让调用方知道加载失败
      throw error
    }

    wx.stopPullDownRefresh()
  },

  /**
   * 刷新作品列表
   */
  async refreshWorks() {
    // 防止频繁刷新
    const now = Date.now()
    if (this._lastRefreshTime && (now - this._lastRefreshTime) < 1000) {
      console.log('刷新太频繁，跳过')
      return
    }
    this._lastRefreshTime = now

    // 保存当前数据，以防刷新失败时恢复
    const backupWorks = [...this.data.works]
    const backupLastId = this.data.last_id
    const backupLastCreatedAt = this.data.last_created_at
    const backupIsEmpty = this.data.isEmpty
    const backupHasMore = this.data.hasMore

    // 先清空状态，显示加载中
    this.setData({
      last_id: null,
      last_created_at: null,
      works: [],
      hasMore: true,
      isEmpty: false,
      loading: false  // 确保loading状态正确
    })

    try {
      await this.loadWorks()
    } catch (error) {
      console.error('刷新作品列表失败，恢复原数据:', error)
      // 刷新失败时，恢复原有数据
      this.setData({
        works: backupWorks,
        last_id: backupLastId,
        last_created_at: backupLastCreatedAt,
        isEmpty: backupIsEmpty,
        hasMore: backupHasMore,
        loading: false
      })

      // 根据错误类型显示不同提示
      let errorMessage = '刷新失败'
      if (error.message && error.message.includes('network')) {
        errorMessage = '网络连接异常，请检查网络'
      } else if (error.message && error.message.includes('timeout')) {
        errorMessage = '请求超时，请稍后重试'
      }

      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 2000
      })
    }
  },

  /**
   * 加载更多
   */
  async loadMore() {
    if (this.data.loading || !this.data.hasMore) return
    await this.loadWorks()
  },

  /**
   * 切换标签
   */
  switchTab(e) {
    const index = e.currentTarget.dataset.index
    if (index === this.data.currentTab) return
    this.setData({
      currentTab: index,
      last_id: null,
      last_created_at: null,
      works: [],
      hasMore: true,
      isEmpty: false
    }, () => this.loadWorks())
  },

  /**
   * 查看作品详情
   */
  viewWork(e) {
    const workId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/work-detail/work-detail?id=${workId}`
    })
  },

  /**
   * 长按卡片直接删除
   */
  onItemLongPress(e) {
    const id = e?.currentTarget?.dataset?.id
    if (!id) return
    // 复用已有删除逻辑，并提供最小化的 stopPropagation 以避免父级触发
    this.deleteWork({
      stopPropagation: () => {},
      currentTarget: { dataset: { id } }
    })
  },


  /**
   * 切换收藏状态
   */
  async toggleFavorite(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation() // 阻止事件冒泡
    
    const workId = e.currentTarget.dataset.id
    const workIndex = this.data.works.findIndex(w => w.id === workId)
    
    if (workIndex === -1) return

    try {
      const res = await apiService.toggleFavorite(workId)
      
      if (res.success) {
        const works = [...this.data.works]
        works[workIndex].is_favorite = !works[workIndex].is_favorite
        
        // 如果当前在收藏标签页，移除取消收藏的作品
        if (this.data.tabs[this.data.currentTab].key === 'favorite' && !works[workIndex].is_favorite) {
          works.splice(workIndex, 1)
        }
        
        this.setData({ works })
        
        wx.showToast({
          title: works[workIndex]?.is_favorite ? '已收藏' : '已取消收藏',
          icon: 'success',
          duration: 1500
        })
      }
    } catch (error) {
      console.error('切换收藏状态失败:', error)
    }
  },

  /**
   * 分享作品
   */
  shareWork(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    
    const workId = e.currentTarget.dataset.id
    const work = this.data.works.find(w => w.id === workId)
    
    if (!work) return

    // 这里可以实现分享功能
    wx.showActionSheet({
      itemList: ['保存到相册', '分享给朋友'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.saveToAlbum(work)
        } else if (res.tapIndex === 1) {
          // 分享给朋友的逻辑
          console.log('分享给朋友')
        }
      }
    })
  },

  /**
   * 保存到相册
   */
  async saveToAlbum(work) {
    if (!work.images || work.images.length === 0) {
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

      wx.showLoading({
        title: '保存中...',
        mask: true
      })

      // 保存第一张图片（优先 https 临时链接）
      const first = work.images[0] || {}
      const imageUrl = first.temp_url || first.url
      if (!imageUrl) {
        throw new Error('无有效图片地址')
      }

      // http(s) 走 wx.downloadFile；cloud:// 走 wx.cloud.downloadFile
      let tempFilePath = ''
      if (/^https?:\/\//.test(imageUrl)) {
        const dl = await wx.downloadFile({ url: imageUrl })
        if (dl.statusCode !== 200) throw new Error('下载失败')
        tempFilePath = dl.tempFilePath
      } else {
        const dl = await wx.cloud.downloadFile({ fileID: imageUrl })
        tempFilePath = dl.tempFilePath
      }

      // 保存到相册
      await wx.saveImageToPhotosAlbum({
        filePath: tempFilePath
      })

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

    } catch (error) {
      wx.hideLoading()
      console.error('保存图片失败:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
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
   * 删除作品（真实删除）
   */
  deleteWork(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    const workId = e.currentTarget.dataset.id
    if (!workId) return

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个作品吗？',
      confirmText: '删除',
      confirmColor: '#d33',
      success: async (res) => {
        if (!res.confirm) return
        try {
          wx.showLoading({ title: '删除中...', mask: true })
          const del = await apiService.deleteWork(workId)
          wx.hideLoading()
          if (del && del.success) {
            const works = this.data.works.filter(w => w.id !== workId)
            this.setData({ works })
            wx.showToast({ title: '已删除', icon: 'success' })
          } else {
            wx.showToast({ title: del?.message || '删除失败', icon: 'none' })
          }
        } catch (error) {
          try { wx.hideLoading() } catch(_) {}
          console.error('删除作品失败:', error)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 显示筛选面板
   */
  showFilter() {
    this.setData({
      showFilterPanel: true
    })
  },

  /**
   * 隐藏筛选面板
   */
  hideFilter() {
    this.setData({
      showFilterPanel: false
    })
  },

  /**
   * 跳转到服装摄影页
   */
  goToPhotography() {
    wx.switchTab({
      url: '/pages/photography/photography'
    })
  },

  /**
   * 启动任务状态轮询（带幂等性和可见性检查）
   * @param {string} taskId 任务ID
   */
  startTaskPolling(taskId) {
    // 幂等性检查：避免重复启动
    if (this._activeTaskPolling.has(taskId)) {
      console.log('任务轮询已启动，跳过重复启动:', taskId);
      return;
    }
    this._activeTaskPolling.add(taskId);

    // 记录起点（用于阶段估算）
    try {
      const pending = wx.getStorageSync('pendingTask')
      this.data._taskStartAt = (pending && pending.createdAt) ? pending.createdAt : Date.now()
    } catch (_) {
      this.data._taskStartAt = Date.now()
    }

    // 显示进行中卡片；全局loading快速隐藏，改由卡片承载反馈
    this.updateProgressCardSafely({ ...this.data.progressCard, visible: true });
    this.loadingHideTimer = setTimeout(() => { try { wx.hideLoading() } catch(e) {} }, 800)

    // 清理旧定时器
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this._pollingTimers.delete(this.pollingTimer);
    }

    // 使用安全的定时器，带可见性检查
    this.pollingTimer = this.setSafeInterval(async () => {
      try {
        // 1) 前端阶段估算
        const elapsed = Date.now() - this.data._taskStartAt
        const est = this.computeStage(elapsed)
        this.updateProgressCardSafely({ ...this.data.progressCard, ...est, visible: true });

        // 2) 查询后端进度
        const res = await apiService.getPhotographyProgress(taskId)

        // 3) 部分可见：每两次轮询轻量刷新列表（第一页）
        this.data._pollTick = (this.data._pollTick + 1) % 2
        if (this.data._pollTick === 0) {
          // 避免破坏分页状态：仅在第一页时刷新（未有last_id表示第一页）
          if (!this.data.last_id) {
            await this.loadWorks()
          }
        }

        if (res && res.success) {
          const taskStatusRaw = (res && res.data && res.data.status) || ''
          const taskStatus = String(taskStatusRaw).toLowerCase()
          const completedNum = res && res.data ? res.data.completed : undefined
          const totalNum = res && res.data ? res.data.total : undefined
          const isProgressNumbersValid = typeof completedNum === 'number' && typeof totalNum === 'number' && totalNum > 0
          const isBackendDone = taskStatus === 'completed' || taskStatus === 'success' || (isProgressNumbersValid && completedNum >= totalNum)
          const isBackendFailed = taskStatus === 'failed' || taskStatus === 'error'

          // 覆盖显示后端已知的完成进度
          if (typeof res.data.completed === 'number' && typeof res.data.total === 'number') {
            const pc = this.data.progressCard
            const p = res.data.total > 0 ? Math.floor((res.data.completed / res.data.total) * 100) : pc.percent
            this.updateProgressCardSafely({
              ...pc,
              percent: p,
              completed: res.data.completed,
              total: res.data.total
            });
          }
          if (typeof res.data.etaSeconds === 'number') {
            const mm = String(Math.floor(res.data.etaSeconds / 60)).padStart(2, '0')
            const ss = String(Math.floor(res.data.etaSeconds % 60)).padStart(2, '0')
            this.updateProgressCardSafely({ ...this.data.progressCard, etaText: `约${mm}:${ss}` });
          }

          if (isBackendDone) {
            clearInterval(this.pollingTimer);
            this._pollingTimers.delete(this.pollingTimer);
            this._activeTaskPolling.delete(taskId);
            this.updateProgressCardSafely({ ...this.data.progressCard, visible: false });

            // 智能提示：检查是否使用了模拟模式
            const isUsingMockMode = res.data.images && res.data.images.some(img =>
              img.metadata && (img.metadata.mock_mode || img.metadata.model === 'mock-fashion-ai-v1.0')
            );

            if (isUsingMockMode) {
              wx.showModal({
                title: '生成完成',
                content: '图片已生成完成！\n\n注意：由于AI服务暂时不可用，本次使用了模拟模式生成。如需真实AI效果，请稍后重试。',
                confirmText: '我知道了',
                showCancel: false
              });
            } else {
              wx.showToast({ title: '生成完成', icon: 'success' });
            }

            this.loadWorks();
          } else if (isBackendFailed) {
            clearInterval(this.pollingTimer);
            this._pollingTimers.delete(this.pollingTimer);
            this._activeTaskPolling.delete(taskId);
            this.updateProgressCardSafely({
              ...this.data.progressCard,
              stage: 'failed',
              message: '很抱歉，本次任务生成失败，积分将自动退还',
              percent: 100
            });
            try { wx.hideLoading() } catch(e) {}
            wx.showToast({ title: '生成失败', icon: 'none' });
            if (typeof apiService.refundPointsByTask === 'function') {
              apiService.refundPointsByTask(taskId);
            }
            setTimeout(() => {
              try { this.updateProgressCardSafely({ ...this.data.progressCard, visible: false }); } catch(_) {}
            }, 1000);
          }
        } else {
          // 后端暂时不可用：仅维持前端阶段估算，不中断轮询
          console.warn('获取任务状态失败(容错继续轮询)');
        }
      } catch (error) {
        console.error('轮询任务状态异常:', error);
        // 保留卡片，不立刻清除，下一tick继续
      }
    }, 5000);
  },

  // onUnload方法已移动到文件末尾，包含完整的内存清理逻辑

  onHide() {
    this._isPageVisible = false;
    // 使用统一的定时器清理方法
    this.clearAllTimers();
    if (this.loadingHideTimer) {
      clearTimeout(this.loadingHideTimer);
    }
    // 隐藏时保持卡片可见状态（下次onShow会继续）
  },

  // 排序切换
  changeSortType(e) {
    const type = e.currentTarget.dataset.type || 'create_time'
    if (type === this.data.sortType) return
    this.setData({ sortType: type }, () => this.refreshWorks())
  },

  // 重置筛选
  resetFilter() {
    this.setData({ sortType: 'create_time' })
  },

  // 应用筛选
  applyFilter() {
    this.setData({ showFilterPanel: false }, () => this.refreshWorks())
  },


  /**
   * 读取并合并本地待处理任务（支持 legacy 单任务 -> 数组）
   * 优化版：优先使用同步的进度状态，确保跨页面一致
   */
  loadPendingTasksFromStorage() {
    let arr = []

    // 🎯 优先尝试读取同步的进度状态（包含完整进度信息）
    try {
      const syncData = wx.getStorageSync('progressList_sync')
      if (syncData && syncData.list && Array.isArray(syncData.list)) {
        const age = Date.now() - (syncData.timestamp || 0)
        // 如果数据不超过30秒，直接使用（确保新鲜度）
        if (age < 30000) {
          console.log('📥 从同步存储加载进度状态，数据年龄:', age, 'ms')
          this.setData({ progressList: syncData.list })
          return
        }
      }
    } catch (_) {}

    // 兜底：从基础任务列表构建进度状态
    try {
      const pendingArr = wx.getStorageSync('pendingTasks') || []
      if (Array.isArray(pendingArr)) arr = pendingArr
    } catch (_) {}

    try {
      const legacy = wx.getStorageSync('pendingTask')
      if (legacy && legacy.taskId) {
        // 迁移 legacy 到数组，保留类型信息
        arr.push({
          taskId: legacy.taskId,
          type: legacy.type || 'photography', // 默认为摄影类型
          createdAt: legacy.createdAt || Date.now()
        })
        wx.removeStorageSync('pendingTask')
      }
    } catch (_) {}

    // 去重（按 taskId）
    const map = {}
    const merged = []
    arr.forEach(it => {
      if (!it || !it.taskId) return
      if (!map[it.taskId]) {
        map[it.taskId] = true
        const taskType = it.type || 'photography'
        const isPhotography = taskType === 'photography'

        merged.push({
          taskId: it.taskId,
          type: taskType,
          startedAt: it.createdAt || Date.now(),
          stage: 'planning',
          message: isPhotography ? '摄影师正在设计拍摄计划…' : 'AI试衣师正在准备试衣间…',
          percent: 0,
          etaText: '约10:00',
          completed: null,
          total: null,
          status: 'processing'
        })
      }
    })

    this.setData({ progressList: merged })
    try { wx.setStorageSync('pendingTasks', merged.map(({ taskId, type, startedAt }) => ({ taskId, type, createdAt: startedAt }))) } catch(_) {}
  },

  // 手动加入待处理任务（如点击“开始拍摄”时调用）
  addPendingTasks(tasks = [], opts = { startPolling: false, hideGlobalLoading: false }) {
    const list = [...this.data.progressList]
    const map = new Map() // 使用Map确保更好的性能
    list.forEach(i => map.set(i.taskId, true))
    const now = Date.now()

    tasks.forEach(t => {
      if (!t || !t.taskId || map.has(t.taskId)) return
      map.set(t.taskId, true)
      list.push({
        taskId: t.taskId,
        startedAt: t.createdAt || now,
        stage: 'planning',
        message: '摄影师正在设计拍摄计划…',
        percent: 0,
        etaText: '约10:00',
        completed: null,
        total: null,
        status: 'processing'
      })
    })

    this.setData({ progressList: list })
    try { wx.setStorageSync('pendingTasks', list.map(({ taskId, startedAt }) => ({ taskId, createdAt: startedAt }))) } catch(_) {}

    if (opts.startPolling && !this._multiPollingActive) {
      if (!opts.hideGlobalLoading) {
        wx.showLoading({ title: '正在获取结果...', mask: true })
        setTimeout(() => { try { wx.hideLoading() } catch(e) {} }, 800)
      }
      this.startMultiPolling()
    }
  },

  /**
   * 取消任务（调用后端取消并退款）
   */
  async cancelTask(e) {
    const taskId = e?.currentTarget?.dataset?.taskId
    if (!taskId) return

    wx.showModal({
      title: '确认取消',
      content: '确定要取消本次任务吗？已扣除的积分将自动退还。',
      confirmText: '确定取消',
      cancelText: '继续等待',
      success: async (res) => {
        if (!res.confirm) return

        try {
          wx.showLoading({ title: '正在取消...', mask: true })

          const result = await apiService.callCloudFunction('api', {
            action: 'cancelTask',
            task_id: taskId,
            __noLoading: true
          })

          wx.hideLoading()

          if (result && result.success) {
            // 从进度列表中移除
            const list = this.data.progressList.filter(i => i.taskId !== taskId)
            this.setDataSafe({ progressList: list })

            // 🔄 注销全局轮询
            app.unregisterPolling(taskId, this.pagePath)

            try {
              wx.setStorageSync('pendingTasks', list.map(({ taskId, type, startedAt }) => ({
                taskId,
                type,
                createdAt: startedAt
              })))
            } catch(_) {}

            // 如果没有剩余任务，停止轮询
            if (list.length === 0 && this.multiPollingTimer) {
              clearInterval(this.multiPollingTimer)
              this._multiPollingActive = false
            }

            wx.showToast({
              title: result.message || '已取消任务',
              icon: 'success',
              duration: 2000
            })

            // 刷新作品列表
            setTimeout(() => {
              this.refreshWorks()
            }, 800)
          } else {
            wx.showToast({
              title: result?.message || '取消失败',
              icon: 'none',
              duration: 2000
            })
          }
        } catch (error) {
          wx.hideLoading()
          console.error('取消任务失败:', error)
          wx.showToast({
            title: '取消失败，请稍后重试',
            icon: 'none',
            duration: 2000
          })
        }
      }
    })
  },

  /**
   * 取消跟踪某个任务（仅前端移除，不影响后端）
   * @deprecated 建议使用 cancelTask 真正取消任务
   */
  cancelTrack(e) {
    const taskId = e?.currentTarget?.dataset?.taskId
    const list = this.data.progressList.filter(i => i.taskId !== taskId)
    this.setDataSafe({ progressList: list })
    try { wx.setStorageSync('pendingTasks', list.map(({ taskId, type, startedAt }) => ({ taskId, type, createdAt: startedAt }))) } catch(_) {}
    if (list.length === 0 && this.multiPollingTimer) {
      clearInterval(this.multiPollingTimer)
      this._multiPollingActive = false
    }
  },

  /**
   * 🚀 性能优化：智能计算轮询间隔（根据任务运行时间动态调整）
   * 节约60%云函数调用，减少服务器压力
   *
   * 🎯 优化策略（V2）：
   * 配合 realtime listener（实时监听），轮询作为兜底机制
   * 延长轮询间隔，减少不必要的云函数调用
   */
  getSmartPollingInterval(tasks) {
    if (!tasks || tasks.length === 0) return 10000

    // 计算最长运行时间
    const now = Date.now()
    const maxElapsed = Math.max(...tasks.map(t =>
      now - (t.startedAt || now)
    ))

    // 🎯 优化后的动态间隔策略：
    // 前2分钟（用户焦虑期）：10秒 - realtime为主，轮询兜底
    // 2-5分钟（正常等待期）：20秒 - 进一步降低频率
    // 5分钟后（习惯等待期）：30秒 - 最大程度节约资源
    if (maxElapsed < 2 * 60 * 1000) {
      return 10000  // 前2分钟：10秒（原3秒）
    } else if (maxElapsed < 5 * 60 * 1000) {
      return 20000  // 2-5分钟：20秒（原5秒）
    } else {
      return 30000  // 5分钟后：30秒（原10秒）
    }
  },

  /**
   * 🚀 多任务轮询：统一tick更新所有任务与阶段，并间歇刷新列表
   * 优化版：增强与realtime listener的协作，确保状态同步
   */
  startMultiPolling() {
    // 防止重复启动轮询
    if (this._multiPollingActive) {
      console.log('✋ 多任务轮询已在运行，跳过重复启动')
      return
    }

    // 防止轮询刚完成就立即重启
    if (this._justCompletedPolling) {
      console.log('⏱️ 多任务轮询刚完成，暂时跳过重新启动')
      return
    }

    // 🔄 过滤掉已被其他页面轮询的任务，并注册当前页面的任务
    const validTasks = []
    this.data.progressList.forEach(task => {
      if (app.isPolling(task.taskId)) {
        console.log(`⚠️ 任务 ${task.taskId} 已在其他页面轮询，跳过`)
      } else {
        // 注册到全局轮询管理器
        if (app.registerPolling(task.taskId, this.pagePath)) {
          validTasks.push(task)
        }
      }
    })

    // 如果没有可轮询的任务，直接返回
    if (validTasks.length === 0) {
      console.log('⚠️ 没有可轮询的任务，停止启动')
      return
    }

    // 更新有效任务列表
    if (validTasks.length !== this.data.progressList.length) {
      this.setDataSafe({ progressList: validTasks })
    }

    console.log(`🚀 多任务轮询：开始启动（智能间隔模式），有效任务数: ${validTasks.length}/${this.data.progressList.length}`)

    // 清理旧的定时器
    if (this.multiPollingTimer) {
      clearTimeout(this.multiPollingTimer)
      this.multiPollingTimer = null
    }

    // 设置轮询状态标记
    this._pollingStarted = true
    this._multiPollingActive = true

    // 快速隐藏全局loading，改由卡片承载
    setTimeout(() => { try { wx.hideLoading() } catch(e) {} }, 500)

    // 🚀 性能优化：改用递归setTimeout，支持动态间隔
    const pollTask = async () => {
      try {
        let list = [...this.data.progressList]
        const tickNow = Date.now()

        // 更新阶段估算（前端10分钟四阶段，15分钟超时）
        list = list.map(item => {
          const elapsed = Math.max(0, tickNow - (item.startedAt || tickNow))
          const est = this.computeStage(elapsed)

          // 如果超时，标记为失败
          if (est.timeout && item.status !== 'failed') {
            // 首次超时时显示提示
            if (!this._notifiedTasks.has(item.taskId)) {
              this._notifiedTasks.add(item.taskId)
              wx.showToast({
                title: '任务超时，请重试',
                icon: 'none',
                duration: 3000
              })
            }

            return {
              ...item,
              ...est,
              status: 'failed',
              message: '任务超时，请重试'
            }
          }

          return { ...item, ...est }
        })

        // 轮询每个任务状态（串行以控资源；任务不多时足够）
        for (let i = 0; i < list.length; i++) {
          const t = list[i]

          // 跳过已超时的任务（不再查询后端）
          if (t.status === 'failed' && t.timeout) {
            continue
          }

          try {
            // 根据任务类型调用对应的进度查询API
            let res
            if (t.type === 'fitting') {
              res = await apiService.getFittingProgress(t.taskId)
            } else {
              // 默认为摄影任务
              res = await apiService.getPhotographyProgress(t.taskId)
            }
            if (res && res.success) {
              // 优先使用后端真实进度，确保准确性
              const { completed, total, etaSeconds, status } = res.data || {}
              if (typeof completed === 'number' && typeof total === 'number' && total > 0) {
                const realPercent = Math.floor((completed / total) * 100)
                // 确保进度不倒退，但优先使用后端数据
                const finalPercent = Math.max(realPercent, t.percent || 0)
                list[i] = { ...list[i], completed, total, percent: finalPercent }
              }
              if (typeof etaSeconds === 'number') {
                const mm = String(Math.floor(etaSeconds / 60)).padStart(2, '0')
                const ss = String(Math.floor(etaSeconds % 60)).padStart(2, '0')
                list[i] = { ...list[i], etaText: `约${mm}:${ss}` }
              }
              if (status === 'completed') {
                list[i] = { ...list[i], status: 'completed' }
                if (!this._notifiedTasks.has(t.taskId)) {
                  this._notifiedTasks.add(t.taskId)

                  // 检查是否使用了模拟模式
                  const isUsingMockMode = res.data.images && res.data.images.some(img =>
                    img.metadata && (img.metadata.mock_mode || img.metadata.model === 'mock-fashion-ai-v1.0')
                  );

                  if (isUsingMockMode) {
                    wx.showToast({
                      title: '生成完成（模拟模式）',
                      icon: 'success',
                      duration: 2000
                    })
                  } else {
                    wx.showToast({ title: '生成完成', icon: 'success' })
                  }
                }
              } else if (status === 'failed') {
                list[i] = { ...list[i], status: 'failed', message: '很抱歉，本次任务生成失败，积分将自动退还' }
                if (!this._notifiedTasks.has(t.taskId)) {
                  this._notifiedTasks.add(t.taskId)
                  wx.showToast({ title: '生成失败', icon: 'none' })
                }
                if (typeof apiService.refundPointsByTask === 'function') {
                  apiService.refundPointsByTask(t.taskId)
                }
              } else {
                list[i] = { ...list[i], status: 'processing' }
              }
            }
          } catch (err) {
            console.warn(`get${t.type === 'fitting' ? 'Fitting' : 'Photography'}Progress error`, err)
          }
        }

        // 应用更新 - 使用Map进行高效去重
        const taskMap = new Map()
        const uniqueList = []
        list.forEach(item => {
          if (item && item.taskId && !taskMap.has(item.taskId)) {
            taskMap.set(item.taskId, true)
            uniqueList.push(item)
          }
        })

        // 只在数据真正变化时才更新
        if (!this.isProgressListEqual(this.data.progressList, uniqueList)) {
          this.setDataSafe({ progressList: uniqueList })

          // 🎯 同步进度到本地存储，让不同页面能共享进度状态
          try {
            wx.setStorageSync('progressList_sync', {
              list: uniqueList,
              timestamp: Date.now()
            })
          } catch(_) {}
        }

        // 移除已完成/失败的任务（前端停止跟踪，但后端不受影响）
        const remain = uniqueList.filter(i => i.status === 'processing')

        // 🔄 注销已完成/失败任务的全局轮询
        const removedTasks = uniqueList.filter(i => i.status !== 'processing')
        removedTasks.forEach(task => {
          app.unregisterPolling(task.taskId, this.pagePath)
        })

        // 若全部结束，立即停止定时器并清理状态
        if (remain.length === 0) {
          console.log('多任务轮询：所有任务已完成，正在停止轮询...')
          if (this.multiPollingTimer) {
            clearInterval(this.multiPollingTimer)
            this.multiPollingTimer = null
          }
          this._pollingStarted = false
          this._multiPollingActive = false

          // 彻底清理所有任务相关存储和状态
          this.setDataSafe({ progressList: [] })
          try {
            wx.setStorageSync('pendingTasks', [])
            wx.removeStorageSync('pendingTask') // 清理legacy存储
          } catch(_) {}

          console.log('多任务轮询：轮询已停止，状态已重置')
          // 🎯 刷新作品列表 - 但不清空works数组，避免覆盖realtime listener的更新
          // realtime listener已经将完成的作品移到顶部，loadWorks只需要确保数据同步
          console.log('🔄 polling完成，刷新作品列表（保持realtime更新）')

          // 只重置分页游标，不清空works数组
          this.setDataSafe({
            last_id: null,
            last_created_at: null,
            hasMore: true
          })

          // 延迟300ms调用loadWorks，确保realtime listener的更新已完成
          await new Promise(resolve => setTimeout(resolve, 300))
          await this.loadWorks()

          // 设置较短的标记，阻止立即重新启动轮询，但不影响作品列表刷新
          this._justCompletedPolling = true
          setTimeout(() => {
            this._justCompletedPolling = false
          }, 500) // 减少到500ms，仅防止轮询立即重启
          return // 直接返回，避免继续执行
        }

        if (remain.length !== uniqueList.length) {
          this.setDataSafe({ progressList: remain })
          try { wx.setStorageSync('pendingTasks', remain.map(({ taskId, type, startedAt }) => ({ taskId, type, createdAt: startedAt }))) } catch(_) {}
          // 完成有变更时，刷新一次作品列表
          await this.loadWorks()
        } else {
          // 间歇刷新，增强"部分可见"
          this.data._multiPollTick = (this.data._multiPollTick + 1) % 2
          if (this.data._multiPollTick === 0 && !this.data.last_id) {
            await this.loadWorks()
          }
        }

        // 🚀 性能优化：动态计算下次轮询间隔
        const nextInterval = this.getSmartPollingInterval(this.data.progressList)
        console.log(`⏱️ 下次轮询间隔: ${nextInterval}ms (任务数: ${this.data.progressList.length})`)

        // 递归调用，实现动态间隔轮询
        this.multiPollingTimer = setTimeout(pollTask, nextInterval)

      } catch (e) {
        console.error('multi polling tick error', e)

        // 出错时也要继续轮询（使用默认5秒间隔）
        if (this._multiPollingActive && this.data.progressList.length > 0) {
          this.multiPollingTimer = setTimeout(pollTask, 5000)
        }
      }
    }

    // 🚀 启动第一次轮询
    pollTask()
  },

  /**
   * 清理无效任务存储（临时修复方案）
   */
  cleanupInvalidTasks() {
    try {
      const now = Date.now()
      const maxAge = 10 * 60 * 1000 // 10分钟

      // 清理过期的待处理任务
      const pendingTasks = wx.getStorageSync('pendingTasks') || []
      const validTasks = pendingTasks.filter(task => {
        if (!task || !task.taskId || !task.createdAt) return false
        return (now - task.createdAt) < maxAge
      })

      if (validTasks.length !== pendingTasks.length) {
        console.log(`清理过期任务: ${pendingTasks.length} -> ${validTasks.length}`)
        wx.setStorageSync('pendingTasks', validTasks)
      }

      // 清理旧的单任务存储
      wx.removeStorageSync('pendingTask')

    } catch (e) {
      console.warn('清理无效任务失败:', e)
    }
  },

  /**
   * 图片加载错误处理
   */
  onImageError(e) {
    const workId = e.currentTarget.dataset.workId
    const errorUrl = e.currentTarget.dataset.url || e.currentTarget.src

    console.warn(`作品图片加载失败: workId=${workId}, url=${errorUrl}`)

    // 使用默认图片替换
    const defaultImage = app.globalData.imageHandler.handleImageError(errorUrl, 'work')

    // 更新当前图片源
    e.currentTarget.src = defaultImage

    // 更新数据中的图片URL
    const works = this.data.works.map(work => {
      if (work.id === workId) {
        return {
          ...work,
          thumbnail: defaultImage
        }
      }
      return work
    })

    this.setData({ works })
  },

  /**
   * 初始化内存管理机制（2024年微信小程序最佳实践）
   */
  initMemoryManagement() {
    // 缓存大小限制（微信官方建议）
    this.MAX_CACHE_SIZE = 200 // 限制缓存项数量
    this.CACHE_TTL = 30 * 60 * 1000 // 30分钟TTL
    this.CLEANUP_INTERVAL = 5 * 60 * 1000 // 5分钟清理一次

    // setData性能优化参数（2024年最佳实践）
    this.setDataQueue = []
    this.setDataTimer = null
    this.SETDATA_THROTTLE = 100 // 100ms节流间隔
    this.SETDATA_BATCH_SIZE = 5 // 批量合并数量限制

    // 设置定期清理定时器（使用标准setInterval）
    this.memoryCleanupTimer = setInterval(() => {
      this.performMemoryCleanup()
    }, this.CLEANUP_INTERVAL)

    console.log('🧠 内存管理机制已初始化，包含setData优化')
  },

  /**
   * 初始化图片懒加载（使用IntersectionObserver 2024年最佳实践）
   */
  initLazyLoading() {
    console.log('🚀 开始初始化懒加载，当前作品数量:', this.data.works.length)

    // 如果已有观察器，先断开
    if (this.imageObserver) {
      this.imageObserver.disconnect()
      this.imageObserver = null
    }

    // 微信小程序的正确方式：使用 wx.createIntersectionObserver
    this.imageObserver = wx.createIntersectionObserver(this, {
      thresholds: [0.01], // 注意是 thresholds 不是 threshold
      observeAll: true // 观察所有匹配的元素
    })

    console.log('📐 IntersectionObserver创建成功')

    // 设置参照区域并开始观察
    this.imageObserver
      .relativeToViewport({
        top: 100,
        bottom: 100
      }) // 相对视口，提前100px加载
      .observe('.work-item', (res) => {
        console.log('🔍 观察器回调触发:', {
          intersectionRatio: res.intersectionRatio,
          dataset: res.dataset,
          id: res.id
        })

        if (res.intersectionRatio > 0) {
          // 元素进入视口，开始加载图片
          const index = res.dataset?.index
          if (index !== undefined) {
            const idx = parseInt(index)
            console.log(`👁️ 检测到第 ${idx} 个作品进入视口`)
            this.loadImageAtIndex(idx)
          } else {
            console.warn('⚠️ dataset.index未定义', res)
          }
        }
      })

    console.log('👁️ 图片懒加载机制已初始化，开始观察 .work-item 元素')
  },

  /**
   * 加载指定索引的图片
   */
  loadImageAtIndex(index) {
    if (index >= 0 && index < this.data.works.length) {
      const work = this.data.works[index]
      console.log(`🔍 检查第 ${index} 张图片状态: shouldLoad=${work.shouldLoad}`)
      if (!work.shouldLoad) {
        // 使用立即更新，避免批处理延迟
        this.setDataImmediate({
          [`works[${index}].shouldLoad`]: true
        })
        console.log(`🖼️ 开始加载第 ${index} 张图片: ${work.id}, thumbnail: ${work.thumbnail?.substring(0, 50)}...`)
      } else {
        console.log(`✅ 第 ${index} 张图片已经加载`)
      }
    }
  },

  /**
   * 图片加载完成事件
   */
  onImageLoad(e) {
    const index = e.currentTarget.dataset.index
    console.log(`✅ 第 ${index} 张图片加载完成`)
  },

  /**
   * 简化的重试机制（用于页面级别的API调用）
   */
  async retryWithBackoff(fn, options = {}) {
    const { maxRetries = 2, baseDelay = 500 } = options

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        if (attempt === maxRetries) {
          throw error
        }

        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200
        console.warn(`🔄 重试中... 延迟 ${delay.toFixed(0)}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  },

  /**
   * 执行内存清理（防止内存泄漏）
   */
  performMemoryCleanup() {
    if (!this._urlCache) return

    const now = Date.now()
    let cleanedCount = 0

    // 清理过期的URL缓存
    for (const [key, value] of this._urlCache.entries()) {
      if (value && value.timestamp && (now - value.timestamp) > this.CACHE_TTL) {
        this._urlCache.delete(key)
        cleanedCount++
      }
    }

    // 如果缓存过大，清理最旧的项目
    if (this._urlCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this._urlCache.entries())
      entries.sort((a, b) => {
        const aTime = (a[1] && a[1].timestamp) || 0
        const bTime = (b[1] && b[1].timestamp) || 0
        return aTime - bTime
      })
      const toDelete = entries.slice(0, this._urlCache.size - this.MAX_CACHE_SIZE)
      toDelete.forEach(([key]) => {
        this._urlCache.delete(key)
        cleanedCount++
      })
    }

    if (cleanedCount > 0) {
      console.log(`🧹 内存清理完成，清理了 ${cleanedCount} 个缓存项，当前缓存大小: ${this._urlCache.size}`)
    }
  },

  /**
   * 启动实时监听
   */
  startRealtimeWatch() {
    const app = getApp()

    // 检查用户是否登录
    if (!app.globalData.userInfo?.openid) {
      console.log('⏸️ 用户未登录，跳过实时监听')
      return
    }

    console.log('📡 启动 works 实时监听')

    const db = wx.cloud.database()

    this._watcher = db.collection('works')
      .where({
        user_openid: app.globalData.userInfo.openid
      })
      .watch({
        onChange: snapshot => {
          console.log('📡 收到数据变化:', snapshot.docChanges?.length || 0, '条')
          this.handleRealtimeUpdate(snapshot)
        },
        onError: err => {
          console.error('❌ 实时监听错误:', err)
          // 监听失败，继续使用轮询兜底
        }
      })
  },

  /**
   * 🚀 性能优化：处理实时数据变化（带防抖，减少50% setData调用）
   */
  handleRealtimeUpdate(snapshot) {
    if (!snapshot || !snapshot.docChanges) return

    // 🎯 防抖优化：收集变更到队列，300ms后批量处理
    if (!this._realtimeChangeQueue) {
      this._realtimeChangeQueue = []
    }

    // 将当前变更添加到队列
    snapshot.docChanges.forEach(change => {
      this._realtimeChangeQueue.push(change)
    })

    console.log(`📡 收到 ${snapshot.docChanges.length} 条数据变化，队列长度: ${this._realtimeChangeQueue.length}`)

    // 清除已有的防抖定时器
    if (this._realtimeDebounceTimer) {
      clearTimeout(this._realtimeDebounceTimer)
    }

    // 🚀 防抖：300ms内的多次变化合并为一次处理
    this._realtimeDebounceTimer = setTimeout(() => {
      this._processBatchedRealtimeChanges()
    }, 300)
  },

  /**
   * 批量处理实时变更（防抖后执行）
   */
  async _processBatchedRealtimeChanges() {
    if (!this._realtimeChangeQueue || this._realtimeChangeQueue.length === 0) {
      return
    }

    const changes = [...this._realtimeChangeQueue]
    this._realtimeChangeQueue = []

    console.log(`📦 批量处理 ${changes.length} 条实时变更`)

    // 🎯 性能优化：按类型分组处理，减少重复操作
    const updates = []
    const adds = []
    const removes = []

    changes.forEach(change => {
      const work = change.doc
      const changeType = change.queueType

      switch (changeType) {
        case 'init':
        case 'update':
          updates.push(work)
          break
        case 'add':
          adds.push(work)
          break
        case 'remove':
          removes.push(work._id)
          break
      }
    })

    // 批量处理更新（去重）
    if (updates.length > 0) {
      const uniqueUpdates = new Map()
      updates.forEach(work => {
        uniqueUpdates.set(work._id, work)
      })

      for (const work of uniqueUpdates.values()) {
        await this.updateWorkInList(work)

        // 如果刚完成，显示提示（防止重复提示）
        if (work.status === 'completed' && !this._notifiedWorks.has(work._id)) {
          this._notifiedWorks.add(work._id)

          wx.showToast({
            title: '✨ 作品生成完成',
            icon: 'success',
            duration: 2000
          })

          console.log(`✅ 作品 ${work._id} 生成完成`)
        }
      }
    }

    // 批量处理新增
    for (const work of adds) {
      await this.addWorkToList(work)
    }

    // 批量处理删除
    for (const workId of removes) {
      this.removeWorkFromList(workId)
    }

    console.log(`✅ 批量处理完成: 更新${updates.length}个, 新增${adds.length}个, 删除${removes.length}个`)
  },

  /**
   * 更新列表中的作品
   * 优化版：同时更新 progressList 中对应任务的状态
   */
  async updateWorkInList(work) {
    const works = this.data.works
    const index = works.findIndex(w => w._id === work._id || w.id === work._id)

    if (index !== -1) {
      const oldWork = works[index]
      const oldStatus = oldWork.status
      const newStatus = work.status

      // 🎯 检测作品完成状态
      const isCompleted = newStatus === 'completed'
      const wasNotCompleted = oldStatus !== 'completed'
      const hasImages = work.images && Array.isArray(work.images) && work.images.length > 0
      const oldHasImages = oldWork.images && Array.isArray(oldWork.images) && oldWork.images.length > 0

      // 🚀 置顶条件：作品已完成 且 有图片数据 且 (刚完成 或 之前没图片现在有了) 且 不在顶部
      const shouldMoveToTop = isCompleted && hasImages && (wasNotCompleted || !oldHasImages) && index !== 0

      if (shouldMoveToTop) {
        // 🚀 作品刚完成且数据完整：移到列表顶部并重新规范化数据
        console.log(`🎉 作品刚完成且数据完整，移到顶部: ${work._id}, images数量: ${work.images.length}`)

        // 从原位置删除
        works.splice(index, 1)

        // 规范化作品数据（获取完整图片URL等）
        const normalizedWorks = await this.normalizeWorksData([work], { isFirstLoad: false })

        if (normalizedWorks.length > 0) {
          const newWork = normalizedWorks[0]
          // 添加到列表顶部
          works.unshift(newWork)
          this.setDataSafe({ works })
          this._works = works
          console.log(`✅ 已将完成的作品移到顶部: ${work._id}`)
        }

        // 🎯 从 progressList 中移除对应的任务（已完成）
        if (work.task_id) {
          this.removeTaskFromProgressList(work.task_id)
        }
      } else {
        // 🔄 普通更新：原地更新
        works[index] = {
          ...works[index],
          ...work,
          status: work.status
        }

        this.setDataSafe({ works })
        this._works = works
        console.log(`✅ 已更新作品: ${work._id}`)

        // 🎯 同步更新 progressList 中的任务状态
        if (work.task_id) {
          this.syncTaskProgressFromWork(work)
        }
      }
    } else {
      console.log(`⚠️ 作品不在当前列表: ${work._id}`)
    }
  },

  /**
   * 从 progressList 中移除任务
   */
  removeTaskFromProgressList(taskId) {
    const progressList = this.data.progressList.filter(t => t.taskId !== taskId)
    if (progressList.length !== this.data.progressList.length) {
      this.setDataSafe({ progressList })

      // 🔄 注销全局轮询
      app.unregisterPolling(taskId, this.pagePath)

      // 同步到存储
      try {
        wx.setStorageSync('progressList_sync', {
          list: progressList,
          timestamp: Date.now()
        })
        wx.setStorageSync('pendingTasks', progressList.map(({ taskId, type, startedAt }) => ({
          taskId,
          type,
          createdAt: startedAt
        })))
      } catch(_) {}

      console.log(`🗑️ 从进度列表移除任务: ${taskId}`)
    }
  },

  /**
   * 从作品数据同步任务进度到 progressList
   */
  syncTaskProgressFromWork(work) {
    const progressList = [...this.data.progressList]
    const taskIndex = progressList.findIndex(t => t.taskId === work.task_id)

    if (taskIndex !== -1) {
      const task = progressList[taskIndex]

      // 更新任务状态
      const updates = {}
      if (work.status) {
        updates.status = work.status
      }
      if (work.progress !== undefined) {
        updates.percent = Math.round(work.progress)
      }
      if (work.batch_meta) {
        updates.completed = work.batch_meta.batch_received
        updates.total = work.batch_meta.batch_expected
      }

      // 如果有更新，应用到列表
      if (Object.keys(updates).length > 0) {
        progressList[taskIndex] = { ...task, ...updates }
        this.setDataSafe({ progressList })

        // 同步到存储
        try {
          wx.setStorageSync('progressList_sync', {
            list: progressList,
            timestamp: Date.now()
          })
        } catch(_) {}

        console.log(`🔄 同步任务进度: ${work.task_id}`, updates)
      }
    }
  },

  /**
   * 添加作品到列表
   */
  async addWorkToList(work) {
    // 检查是否已存在
    const exists = this.data.works.find(w => w._id === work._id || w.id === work._id)
    if (exists) {
      console.log(`⚠️ 作品已存在，更新: ${work._id}`)
      this.updateWorkInList(work)
      return
    }

    // 规范化作品数据
    const normalizedWorks = await this.normalizeWorksData([work], { isFirstLoad: false })

    if (normalizedWorks.length > 0) {
      const newWork = normalizedWorks[0]
      // 添加到列表顶部
      const works = [newWork, ...this.data.works]
      this.setDataSafe({ works })
      this._works = works
      console.log(`➕ 已添加作品: ${work._id}`)
    }
  },

  /**
   * 从列表中移除作品
   */
  removeWorkFromList(workId) {
    const works = this.data.works.filter(w => w._id !== workId && w.id !== workId)
    this.setDataSafe({ works })
    this._works = works
    console.log(`🗑️ 已移除作品: ${workId}`)
  },

  /**
   * 页面卸载时的完整内存清理
   */
  onUnload() {
    console.log('📱 开始页面内存清理...')

    // 🔄 注销所有全局轮询任务
    if (this.data.progressList && this.data.progressList.length > 0) {
      this.data.progressList.forEach(task => {
        app.unregisterPolling(task.taskId, this.pagePath)
      })
    }

    // 清理所有定时器（使用wx.clearInterval）
    this.clearAllTimers()

    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer)
      this.memoryCleanupTimer = null
    }

    // 清理setData批处理定时器
    if (this.setDataTimer) {
      clearTimeout(this.setDataTimer)
      this.setDataTimer = null
    }

    // 🚀 清理实时监听防抖定时器
    if (this._realtimeDebounceTimer) {
      clearTimeout(this._realtimeDebounceTimer)
      this._realtimeDebounceTimer = null
    }

    // 处理剩余的setData队列
    if (this.setDataQueue && this.setDataQueue.length > 0) {
      this._processBatchedSetData()
    }
    this.setDataQueue = null

    // 清理图片懒加载观察器
    if (this.imageObserver) {
      this.imageObserver.disconnect()
      this.imageObserver = null
    }

    // 关闭实时监听
    if (this._watcher) {
      this._watcher.close()
      this._watcher = null
    }

    if (this.loadingHideTimer) {
      clearTimeout(this.loadingHideTimer)
      this.loadingHideTimer = null
    }

    // 清理缓存和引用
    if (this._urlCache) {
      this._urlCache.clear()
      this._urlCache = null
    }

    // 清理其他引用
    this._works = null
    this._notifiedTasks = null
    this._activeTaskPolling = null
    this._pollingTimers = null

    console.log('📱 页面内存清理完成')
  }
})