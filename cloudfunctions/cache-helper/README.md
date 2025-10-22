# cache-helper 云函数

## 功能概述

提供带缓存的云存储临时URL获取服务和图片优化功能，适用于商业版和个人版。

## 模块结构

```
cache-helper/
├── index.js                    # 主入口（路由分发）
├── package.json
├── modules/                    # 功能模块
│   ├── urlCache.js            # URL缓存核心逻辑
│   ├── imageOptimizer.js      # 图片优化（WebP、缩略图）
│   └── cacheManager.js        # 缓存清理和管理
└── config/
    └── constants.js           # 配置常量
```

## 核心功能

### 1. 临时URL缓存（getTempUrls）

**作用**：缓存getTempFileURL的结果，减少API调用

**调用示例**：
```javascript
const result = await cloud.callFunction({
  name: 'cache-helper',
  data: {
    action: 'getTempUrls',
    fileIds: ['cloud://xxx.jpg', 'cloud://yyy.png'],
    options: {
      optimize: true,          // 是否优化图片
      imageOptions: {
        format: 'webp',        // 转换为WebP格式
        quality: 85,           // 质量85
        width: 400,            // 宽度400px
        preset: 'medium'       // 或使用预设尺寸
      }
    }
  }
})

// 返回格式与getTempFileURL完全一致
// result.data = [
//   { fileID: '...', tempFileURL: '...', status: 0, cached: true },
//   ...
// ]
// result.stats = { total: 2, cached: 1, fetched: 1, cacheHitRate: '50%' }
```

### 2. 图片优化（optimizeUrl）

**作用**：为图片URL添加处理参数（无需缓存）

**调用示例**：
```javascript
const result = await cloud.callFunction({
  name: 'cache-helper',
  data: {
    action: 'optimizeUrl',
    url: 'https://xxx.jpg',
    options: {
      format: 'webp',
      quality: 85,
      width: 300,
      height: 300
    }
  }
})
// result.data.optimized = 'https://xxx.jpg?imageMogr2/thumbnail/300x300/format/webp/quality/85'
```

### 3. 缓存管理

#### 清除过期缓存
```javascript
// 建议配置定时触发器，每小时执行一次
const result = await cloud.callFunction({
  name: 'cache-helper',
  data: { action: 'clearExpiredCache' }
})
```

#### 获取缓存统计
```javascript
const result = await cloud.callFunction({
  name: 'cache-helper',
  data: { action: 'getCacheStats' }
})
// result.data = { total: 1000, valid: 700, expired: 300, ... }
```

#### 健康检查
```javascript
const result = await cloud.callFunction({
  name: 'cache-helper',
  data: { action: 'healthCheck' }
})
// result.health = 'healthy' | 'warning' | 'critical'
```

## 性能优化

### 缓存策略
- 有效期：1.5小时（临时URL有效期2小时，留30分钟余量）
- 存储方式：数据库集合 `file_url_cache`
- 过期清理：建议配置定时触发器

### 预期效果
- API调用减少：**70%**
- 响应速度提升：**50%+**
- 用户体验：显著改善

## 数据库配置

创建集合 `file_url_cache`，权限设置：
```json
{
  "read": false,
  "write": false
}
```

索引建议：
- `file_id` - 单字段索引
- `expire_time` - 单字段索引

## 集成指南

### 在云函数中使用

```javascript
// photography-worker/index.js 或其他worker
// 生成完成后获取临时URL

// 修改前
const tempResult = await cloud.getTempFileURL({
  fileList: [resultFileId]
})

// 修改后
const tempResult = await cloud.callFunction({
  name: 'cache-helper',
  data: {
    action: 'getTempUrls',
    fileIds: [resultFileId],
    options: {
      optimize: true,
      imageOptions: { format: 'webp', quality: 85 }
    }
  }
})

// 使用方式完全相同
const url = tempResult.result.data[0].tempFileURL
```

### 在前端使用

```javascript
// miniprogram/pages/works/works.js
// 作品列表加载图片

const fileIds = works.map(w => w.fileId)
const result = await wx.cloud.callFunction({
  name: 'cache-helper',
  data: {
    action: 'getTempUrls',
    fileIds: fileIds,
    options: {
      optimize: true,
      imageOptions: { preset: 'medium' }  // 使用预设的中等尺寸
    }
  }
})
```

## 配置说明

### config/constants.js

```javascript
CACHE: {
  DURATION: 90 * 60 * 1000,      // 缓存时长（毫秒）
  COLLECTION: 'file_url_cache',  // 集合名
  MAX_BATCH_SIZE: 50             // 批量处理上限
}

IMAGE_OPTIMIZATION: {
  DEFAULT_FORMAT: 'webp',        // 默认格式
  DEFAULT_QUALITY: 85,           // 默认质量
  THUMBNAIL_SIZES: {
    small: { width: 200, height: 200 },
    medium: { width: 400, height: 400 },
    large: { width: 800, height: 800 }
  }
}
```

## 定时任务配置

在微信开发者工具中配置定时触发器：

```yaml
# 触发器名称：清理过期缓存
# 触发周期：每小时
# 云函数：cache-helper
# 参数：{ "action": "clearExpiredCache" }
```

## 监控建议

1. **缓存命中率监控**：目标 >70%
2. **缓存记录数监控**：建议 <10万条
3. **过期率监控**：建议 <30%

可通过 `getCacheStats` 和 `healthCheck` 获取监控数据。

## 注意事项

1. ✅ **向后兼容**：返回格式与getTempFileURL完全一致
2. ✅ **失败降级**：缓存查询失败时自动降级到getTempFileURL
3. ⚠️ **不要缓存用户敏感文件**：只缓存作品图片等公开内容
4. ⚠️ **定期清理**：避免缓存表无限增长

## 维护指南

### 修改缓存时长
编辑 `config/constants.js` 中的 `CACHE.DURATION`

### 修改图片优化参数
编辑 `config/constants.js` 中的 `IMAGE_OPTIMIZATION`

### 扩展新功能
在 `modules/` 目录下创建新模块，在 `index.js` 中添加路由

## 版本历史

- v1.0.0 (2025-10-11)
  - 初始版本
  - 实现URL缓存、图片优化、缓存管理功能
  - 模块化设计

---

**维护人**：开发团队
**创建日期**：2025-10-11
