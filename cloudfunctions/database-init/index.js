// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { action } = event

  if (action === 'add_gemini_models') {
    return await addGeminiModels()
  }

  if (action === 'init_missing_collections') {
    return await initMissingCollections()
  }

  return {
    success: false,
    message: '未知操作'
  }
}

async function addGeminiModels() {
  const models = [
    {
      model_id: 'gemini-openai-compatible',
      model_name: 'Gemini (OpenAI兼容格式)',
      model_type: 'image',
      api_format: 'openai_compatible',
      api_url: 'https://apis.kuai.host/v1/chat/completions',
      api_key: '{{GEMINI_OPENAI_API_KEY}}',
      model_config: 'gemini-2.0-flash-thinking-exp-1219',
      status: 'active',
      created_time: new Date(),
      description: 'Gemini API (OpenAI兼容格式)，支持环境变量API密钥配置',
      parameters: {
        max_tokens: 4096,
        temperature: 0.7,
        response_format: 'markdown'
      }
    },
    {
      model_id: 'gemini-google-official',
      model_name: 'Gemini (Google官方格式)',
      model_type: 'image',
      api_format: 'google_official',
      api_url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent',
      api_key: '{{GEMINI_GOOGLE_API_KEY}}',
      model_config: 'gemini-2.5-flash-image-preview',
      status: 'active',
      created_time: new Date(),
      description: 'Gemini API (Google官方格式)，支持环境变量API密钥配置',
      parameters: {
        temperature: 0.7,
        top_p: 0.8,
        max_output_tokens: 8192
      }
    }
  ]

  try {
    console.log('开始添加Gemini API模型到数据库...')
    const results = []

    for (const model of models) {
      // 检查是否已存在
      const existing = await db.collection('aimodels').where({
        model_id: model.model_id
      }).get()

      if (existing.data.length > 0) {
        console.log(`模型 ${model.model_id} 已存在，更新配置...`)
        const updateResult = await db.collection('aimodels').where({
          model_id: model.model_id
        }).update({
          data: model
        })
        results.push({
          model_id: model.model_id,
          action: 'updated',
          result: updateResult
        })
      } else {
        console.log(`添加新模型 ${model.model_id}...`)
        const addResult = await db.collection('aimodels').add({
          data: model
        })
        results.push({
          model_id: model.model_id,
          action: 'added',
          result: addResult
        })
      }
    }

    return {
      success: true,
      message: '所有Gemini API模型已成功配置！',
      results: results,
      instructions: {
        environment_variables: [
          'GEMINI_OPENAI_API_KEY: 您的OpenAI兼容格式API密钥',
          'GEMINI_GOOGLE_API_KEY: 您的Google官方API密钥'
        ],
        setup_guide: '在微信云开发控制台 > 云函数 > 环境变量中设置API密钥'
      }
    }

  } catch (error) {
    console.error('添加模型失败：', error)
    return {
      success: false,
      message: '添加模型失败',
      error: error.message
    }
  }
}

async function initMissingCollections() {
  console.log('开始初始化缺失的数据库集合...')

  try {
    const results = []

    // 初始化信用记录集合
    await initCreditRecordsCollection(results)

    // 初始化订单集合
    await initOrdersCollection(results)

    // 初始化签到记录集合
    await initDailyCheckinsCollection(results)

    console.log('缺失集合初始化完成')
    return {
      success: true,
      message: '缺失集合初始化成功',
      results: results
    }
  } catch (error) {
    console.error('缺失集合初始化失败:', error)
    return {
      success: false,
      message: '缺失集合初始化失败: ' + error.message
    }
  }
}

async function initCreditRecordsCollection(results) {
  console.log('检查credit_records集合...')

  try {
    const result = await db.collection('credit_records').limit(1).get()
    console.log('credit_records集合已存在')
    results.push({
      collection: 'credit_records',
      status: 'exists'
    })
  } catch (error) {
    console.log('credit_records集合不存在，将在首次使用时自动创建')
    results.push({
      collection: 'credit_records',
      status: 'will_auto_create'
    })
  }
}

async function initOrdersCollection(results) {
  console.log('检查orders集合...')

  try {
    const result = await db.collection('orders').limit(1).get()
    console.log('orders集合已存在')
    results.push({
      collection: 'orders',
      status: 'exists'
    })
  } catch (error) {
    console.log('orders集合不存在，将在首次使用时自动创建')
    results.push({
      collection: 'orders',
      status: 'will_auto_create'
    })
  }
}

async function initDailyCheckinsCollection(results) {
  console.log('检查daily_checkins集合...')

  try {
    const result = await db.collection('daily_checkins').limit(1).get()
    console.log('daily_checkins集合已存在')
    results.push({
      collection: 'daily_checkins',
      status: 'exists'
    })
  } catch (error) {
    console.log('daily_checkins集合不存在，将在首次使用时自动创建')
    results.push({
      collection: 'daily_checkins',
      status: 'will_auto_create'
    })
  }
}