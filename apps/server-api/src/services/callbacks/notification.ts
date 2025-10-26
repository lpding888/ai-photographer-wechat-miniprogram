import { appConfig } from '../../config.js'

export interface CallbackEventPayload {
  eventId: string
  taskId: string
  status: string
  cosKey?: string
  bucket?: string
  region?: string
}

/**
 * 发布SCF回调事件到事件总线或队列
 *
 * 这里是占位实现，可以根据实际需求集成：
 * - Redis Pub/Sub
 * - RabbitMQ
 * - AWS SQS
 * - 自定义事件总线
 */
export const publishCallbackEvent = async (event: CallbackEventPayload): Promise<void> => {
  const config = appConfig.callbacks?.eventBus

  // 开发环境或测试环境只打印日志
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    console.info('[callback] 事件通知（开发模式）:', event)
    return
  }

  // 如果没有配置事件总线，则只记录日志
  if (!config || !config.enabled) {
    console.info('[callback] 事件总线未启用，跳过事件发布:', event)
    return
  }

  try {
    console.info('[callback] 开始发布事件:', event)

    switch (config.type) {
      case 'redis':
        await publishToRedis(event, config)
        break
      case 'rabbitmq':
        await publishToRabbitMQ(event, config)
        break
      case 'sqs':
        await publishToSQS(event, config)
        break
      case 'webhook':
        await publishToWebhook(event, config)
        break
      default:
        console.warn('[callback] 不支持的事件总线类型:', config.type)
        console.info('[callback] 回退到日志记录:', event)
    }
  } catch (error) {
    console.error('[callback] 事件发布失败:', error)
    // 事件发布失败不应该影响主流程，只记录错误
    throw error // 让调用方决定是否要处理这个错误
  }
}

/**
 * Redis Pub/Sub 实现（占位）
 */
async function publishToRedis(event: CallbackEventPayload, config: any): Promise<void> {
  console.info('[callback] Redis事件发布（占位实现）:', event)
  // TODO: 实现Redis发布逻辑
  // const redis = new Redis(config.redis)
  // await redis.publish(config.channel || 'scf-callbacks', JSON.stringify(event))
}

/**
 * RabbitMQ 实现（占位）
 */
async function publishToRabbitMQ(event: CallbackEventPayload, config: any): Promise<void> {
  console.info('[callback] RabbitMQ事件发布（占位实现）:', event)
  // TODO: 实现RabbitMQ发布逻辑
  // const connection = await amqp.connect(config.url)
  // const channel = await connection.createChannel()
  // await channel.assertQueue(config.queue || 'scf-callbacks')
  // await channel.sendToQueue(config.queue || 'scf-callbacks', Buffer.from(JSON.stringify(event)))
}

/**
 * AWS SQS 实现（占位）
 */
async function publishToSQS(event: CallbackEventPayload, config: any): Promise<void> {
  console.info('[callback] SQS事件发布（占位实现）:', event)
  // TODO: 实现SQS发布逻辑
  // const sqs = new AWS.SQS()
  // await sqs.sendMessage({
  //   QueueUrl: config.queueUrl,
  //   MessageBody: JSON.stringify(event)
  // }).promise()
}

/**
 * Webhook 实现（占位）
 */
async function publishToWebhook(event: CallbackEventPayload, config: any): Promise<void> {
  console.info('[callback] Webhook事件发布（占位实现）:', event)

  if (!config.webhookUrl) {
    throw new Error('Webhook URL未配置')
  }

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {})
      },
      body: JSON.stringify({
        event: 'scf.callback',
        timestamp: new Date().toISOString(),
        data: event
      }),
      signal: AbortSignal.timeout(5000) // 5秒超时
    })

    if (!response.ok) {
      throw new Error(`Webhook调用失败: ${response.status} ${response.statusText}`)
    }

    console.info('[callback] Webhook事件发布成功:', response.status)
  } catch (error) {
    console.error('[callback] Webhook事件发布失败:', error)
    throw error
  }
}

/**
 * 获取事件配置（用于调试）
 */
export const getEventBusConfig = () => {
  return appConfig.callbacks?.eventBus || { enabled: false }
}
