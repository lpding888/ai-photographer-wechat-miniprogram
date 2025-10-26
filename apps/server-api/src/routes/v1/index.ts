import { FastifyInstance } from 'fastify'
import { registerAuthRoutes } from './auth.js'
import { registerUserRoutes } from './users.js'
import { registerWorkRoutes } from './works.js'
import { registerAIFittingRoutes } from './ai-fitting.js'
import aiGenerationRoutes from './ai-generation.js'

/**
 * 注册V1版本的所有路由
 * @param fastify Fastify实例
 */
export async function registerV1Routes(fastify: FastifyInstance) {
  // 注册认证相关路由
  await fastify.register(registerAuthRoutes, { prefix: '/auth' })

  // 注册用户相关路由
  await fastify.register(registerUserRoutes, { prefix: '/users' })

  // 注册作品相关路由
  await fastify.register(registerWorkRoutes, { prefix: '/works' })

  // 注册AI试衣相关路由
  await fastify.register(registerAIFittingRoutes, { prefix: '/ai-fitting' })

  // 注册AI生图相关路由
  await fastify.register(aiGenerationRoutes)

  // V1版本信息路由
  fastify.get('/info', async () => {
    return {
      success: true,
      data: {
        version: 'v1',
        name: 'AI摄影师API',
        description: 'AI摄影师RESTful API V1版本',
        endpoints: {
          auth: '/auth',
          users: '/users',
          works: '/works',
          'ai-fitting': '/ai-fitting',
          'ai-generation': '/ai-generation',
        },
        features: [
          '手机号验证码登录',
          '微信扫码登录',
          'JWT Token认证',
          '作品管理',
          '用户信息管理',
          '多身份绑定',
          'AI试衣功能',
          'AI生图功能',
          'COS直传支持',
        ],
        supportedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        responseFormat: {
          success: 'boolean',
          data: 'any',
          error: {
            code: 'string',
            message: 'string',
          },
          meta: {
            trace_id: 'string',
            timestamp: 'number',
          },
        },
      },
      meta: {
        timestamp: Date.now(),
      },
    }
  })

  fastify.log.info('V1路由注册完成')
}