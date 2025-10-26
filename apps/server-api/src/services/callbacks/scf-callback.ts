import { appConfig } from '../../config.js'
import { computeHmacSha256 } from '../../utils/hmac.js'
import { legacyError, legacySuccess, type LegacyResponse } from '../../utils/legacy-response.js'

import { callbacksRepository, type CallbackRecord } from './callback-repository.js'
import { publishCallbackEvent } from './notification.js'

const FALLBACK_SECRET = 'replace-me'

const getScfConfig = () => {
  return appConfig.callbacks?.scf ?? {
    secret: FALLBACK_SECRET,
    cos: {
      validate: false,
      baseUrl: null,
    },
  }
}

interface CosObjectInfo {
  key: string
  bucket: string
  region: string
  etag?: string
  size?: number
}

export interface ScfCallbackPayload {
  eventId: string
  taskId: string
  status: 'SUCCESS' | 'FAILED' | 'RETRYING'
  outputKeys: string[]
  cosObject: CosObjectInfo
  metadata?: Record<string, unknown>
}

export const verifySignature = (body: unknown, signature: string | undefined): boolean => {
  if (!signature) {
    console.warn('[scf-callback] 缺少签名头')
    return false
  }

  const secret = getScfConfig().secret
  const payload = JSON.stringify(body ?? {})
  const expected = computeHmacSha256(payload, secret)

  const isValid = expected === signature
  if (!isValid) {
    console.error('[scf-callback] 签名验证失败', {
      expected,
      received: signature,
      payloadPreview: payload.substring(0, 200) + (payload.length > 200 ? '...' : '')
    })
  }

  return isValid
}

const isCosObjectInfoValid = (info: CosObjectInfo): boolean => {
  const isValid = Boolean(info?.key && info?.bucket && info?.region)
  if (!isValid) {
    console.warn('[scf-callback] COS对象信息不完整:', info)
  }
  return isValid
}

const validateCosObject = async (info: CosObjectInfo): Promise<boolean> => {
  const config = getScfConfig().cos
  if (!config.validate || !config.baseUrl) {
    console.debug('[scf-callback] COS校验已禁用或未配置baseUrl，跳过校验')
    return true
  }

  try {
    console.debug('[scf-callback] 开始COS校验', {
      key: info.key,
      bucket: info.bucket,
      region: info.region,
      baseUrl: config.baseUrl
    })

    // 构造COS对象的完整URL
    const cosUrl = new URL(info.key.replace(/^\//, ''),
      config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`)

    console.debug('[scf-callback] 校验URL:', cosUrl.toString())

    const response = await fetch(cosUrl.toString(), {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000) // 10秒超时
    })

    if (!response.ok) {
      throw new Error(`COS对象校验失败: HTTP ${response.status} ${response.statusText}`)
    }

    // 校验ETag（如果提供了）
    if (info.etag) {
      const responseEtag = response.headers.get('etag')?.replace(/"/g, '')
      if (responseEtag && responseEtag !== info.etag) {
        throw new Error(`COS对象ETag不匹配: 期望 ${info.etag}, 实际 ${responseEtag}`)
      }
      console.debug('[scf-callback] ETag校验通过:', responseEtag)
    }

    // 校验文件大小（如果提供了）
    if (typeof info.size === 'number') {
      const contentLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(contentLength) && contentLength !== info.size) {
        throw new Error(`COS对象大小不匹配: 期望 ${info.size}, 实际 ${contentLength}`)
      }
      console.debug('[scf-callback] 文件大小校验通过:', contentLength)
    }

    console.debug('[scf-callback] COS校验成功')
    return true
  } catch (error) {
    console.error('[scf-callback] COS校验失败:', error)
    return false
  }
}

type ScfCallbackSuccessPayload = { received: true } | { duplicate: true }
type ScfCallbackErrorPayload = { reason: string; eventId: string; taskId: string }

export const handleScfCallback = async (
  payload: ScfCallbackPayload,
  signature?: string
): Promise<LegacyResponse<ScfCallbackSuccessPayload | ScfCallbackErrorPayload>> => {
  console.info('[scf-callback] 开始处理SCF回调', {
    eventId: payload.eventId,
    taskId: payload.taskId,
    status: payload.status
  })

  // 基础参数验证
  if (!payload?.eventId || !payload?.taskId) {
    console.error('[scf-callback] 缺少必要参数: eventId或taskId')
    return legacyError('缺少 eventId 或 taskId', 400)
  }

  if (!isCosObjectInfoValid(payload.cosObject)) {
    console.error('[scf-callback] COS对象信息不完整:', payload.cosObject)
    return legacyError('COS 对象信息不完整', 400)
  }

  // 签名校验（在可配置开关下）
  const config = getScfConfig()
  if (config.secret !== FALLBACK_SECRET && !verifySignature(payload, signature)) {
    return legacyError('签名校验失败', 401)
  }

  // 幂等性检查 - 检查是否已处理过该事件
  const isDuplicate = await callbacksRepository.has(payload.eventId)
  if (isDuplicate) {
    console.info('[scf-callback] 发现重复事件，忽略处理:', payload.eventId)
    return legacySuccess(
      { duplicate: true },
      '回调已处理（重复事件忽略）',
      200
    )
  }

  // COS对象校验（可配置开关）
  const cosValid = await validateCosObject(payload.cosObject)
  if (!cosValid) {
    console.error('[scf-callback] COS校验失败:', payload.cosObject)
    return legacyError('COS 校验失败', 422)
  }

  try {
    // 准备保存的数据
    const callbackRecord: CallbackRecord = {
      eventId: payload.eventId,
      taskId: payload.taskId,
      status: payload.status,
      cosKey: payload.cosObject.key,
      bucket: payload.cosObject.bucket,
      region: payload.cosObject.region,
      etag: payload.cosObject.etag,
      size: payload.cosObject.size,
      signature: signature,
      isValidated: config.cos.validate,
      receivedAt: new Date().toISOString(),
      rawPayload: payload,
    }

    // 保存到数据库
    const savedRecord = await callbacksRepository.save(callbackRecord)
    console.info('[scf-callback] 回调记录保存成功:', savedRecord.id)

    // 发布事件通知（异步执行，不等待结果）
    try {
      await publishCallbackEvent({
        eventId: payload.eventId,
        taskId: payload.taskId,
        status: payload.status,
        cosKey: payload.cosObject.key,
        bucket: payload.cosObject.bucket,
        region: payload.cosObject.region,
      })
    } catch (notifyError) {
      console.error('[scf-callback] 事件通知失败:', notifyError)
      // 通知失败不影响主流程，只记录日志
    }

    console.info('[scf-callback] 回调处理完成:', {
      eventId: payload.eventId,
      taskId: payload.taskId,
      status: payload.status
    })

    return legacySuccess({ received: true }, '回调接受成功', 202)
  } catch (error) {
    console.error('[scf-callback] 回调处理失败:', error)
    return legacyError<ScfCallbackErrorPayload>('回调持久化失败', 500, {
      reason: error instanceof Error ? error.message : 'unknown',
      eventId: payload.eventId,
      taskId: payload.taskId,
    })
  }
}
