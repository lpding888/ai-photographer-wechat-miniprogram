/**
 * URL缓存模块
 * 职责：getTempFileURL的缓存核心逻辑
 */

const cloud = require('wx-server-sdk')
const { CACHE } = require('../config/constants')
const { optimizeTempFileURLResult } = require('./imageOptimizer')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 批量获取临时URL（带缓存）
 * @param {Array} fileIds - 文件ID数组
 * @param {Object} options - 选项
 * @param {boolean} options.optimize - 是否优化图片
 * @param {Object} options.imageOptions - 图片优化参数
 * @returns {Object} 结果对象
 */
async function getTempUrlsWithCache(fileIds, options = {}) {
  if (!fileIds || fileIds.length === 0) {
    return {
      success: true,
      data: [],
      stats: {
        total: 0,
        cached: 0,
        fetched: 0,
        cacheHitRate: '0%'
      }
    }
  }

  console.log(`📦 [缓存] 请求临时URL: ${fileIds.length}个文件`)

  const now = new Date()
  const results = []
  const needFetchIds = []
  const needFetchIndexMap = {}

  try {
    // 1. 从缓存查询（查询未过期的记录）
    const cacheResult = await db.collection(CACHE.COLLECTION)
      .where({
        file_id: _.in(fileIds),
        expire_time: _.gt(now)  // 只查询未过期的缓存
      })
      .get()

    const cachedMap = {}
    cacheResult.data.forEach(cache => {
      cachedMap[cache.file_id] = cache.temp_url
    })

    // 2. 分离已缓存和未缓存的文件
    fileIds.forEach((fileId, index) => {
      if (cachedMap[fileId]) {
        results[index] = {
          fileID: fileId,
          tempFileURL: cachedMap[fileId],
          status: 0,
          cached: true
        }
      } else {
        needFetchIds.push(fileId)
        needFetchIndexMap[fileId] = index
        results[index] = null // 占位
      }
    })

    console.log(`✅ [缓存] 命中: ${Object.keys(cachedMap).length}/${fileIds.length}`)

  } catch (error) {
    console.error('❌ [缓存] 查询失败,降级到完整获取:', error)
    // 缓存查询失败，重置数据结构，全部重新获取
    needFetchIds.length = 0
    needFetchIds.push(...fileIds)
    Object.keys(needFetchIndexMap).forEach(key => delete needFetchIndexMap[key])
    fileIds.forEach((fileId, index) => {
      needFetchIndexMap[fileId] = index
      results[index] = null
    })
  }

  // 3. 获取未缓存的临时URL
  if (needFetchIds.length > 0) {
    console.log(`🔄 [缓存] 需获取: ${needFetchIds.length}个`)

    try {
      const tempResult = await cloud.getTempFileURL({
        fileList: needFetchIds
      })

      // 4. 保存到缓存并填充结果
      const expireTime = new Date(Date.now() + CACHE.DURATION)
      const cachePromises = []

      tempResult.fileList.forEach(file => {
        const index = needFetchIndexMap[file.fileID]
        results[index] = {
          ...file,
          cached: false
        }

        // 只缓存成功的URL
        if (file.status === 0) {
          // 先删除旧缓存，再添加新缓存（避免重复记录）
          cachePromises.push(
            db.collection(CACHE.COLLECTION)
              .where({ file_id: file.fileID })
              .remove()
              .then(() => {
                return db.collection(CACHE.COLLECTION).add({
                  data: {
                    file_id: file.fileID,
                    temp_url: file.tempFileURL,
                    expire_time: expireTime,
                    created_at: now
                  }
                })
              })
              .catch(err => {
                console.error('❌ [缓存] 保存失败:', file.fileID, err.message)
              })
          )
        }
      })

      // 批量保存缓存（不等待完成）
      if (cachePromises.length > 0) {
        Promise.all(cachePromises).then(() => {
          console.log(`✅ [缓存] 已保存: ${cachePromises.length}个`)
        }).catch(err => {
          console.error('❌ [缓存] 批量保存失败:', err)
        })
      }

    } catch (error) {
      console.error('❌ [缓存] getTempFileURL失败:', error)
      return {
        success: false,
        message: '获取临时URL失败: ' + error.message
      }
    }
  }

  // 5. 应用图片优化（如果指定）
  let finalResults = results
  if (options.optimize && options.imageOptions) {
    finalResults = optimizeTempFileURLResult(results, options.imageOptions)
  }

  // 6. 计算统计信息
  const cachedCount = fileIds.length - needFetchIds.length
  const stats = {
    total: fileIds.length,
    cached: cachedCount,
    fetched: needFetchIds.length,
    cacheHitRate: fileIds.length > 0
      ? ((cachedCount / fileIds.length) * 100).toFixed(2) + '%'
      : '0%'
  }

  console.log(`📊 [缓存] 统计:`, stats)

  return {
    success: true,
    data: finalResults,
    stats: stats
  }
}

/**
 * 批量删除缓存
 * @param {Array} fileIds - 文件ID数组
 * @returns {Object} 删除结果
 */
async function deleteCacheByFileIds(fileIds) {
  if (!fileIds || fileIds.length === 0) {
    return {
      success: true,
      deleted: 0
    }
  }

  try {
    const result = await db.collection(CACHE.COLLECTION)
      .where({
        file_id: _.in(fileIds)
      })
      .remove()

    console.log(`🗑️ [缓存] 已删除: ${result.stats.removed}条`)

    return {
      success: true,
      deleted: result.stats.removed
    }
  } catch (error) {
    console.error('❌ [缓存] 删除失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
}

module.exports = {
  getTempUrlsWithCache,
  deleteCacheByFileIds
}
