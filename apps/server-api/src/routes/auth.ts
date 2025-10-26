import { FastifyInstance } from 'fastify'
import { Platform, UserRole, Permission } from '../plugins/auth/types'

/**
 * 注册认证相关路由
 * @param fastify Fastify实例
 */
export async function registerAuthRoutes(fastify: FastifyInstance) {

  // 微信小程序登录路由
  fastify.post('/api/v1/auth/wechat/login', {
    // 可选认证，允许未登录用户访问
    preHandler: fastify.authenticate({ required: false })
  }, async (request, reply) => {
    try {
      // 如果用户已登录，直接返回用户信息
      if (request.user) {
        return {
          success: true,
          data: {
            user: request.user,
            isNewUser: false
          },
          message: '登录成功'
        }
      }

      // 如果没有code，要求用户提供
      const { code } = request.body as { code?: string }
      if (!code) {
        return reply.status(400).send({
          success: false,
          error: {
            type: 'MISSING_CODE',
            message: '缺少微信授权码',
            code: 400
          }
        })
      }

      // 使用微信策略进行认证
      // 这里会自动调用 wechat-strategy 进行认证
      // 由于我们已经在preHandler中调用了authenticate，这里不需要重复认证

      return reply.status(500).send({
        success: false,
        error: {
          type: 'IMPLEMENTATION_REQUIRED',
          message: '需要在请求中包含微信认证信息',
          code: 500
        }
      })
    } catch (error) {
      fastify.log.error('微信登录失败', error)
      return reply.status(500).send({
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: '登录失败',
          code: 500
        }
      })
    }
  })

  // 获取当前用户信息（需要认证）
  fastify.get('/api/v1/auth/me', {
    preHandler: fastify.authenticate()
  }, async (request, reply) => {
    try {
      return {
        success: true,
        data: {
          user: request.user
        }
      }
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: '获取用户信息失败',
          code: 500
        }
      })
    }
  })

  // JWT登录路由（用于Web端）
  fastify.post('/api/v1/auth/jwt/login', async (request, reply) => {
    try {
      const { userId, password } = request.body as {
        userId?: string
        password?: string
      }

      if (!userId || !password) {
        return reply.status(400).send({
          success: false,
          error: {
            type: 'MISSING_CREDENTIALS',
            message: '缺少用户名或密码',
            code: 400
          }
        })
      }

      // TODO: 实现实际的用户名密码验证逻辑
      // 这里应该：
      // 1. 验证用户名和密码
      // 2. 查询用户信息
      // 3. 生成JWT token
      // 4. 返回token和用户信息

      // 临时实现：生成测试token
      if (userId === 'test' && password === 'test') {
        const testUser = {
          userId: 'test_user_123',
          platform: Platform.WEB,
          roles: [UserRole.USER],
          permissions: [
            Permission.READ_PROFILE,
            Permission.CREATE_WORK
          ],
          vipLevel: 'FREE' as const,
          isVipExpired: false
        }

        const token = fastify.generateToken(testUser, '7d')

        return {
          success: true,
          data: {
            token,
            user: testUser,
            expiresIn: '7d'
          },
          message: '登录成功'
        }
      }

      return reply.status(401).send({
        success: false,
        error: {
          type: 'INVALID_CREDENTIALS',
          message: '用户名或密码错误',
          code: 401
        }
      })
    } catch (error) {
      fastify.log.error('JWT登录失败', error)
      return reply.status(500).send({
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: '登录失败',
          code: 500
        }
      })
    }
  })

  // 刷新Token路由
  fastify.post('/api/v1/auth/jwt/refresh', {
    preHandler: fastify.authenticate()
  }, async (request, reply) => {
    try {
      const { expiresIn } = request.body as { expiresIn?: string }

      // 生成新的token
      const newToken = fastify.generateToken(request.user!, expiresIn)

      return {
        success: true,
        data: {
          token: newToken,
          expiresIn: expiresIn || '7d'
        },
        message: 'Token刷新成功'
      }
    } catch (error) {
      fastify.log.error('Token刷新失败', error)
      return reply.status(500).send({
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: 'Token刷新失败',
          code: 500
        }
      })
    }
  })

  // 管理员专用路由（需要管理员权限）
  fastify.get('/api/v1/admin/stats', {
    preHandler: [
      fastify.authenticate(),
      fastify.requireRoles([UserRole.ADMIN])
    ]
  }, async (request, reply) => {
    try {
      // TODO: 实现实际的统计数据查询
      return {
        success: true,
        data: {
          totalUsers: 0,
          activeUsers: 0,
          totalWorks: 0,
          systemStatus: 'healthy'
        }
      }
    } catch (error) {
      fastify.log.error('获取管理员统计失败', error)
      return reply.status(500).send({
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: '获取统计信息失败',
          code: 500
        }
      })
    }
  })

  // VIP专用路由（需要VIP权限）
  fastify.post('/api/v1/vip/generate-work', {
    preHandler: [
      fastify.authenticate(),
      fastify.requireVip('BASIC')
    ]
  }, async (request, reply) => {
    try {
      // TODO: 实现VIP专用功能
      return {
        success: true,
        data: {
          workId: 'vip_work_' + Date.now(),
          enhancedFeatures: ['high_quality', 'priority_queue', 'no_watermark']
        },
        message: 'VIP作品生成成功'
      }
    } catch (error) {
      fastify.log.error('VIP功能调用失败', error)
      return reply.status(500).send({
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: 'VIP功能调用失败',
          code: 500
        }
      })
    }
  })

  // 测试权限的路由
  fastify.get('/api/v1/test/permissions', {
    preHandler: fastify.authenticate()
  }, async (request, reply) => {
    try {
      const user = request.user!

      return {
        success: true,
        data: {
          userId: user.userId,
          platform: user.platform,
          roles: user.roles,
          permissions: user.permissions,
          vipLevel: user.vipLevel,
          isVipExpired: user.isVipExpired,
          // 测试权限检查
          hasReadProfile: fastify.hasPermission(user, Permission.READ_PROFILE),
          hasManageUsers: fastify.hasPermission(user, Permission.MANAGE_USERS),
          hasAdminRole: fastify.hasRole(user, UserRole.ADMIN),
          hasVipRole: fastify.hasRole(user, UserRole.VIP)
        }
      }
    } catch (error) {
      fastify.log.error('权限测试失败', error)
      return reply.status(500).send({
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: '权限测试失败',
          code: 500
        }
      })
    }
  })

  fastify.log.info('认证路由注册完成')
}