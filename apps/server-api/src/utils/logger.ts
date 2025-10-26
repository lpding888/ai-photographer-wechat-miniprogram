import { Writable } from 'node:stream'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import type { FastifyLoggerOptions } from 'fastify'
import { multistream, transport } from 'pino'

import { appConfig } from '../config.js'

interface ClsConfig {
  enabled: boolean
  endpoint: string | null
  topicId: string | null
  secretId: string | null
  secretKey: string | null
}

interface RetryLogEntry {
  id: string
  chunk: string
  timestamp: number
  retryCount: number
  nextRetryTime: number
}

type StreamWrapper = { stream: NodeJS.WritableStream }

class ClsStream extends Writable {
  private retryQueuePath: string
  private maxRetries: number = 3
  private retryBaseDelay: number = 1000 // 1秒基础延迟
  private retryMaxDelay: number = 30000 // 最大30秒延迟
  private retryQueueSize: number = 1000 // 最多缓存1000条日志
  private flushInterval: NodeJS.Timeout | null = null

  constructor(private readonly config: ClsConfig) {
    super({ decodeStrings: false })

    // 重试队列文件路径
    this.retryQueuePath = join(process.cwd(), '.cls-retry-queue.json')

    // 启动重试处理定时器
    this.startRetryProcessor()

    // 确保进程退出时保存重试队列
    process.on('beforeExit', () => {
      this.saveRetryQueueToFile(this.getRetryQueue())
    })

    process.on('SIGINT', () => {
      this.saveRetryQueueToFile(this.getRetryQueue())
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      this.saveRetryQueueToFile(this.getRetryQueue())
      process.exit(0)
    })
  }

  private startRetryProcessor() {
    // 每30秒处理一次重试队列
    this.flushInterval = setInterval(() => {
      this.processRetryQueue()
    }, 30000)

    // 立即处理一次已有的重试队列
    this.processRetryQueue()
  }

  private getRetryQueue(): RetryLogEntry[] {
    try {
      if (existsSync(this.retryQueuePath)) {
        const data = readFileSync(this.retryQueuePath, 'utf8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.error('读取重试队列失败:', error)
    }
    return []
  }

  private saveRetryQueueToFile(queue: RetryLogEntry[] = []) {
    try {
      writeFileSync(this.retryQueuePath, JSON.stringify(queue, null, 2))
    } catch (error) {
      console.error('保存重试队列失败:', error)
    }
  }

  private addToRetryQueue(chunk: string | Buffer) {
    const queue = this.getRetryQueue()

    // 如果队列太满，删除最老的条目
    if (queue.length >= this.retryQueueSize) {
      queue.splice(0, queue.length - this.retryQueueSize + 1)
    }

    const serializedChunk = typeof chunk === 'string' ? chunk : chunk.toString('utf8')

    const entry: RetryLogEntry = {
      id: `cls_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      chunk: serializedChunk,
      timestamp: Date.now(),
      retryCount: 0,
      nextRetryTime: Date.now() + this.retryBaseDelay
    }

    queue.push(entry)
    this.saveRetryQueueToFile(queue)

    console.warn(`CLS推送失败，日志已加入重试队列: ${entry.id}`)
  }

  private async processRetryQueue() {
    const queue = this.getRetryQueue()
    if (queue.length === 0) {
      return
    }

    const now = Date.now()
    const remainingQueue: RetryLogEntry[] = []
    let processedCount = 0

    for (const entry of queue) {
      if (entry.nextRetryTime > now) {
        // 还没到重试时间
        remainingQueue.push(entry)
        continue
      }

      try {
        await this.sendToCLS(entry.chunk)
        console.log(`CLS重试成功: ${entry.id} (重试${entry.retryCount}次)`)
        processedCount++
      } catch (error) {
        entry.retryCount++

        if (entry.retryCount >= this.maxRetries) {
          console.error(`CLS重试失败，达到最大重试次数: ${entry.id}`, error)
        } else {
          // 计算下次重试时间（指数退避 + 随机抖动）
          const exponentialDelay = Math.min(
            this.retryBaseDelay * Math.pow(2, entry.retryCount),
            this.retryMaxDelay
          )
          const jitter = Math.random() * 0.1 * exponentialDelay // 10%随机抖动
          entry.nextRetryTime = now + exponentialDelay + jitter

          remainingQueue.push(entry)
          console.warn(`CLS重试失败，将在${Math.round((entry.nextRetryTime - now) / 1000)}秒后重试: ${entry.id}`)
        }
      }
    }

    if (processedCount > 0) {
      console.log(`CLS重试处理完成，成功${processedCount}条，剩余${remainingQueue.length}条`)
    }

    this.saveRetryQueueToFile(remainingQueue)
  }

  private async sendToCLS(chunk: string): Promise<void> {
    if (!this.config.enabled || !this.config.endpoint || !this.config.topicId) {
      throw new Error('CLS配置不完整')
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CLS-TopicId': this.config.topicId,
        ...(this.config.secretId ? { 'X-CLS-SecretId': this.config.secretId } : {}),
        ...(this.config.secretKey ? { 'X-CLS-SecretKey': this.config.secretKey } : {}),
      },
      body: chunk,
      signal: AbortSignal.timeout(10000) // 10秒超时
    })

    if (!response.ok) {
      throw new Error(`CLS推送失败: HTTP ${response.status} ${response.statusText}`)
    }
  }

  override _write(chunk: string | Buffer, _encoding: NodeJS.BufferEncoding, callback: (error?: Error | null) => void) {
    if (!this.config.enabled || !this.config.endpoint || !this.config.topicId) {
      callback()
      return
    }

    const processedChunk = typeof chunk === 'string' ? chunk : chunk.toString('utf8')

    // 异步发送，不等待结果
    this.sendToCLS(processedChunk)
      .catch(error => {
        console.error('CLS 推送失败，加入重试队列:', error)
        this.addToRetryQueue(chunk)
      })
      .finally(() => {
        callback()
      })
  }

  override destroy(error?: Error): this {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    this.saveRetryQueueToFile(this.getRetryQueue())
    return super.destroy(error)
  }
}

const toLoggingConfig = () => {
  if (appConfig.logging) {
    return appConfig.logging
  }

  const prettyFallback = appConfig.nodeEnv !== 'production'

  return {
    level: 'info',
    pretty: prettyFallback,
    cls: {
      enabled: false,
      endpoint: null,
      topicId: null,
      secretId: null,
      secretKey: null,
    },
  }
}

export const buildLoggerOptions = (): FastifyLoggerOptions => {
  const loggingConfig = toLoggingConfig()
  const streams: StreamWrapper[] = []

  if (loggingConfig.pretty) {
    streams.push({
      stream: transport({
        target: 'pino-pretty',
        options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' },
      }),
    })
  } else {
    streams.push({ stream: process.stdout })
  }

  if (loggingConfig.cls.enabled) {
    streams.push({ stream: new ClsStream(loggingConfig.cls) })
  }

  const stream = streams.length === 1 ? streams[0].stream : multistream(streams)

  return {
    level: loggingConfig.level,
    stream,
  }
}
