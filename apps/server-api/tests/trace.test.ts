import { describe, expect, it } from 'vitest'

import { buildApp } from '../src/utils/app.js'

describe('trace id propagation', () => {
  it('echoes existing trace header', async () => {
    const app = buildApp()
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-trace-id': 'trace-from-client' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['x-trace-id']).toBe('trace-from-client')

    await app.close()
  })

  it('generates trace id when missing', async () => {
    const app = buildApp()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['x-trace-id']).toBeTypeOf('string')
    expect((response.headers['x-trace-id'] as string).length).toBeGreaterThan(10)

    await app.close()
  })
})
