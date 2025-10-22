// 数据库配置
module.exports = {
  // 集合名称配置
  collections: {
    users: 'users',
    works: 'works',
    tasks: 'task_queue',
    scenes: 'scenes',
    orders: 'orders',
    logs: 'logs',
    apiConfigs: 'api_configs',  // 修复：映射到正确的集合名
    promptTemplates: 'prompt_templates',
    aiModels: 'api_configs'     // 修复：统一映射到api_configs集合
  },
  
  // 数据库索引配置
  indexes: {
    users: [
      { field: 'openid', unique: true },
      { field: 'created_at' }
    ],
    works: [
      { field: 'user_openid' },
      { field: 'type' },
      { field: 'status' },
      { field: 'is_favorite' },
      { field: 'created_at' },
      { field: 'task_id' }
    ],
    tasks: [
      { field: 'user_openid' },
      { field: 'status' },
      { field: 'created_at' },
      { field: 'type' }
    ],
    orders: [
      { field: 'user_openid' },
      { field: 'status' },
      { field: 'created_at' }
    ],
    aiModels: [
      { field: 'provider' },
      { field: 'model_type' },
      { field: 'is_active' },
      { field: 'priority' },
      { field: 'weight' }
    ]
  },
  
  // 数据库连接配置
  connection: {
    timeout: 30000,
    retryWrites: true
  },
  
  // 查询配置
  query: {
    defaultLimit: 20,
    maxLimit: 100,
    defaultSort: { created_at: -1 }
  }
}