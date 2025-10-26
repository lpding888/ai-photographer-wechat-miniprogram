import { createHmac } from 'crypto'

export const computeHmacSha256 = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
