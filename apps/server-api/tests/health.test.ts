import { describe, expect, it } from 'vitest'

import { buildApp } from '../src/utils/app.js'

describe('health routes', () => {
  it('should return status ok', async () => {
    const app = buildApp()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json().status).toBe('ok')
    await app.close()
  })
})
