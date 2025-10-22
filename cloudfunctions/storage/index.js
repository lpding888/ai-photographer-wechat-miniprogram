// 文件存储管理云函数
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  
  try {
    switch (action) {
      case 'uploadFile':
        return await uploadFile(event, wxContext)
      case 'getTempFileURL':
        return await getTempFileURL(event, wxContext)
      case 'deleteFile':
        return await deleteFile(event, wxContext)
      case 'resolveAsset':
        return await resolveAsset(event, wxContext)
      case 'registerAsset':
        return await registerAsset(event, wxContext)
      case 'getUploadConfig':
        return await getUploadConfig(event, wxContext)
      default:
        return {
          success: false,
          message: '未知操作: ' + action
        }
    }
  } catch (error) {
    console.error('存储函数执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器错误'
    }
  }
}

/**
 * 上传文件到云存储
 */
async function uploadFile(event, wxContext) {
  const { filePath, cloudPath, fileType = 'image' } = event
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  if (!filePath || !cloudPath) {
    return {
      success: false,
      message: '文件路径和云端路径不能为空'
    }
  }
  
  try {
    // 检查用户上传限制
    const uploadLimit = await checkUploadLimit(OPENID, fileType)
    if (!uploadLimit.allowed) {
      return {
        success: false,
        message: uploadLimit.message
      }
    }
    
    // 上传文件
    const result = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: filePath // 这里需要根据实际情况调整
    })
    
    if (result.fileID) {
      // 记录上传信息
      await recordUpload(OPENID, result.fileID, cloudPath, fileType)
      
      return {
        success: true,
        data: {
          file_id: result.fileID,
          cloud_path: cloudPath
        },
        message: '上传成功'
      }
    } else {
      return {
        success: false,
        message: '上传失败'
      }
    }
    
  } catch (error) {
    console.error('上传文件失败:', error)
    return {
      success: false,
      message: '上传失败: ' + error.message
    }
  }
}

/**
 * 获取临时文件URL
 */
async function getTempFileURL(event, wxContext) {
  const { fileList } = event
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  if (!fileList || !Array.isArray(fileList)) {
    return {
      success: false,
      message: '文件列表参数无效'
    }
  }
  
  try {
    const result = await cloud.getTempFileURL({
      fileList: fileList
    })
    
    const fileUrls = {}
    
    if (result.fileList) {
      result.fileList.forEach(file => {
        if (file.status === 0 && file.tempFileURL) {
          fileUrls[file.fileID] = file.tempFileURL
        }
      })
    }
    
    return {
      success: true,
      data: fileUrls,
      message: '获取临时URL成功'
    }
    
  } catch (error) {
    console.error('获取临时URL失败:', error)
    return {
      success: false,
      message: '获取临时URL失败'
    }
  }
}

/**
 * 删除文件
 */
async function deleteFile(event, wxContext) {
  const { fileList } = event
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  if (!fileList || !Array.isArray(fileList)) {
    return {
      success: false,
      message: '文件列表参数无效'
    }
  }
  
  try {
    // 检查文件权限
    const permissionCheck = await checkFilePermission(OPENID, fileList)
    if (!permissionCheck.allowed) {
      return {
        success: false,
        message: permissionCheck.message
      }
    }
    
    const result = await cloud.deleteFile({
      fileList: fileList
    })
    
    // 更新数据库记录
    await markFilesDeleted(fileList, OPENID)
    
    return {
      success: true,
      data: result,
      message: '删除文件成功'
    }
    
  } catch (error) {
    console.error('删除文件失败:', error)
    return {
      success: false,
      message: '删除文件失败'
    }
  }
}

/**
 * 查重：根据MD5解析已存在的资源
 */
async function resolveAsset(event, wxContext) {
  const { md5 } = event
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  if (!md5) {
    return {
      success: false,
      message: 'MD5值不能为空'
    }
  }
  
  try {
    // 查询相同MD5的文件
    const result = await db.collection('file_assets')
      .where({
        md5: md5,
        is_deleted: false
      })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get()
    
    if (result.data.length > 0) {
      const asset = result.data[0]
      
      // 检查文件是否仍然存在
      try {
        await cloud.getTempFileURL({
          fileList: [asset.file_id]
        })
        
        return {
          success: true,
          data: {
            hit: true,
            file_id: asset.file_id,
            cloud_path: asset.cloud_path
          },
          message: '找到相同文件'
        }
      } catch (error) {
        // 文件不存在，标记为已删除
        await db.collection('file_assets')
          .doc(asset._id)
          .update({
            data: {
              is_deleted: true,
              updated_at: new Date()
            }
          })
      }
    }
    
    return {
      success: true,
      data: {
        hit: false
      },
      message: '未找到相同文件'
    }
    
  } catch (error) {
    console.error('查重失败:', error)
    return {
      success: false,
      message: '查重失败'
    }
  }
}

/**
 * 注册资源：记录新上传的文件信息
 */
async function registerAsset(event, wxContext) {
  const { md5, file_id, size, file_type = 'image' } = event
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  if (!md5 || !file_id) {
    return {
      success: false,
      message: 'MD5和文件ID不能为空'
    }
  }
  
  try {
    const assetData = {
      user_openid: OPENID,
      file_id: file_id,
      md5: md5,
      size: size || 0,
      file_type: file_type,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date()
    }
    
    await db.collection('file_assets').add({
      data: assetData
    })
    
    return {
      success: true,
      message: '注册文件成功'
    }
    
  } catch (error) {
    console.error('注册文件失败:', error)
    return {
      success: false,
      message: '注册文件失败'
    }
  }
}

/**
 * 获取上传配置
 */
async function getUploadConfig(event, wxContext) {
  try {
    const config = {
      max_file_size: 10 * 1024 * 1024, // 10MB
      allowed_types: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      max_files_per_user: 1000,
      max_daily_uploads: 100
    }
    
    return {
      success: true,
      data: config,
      message: '获取上传配置成功'
    }
    
  } catch (error) {
    console.error('获取上传配置失败:', error)
    return {
      success: false,
      message: '获取上传配置失败'
    }
  }
}

/**
 * 检查上传限制
 */
async function checkUploadLimit(openid, fileType) {
  try {
    // 检查今日上传次数
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const todayUploads = await db.collection('file_uploads')
      .where({
        user_openid: openid,
        created_at: db.command.gte(today).and(db.command.lt(tomorrow))
      })
      .count()
    
    if (todayUploads.total >= 100) {
      return {
        allowed: false,
        message: '今日上传次数已达上限'
      }
    }
    
    // 检查总文件数
    const totalFiles = await db.collection('file_uploads')
      .where({
        user_openid: openid,
        is_deleted: false
      })
      .count()
    
    if (totalFiles.total >= 1000) {
      return {
        allowed: false,
        message: '文件总数已达上限'
      }
    }
    
    return {
      allowed: true,
      message: '允许上传'
    }
    
  } catch (error) {
    console.error('检查上传限制失败:', error)
    return {
      allowed: false,
      message: '检查上传限制失败'
    }
  }
}

/**
 * 记录上传信息
 */
async function recordUpload(openid, fileID, cloudPath, fileType) {
  try {
    await db.collection('file_uploads').add({
      data: {
        user_openid: openid,
        file_id: fileID,
        cloud_path: cloudPath,
        file_type: fileType,
        is_deleted: false,
        created_at: new Date()
      }
    })
  } catch (error) {
    console.error('记录上传信息失败:', error)
  }
}

/**
 * 检查文件权限
 */
async function checkFilePermission(openid, fileList) {
  try {
    // 检查用户是否有权限删除这些文件
    for (const fileID of fileList) {
      const result = await db.collection('file_uploads')
        .where({
          file_id: fileID,
          user_openid: openid
        })
        .get()
      
      if (result.data.length === 0) {
        return {
          allowed: false,
          message: '无权限删除文件: ' + fileID
        }
      }
    }
    
    return {
      allowed: true,
      message: '权限检查通过'
    }
    
  } catch (error) {
    console.error('检查文件权限失败:', error)
    return {
      allowed: false,
      message: '权限检查失败'
    }
  }
}

/**
 * 标记文件为已删除
 */
async function markFilesDeleted(fileList, openid) {
  try {
    for (const fileID of fileList) {
      await db.collection('file_uploads')
        .where({
          file_id: fileID,
          user_openid: openid
        })
        .update({
          data: {
            is_deleted: true,
            deleted_at: new Date()
          }
        })
    }
  } catch (error) {
    console.error('标记文件删除失败:', error)
  }
}