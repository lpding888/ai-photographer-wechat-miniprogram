# 认证中间件系统

这是一个企业级的统一认证中间件，支持多种认证策略，采用责任链模式设计。

## 🎯 特性

- ✅ **多策略支持**: JWT、微信小程序、API Key
- ✅ **责任链模式**: 按优先级依次尝试认证策略
- ✅ **数据库集成**: 与Prisma UserIdentity表完整集成
- ✅ **权限系统**: 细粒度的权限和角色管理
- ✅ **VIP支持**: 完整的VIP等级和过期检查
- ✅ **类型安全**: 完整的TypeScript类型定义
- ✅ **日志记录**: 结构化的认证日志
- ✅ **错误处理**: 统一的错误响应格式

## 📁 文件结构

```
src/plugins/auth/
├── index.ts                    # 插件入口和Fastify集成
├── types.ts                    # TypeScript类型定义
├── auth-middleware.ts          # 中间件核心逻辑
├── README.md                   # 使用文档
└── strategies/                 # 认证策略实现
    ├── base-strategy.ts        # 策略基类
    ├── jwt-strategy.ts         # JWT认证策略
    ├── wechat-strategy.ts      # 微信认证策略
    └── api-key-strategy.ts     # API Key认证策略
```

## 🚀 快速开始

### 1. 基本使用

```typescript
import fastify from 'fastify'
import authPlugin from './plugins/auth/index.js'
import { getAuthConfig } from './config/auth.js'

const app = fastify()

// 注册认证插件
await app.register(authPlugin, getAuthConfig())
```

### 2. 路由认证

```typescript
// 必须认证的路由
app.get('/protected', {
  preHandler: app.authenticate()
}, async (request) => {
  return { user: request.user }
})

// 可选认证的路由
app.get('/optional', {
  preHandler: app.authenticate({ required: false })
}, async (request) => {
  return {
    user: request.user || null,
    message: request.user ? '已登录' : '未登录'
  }
})
```

### 3. 权限检查

```typescript
// 检查权限
app.get('/admin', {
  preHandler: [
    app.authenticate(),
    app.requirePermissions(['manage:system'])
  ]
}, async (request) => {
  // 管理员操作
})

// 检查角色
app.delete('/users/:id', {
  preHandler: [
    app.authenticate(),
    app.requireRoles(['ADMIN', 'SUPER_ADMIN'])
  ]
}, async (request) => {
  // 删除用户
})

// 检查VIP等级
app.post('/vip/generate', {
  preHandler: [
    app.authenticate(),
    app.requireVip('PRO')
  ]
}, async (request) => {
  // VIP专属功能
})
```

## 🔧 配置说明

### 基本配置

```typescript
// src/config/auth.ts
export const authConfig = {
  // 默认认证配置
  default: {
    required: false, // 是否默认需要认证
    excludeRoutes: [
      '/health',        // 排除健康检查
      '/docs',          // 排除API文档
      '/api/v1/auth/*'  // 排除认证相关路由
    ]
  },

  // JWT配置
  jwt: {
    secret: 'your-jwt-secret',
    expiresIn: '7d',
    issuer: 'your-app',
    audience: 'your-clients'
  },

  // 微信配置
  wechat: {
    appId: 'your-wechat-app-id',
    appSecret: 'your-wechat-app-secret'
  },

  // API Key配置
  apiKey: {
    keys: [
      {
        key: 'api-key-1',
        userId: 'user-1',
        permissions: ['read:profile'],
        active: true
      }
    ]
  }
}
```

### 环境变量

```bash
# 必需的环境变量
JWT_SECRET=your-super-secret-jwt-key
WECHAT_APP_ID=your-wechat-app-id
WECHAT_APP_SECRET=your-wechat-app-secret

# 可选的环境变量
INTERNAL_API_KEY=internal-service-key
ADMIN_API_KEY=admin-key
```

## 📋 认证策略

### 1. JWT认证

支持Bearer token和查询参数两种方式：

```bash
# 请求头方式
Authorization: Bearer <jwt-token>

# 查询参数方式
GET /api/protected?token=<jwt-token>
```

生成Token：
```typescript
const token = app.generateToken(user, '7d')
```

验证Token：
```typescript
const user = await app.verifyToken(token)
```

### 2. 微信小程序认证

通过code换取session_key：

```typescript
// 前端调用
wx.login({
  success: (res) => {
    // 发送code到后端
    fetch('/api/v1/auth/wechat/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: res.code })
    })
  }
})
```

### 3. API Key认证

支持请求头和查询参数：

```bash
# 请求头方式
X-API-Key: <api-key>

# 查询参数方式
GET /api/protected?apiKey=<api-key>
```

## 👥 用户和权限系统

### 用户角色

- `USER`: 普通用户
- `VIP`: VIP用户
- `ADMIN`: 管理员
- `SUPER_ADMIN`: 超级管理员

### 权限列表

#### 用户权限
- `read:profile`: 读取个人信息
- `update:profile`: 更新个人信息

#### 作品权限
- `create:work`: 创建作品
- `read:work`: 读取作品
- `update:work`: 更新作品
- `delete:work`: 删除作品

#### VIP权限
- `upgrade:vip`: 升级VIP
- `use:vip_features`: 使用VIP功能

#### 管理员权限
- `manage:users`: 管理用户
- `manage:works`: 管理作品
- `manage:system`: 管理系统
- `view:statistics`: 查看统计

### 数据库集成

认证系统与以下数据库表集成：

- `users`: 用户基本信息
- `user_identities`: 用户身份绑定

**用户表结构**:
```sql
users {
  id: string
  nickname: string?
  avatar_url: string?
  vip_level: enum(FREE, BASIC, PRO, ENTERPRISE)
  vip_expired_at: datetime?
  metadata: json  -- 存储permissions, roles等动态数据
}
```

**身份表结构**:
```sql
user_identities {
  id: string
  user_id: string
  provider: enum(WECHAT_MINIAPP, WECHAT_OPEN, PHONE, EMAIL, APPLE, GOOGLE)
  identifier: string  -- openid, phone number, email等
  verified: boolean
  metadata: json
}
```

## 🔒 安全特性

### 1. 时序攻击防护

```typescript
// 在BaseAuthStrategy中实现
protected async delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

### 2. 微信数据签名验证

```typescript
// 验证微信数据签名
const isValid = await wechatStrategy.validateSignature(
  rawData,
  signature,
  sessionKey
)
```

### 3. 错误信息脱敏

```typescript
// API Key掩码显示
private maskApiKey(apiKey: string): string {
  return `${apiKey.substring(0, 4)}***${apiKey.substring(apiKey.length - 4)}`
}
```

## 📊 日志和监控

### 认证日志格式

```json
{
  "level": "info",
  "msg": "[Auth:wechat] 微信认证成功",
  "strategy": "wechat",
  "requestId": "req-123",
  "userId": "user-456",
  "openid": "wx-openid-***",
  "platform": "MINIAPP",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 错误监控

```typescript
// 认证失败时会记录详细日志
request.log.error('[AuthMiddleware] 认证失败', {
  error: 'INVALID_TOKEN',
  url: '/api/protected',
  method: 'GET',
  userAgent: 'Mozilla/5.0...',
  ip: '192.168.1.100'
})
```

## 🧪 测试示例

### JWT认证测试

```bash
# 1. 获取token
curl -X POST http://localhost:3000/api/v1/auth/jwt/login \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "password": "test"}'

# 2. 使用token访问受保护路由
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <token>"
```

### 微信认证测试

```bash
# 使用code进行微信认证
curl -X POST http://localhost:3000/api/v1/auth/wechat/login \
  -H "Content-Type: application/json" \
  -d '{"code": "wechat-auth-code"}'
```

### API Key认证测试

```bash
# 使用API Key访问
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "X-API-Key: <api-key>"
```

## 🔧 扩展开发

### 添加新的认证策略

1. 继承BaseAuthStrategy：

```typescript
export class CustomStrategy extends BaseAuthStrategy {
  public readonly name = 'custom'

  public supports(request: FastifyRequest): boolean {
    // 检查是否支持当前请求
    return true
  }

  public async authenticate(request: FastifyRequest): Promise<UserContext | null> {
    // 实现认证逻辑
    return userContext
  }
}
```

2. 注册策略：

```typescript
app.register(authPlugin, {
  // 其他配置...
  strategies: [new CustomStrategy(customConfig)]
})
```

### 自定义权限检查

```typescript
// 在路由中使用自定义权限逻辑
app.get('/custom', {
  preHandler: [
    app.authenticate(),
    async (request, reply) => {
      const user = request.user!

      // 自定义权限检查
      if (!customPermissionCheck(user)) {
        return reply.status(403).send({
          success: false,
          error: { type: 'CUSTOM_PERMISSION_DENIED' }
        })
      }
    }
  ]
}, handler)
```

## 🐛 故障排除

### 常见问题

1. **JWT认证失败**
   - 检查JWT_SECRET是否正确设置
   - 确认token未过期
   - 验证token格式

2. **微信认证失败**
   - 检查微信AppID和AppSecret
   - 确认code有效期（5分钟）
   - 验证网络连接

3. **API Key认证失败**
   - 检查API Key是否正确
   - 确认API Key处于active状态
   - 验证请求头格式

### 调试技巧

1. **启用详细日志**：

```typescript
const app = fastify({
  logger: {
    level: 'debug'
  }
})
```

2. **检查认证配置**：

```typescript
// 查看已注册的策略
console.log(app.auth.getStrategies())
```

3. **测试特定策略**：

```typescript
// 单独测试某个策略
const strategy = app.auth.getStrategies().find(s => s.name === 'jwt')
const result = await strategy.authenticate(mockRequest)
```

## 📝 更新日志

### v1.0.0
- ✅ 初始版本发布
- ✅ 支持JWT、微信、API Key三种认证策略
- ✅ 完整的权限和角色系统
- ✅ 数据库集成
- ✅ 类型安全的TypeScript实现

---

**需要帮助？** 查看代码注释或联系开发团队。