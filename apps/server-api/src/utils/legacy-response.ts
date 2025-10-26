export interface LegacySuccessResponse<T = unknown> {
  success: true
  data: T
  message: string
  code: number
  timestamp: string
}

export interface LegacyErrorResponse<T = unknown> {
  success: false
  message: string
  code: number
  data?: T
  timestamp: string
}

export type LegacyResponse<T = unknown> = LegacySuccessResponse<T> | LegacyErrorResponse<T>

const buildTimestamp = () => new Date().toISOString()

export const legacySuccess = <T = unknown>(data: T, message = '操作成功', code = 200): LegacySuccessResponse<T> => ({
  success: true,
  data,
  message,
  code,
  timestamp: buildTimestamp(),
})

export const legacyError = <T = unknown>(message = '操作失败', code = 500, data?: T): LegacyErrorResponse<T> => ({
  success: false,
  message,
  code,
  data,
  timestamp: buildTimestamp(),
})

export const legacyValidationError = (message: string, errors: Record<string, unknown>) =>
  legacyError(message, 400, errors)

export const legacyUnauthorized = (message = '未授权访问') => legacyError(message, 401)

export const legacyNotFound = (message = '资源不存在') => legacyError(message, 404)
