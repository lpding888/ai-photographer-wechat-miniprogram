/**
 * AI图像生成路由
 *
 * @author 老王
 * @version 3.0.0
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { aiImageController } from '../controllers/ai-image-controller.js'

/**
 * AI图像路由配置
 */
export async function aiImageRoutes(fastify: FastifyInstance) {
  // 完整的AI图像生成流程
  fastify.post('/api/ai-image/generate', {
    schema: {
      description: '完整的AI图像生成流程',
      tags: ['AI Image'],
      body: {
        type: 'object',
        required: ['clothingImages'],
        properties: {
          clothingImages: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
            maxItems: 5,
            description: '服装图片URL数组'
          },
          sceneType: {
            type: 'string',
            enum: ['indoor', 'outdoor', 'studio', 'street'],
            description: '场景类型'
          },
          stylePreference: {
            type: 'string',
            enum: ['modern', 'classic', 'vintage', 'futuristic'],
            description: '风格偏好'
          },
          generationMode: {
            type: 'string',
            enum: ['NORMAL', 'POSE_VARIATION'],
            default: 'NORMAL',
            description: '生成模式'
          },
          referenceWorkId: {
            type: 'string',
            description: '参考作品ID（用于姿势裂变）'
          },
          options: {
            type: 'object',
            properties: {
              size: {
                type: 'string',
                enum: ['512x512', '1024x1024', '2048x2048'],
                default: '1024x1024',
                description: '图像尺寸'
              },
              quality: {
                type: 'string',
                enum: ['standard', 'hd'],
                default: 'standard',
                description: '图像质量'
              },
              n: {
                type: 'integer',
                minimum: 1,
                maximum: 4,
                default: 2,
                description: '生成图像数量'
              }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
                status: { type: 'string' },
                processedImages: { type: 'array' },
                generatedPrompt: { type: 'object' },
                generatedImages: { type: 'array' },
                processingTime: { type: 'number' }
              }
            },
            message: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, (request: FastifyRequest, reply: FastifyReply) => {
    return aiImageController.generateImages(request, reply)
  })

  // 仅图像预处理
  fastify.post('/api/ai-image/preprocess', {
    schema: {
      description: '图像预处理',
      tags: ['AI Image'],
      body: {
        type: 'object',
        required: ['images'],
        properties: {
          images: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
            maxItems: 10,
            description: '图片URL数组'
          },
          options: {
            type: 'object',
            properties: {
              compress: {
                type: 'boolean',
                default: true,
                description: '是否压缩'
              },
              resize: {
                type: 'object',
                properties: {
                  width: { type: 'integer', minimum: 1, maximum: 4096 },
                  height: { type: 'integer', minimum: 1, maximum: 4096 },
                  mode: { type: 'string', enum: ['fit', 'fill', 'crop'], default: 'fit' }
                },
                description: '尺寸调整'
              },
              format: {
                type: 'string',
                enum: ['jpg', 'png', 'webp'],
                description: '目标格式'
              }
            }
          }
        }
      }
    }
  }, (request: FastifyRequest, reply: FastifyReply) => {
    return aiImageController.preprocessImages(request, reply)
  })

  // 仅生成提示词
  fastify.post('/api/ai-image/generate-prompt', {
    schema: {
      description: '生成AI绘画提示词',
      tags: ['AI Image'],
      body: {
        type: 'object',
        required: ['imageUrl'],
        properties: {
          imageUrl: {
            type: 'string',
            format: 'uri',
            description: '图片URL'
          },
          clothingType: {
            type: 'string',
            enum: ['fashion', 'casual', 'formal', 'traditional'],
            default: 'fashion',
            description: '服装类型'
          },
          stylePreference: {
            type: 'string',
            enum: ['modern', 'classic', 'vintage', 'futuristic'],
            default: 'modern',
            description: '风格偏好'
          },
          sceneType: {
            type: 'string',
            enum: ['indoor', 'outdoor', 'studio', 'street'],
            default: 'indoor',
            description: '场景类型'
          }
        }
      }
    }
  }, (request: FastifyRequest, reply: FastifyReply) => {
    return aiImageController.generatePrompt(request, reply)
  })

  // 仅图像生成
  fastify.post('/api/ai-image/generate-only', {
    schema: {
      description: '仅生成图像（需要提供提示词）',
      tags: ['AI Image'],
      body: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'string',
            minLength: 1,
            maxLength: 1000,
            description: 'AI绘画提示词'
          },
          options: {
            type: 'object',
            properties: {
              size: {
                type: 'string',
                enum: ['512x512', '1024x1024', '2048x2048'],
                default: '1024x1024'
              },
              quality: {
                type: 'string',
                enum: ['standard', 'hd'],
                default: 'standard'
              },
              n: {
                type: 'integer',
                minimum: 1,
                maximum: 4,
                default: 2
              }
            }
          },
          modelConfig: {
            type: 'object',
            properties: {
              model: {
                type: 'string',
                enum: ['doubao-Seedream-4-0-250828'],
                default: 'doubao-Seedream-4-0-250828'
              }
            }
          }
        }
      }
    }
  }, (request: FastifyRequest, reply: FastifyReply) => {
    return aiImageController.onlyGenerateImages(request, reply)
  })

  // SCF函数健康检查
  fastify.get('/api/ai-image/health', {
    schema: {
      description: 'SCF函数健康检查',
      tags: ['AI Image', 'Health']
    }
  }, (request: FastifyRequest, reply: FastifyReply) => {
    return aiImageController.healthCheck(request, reply)
  })

  // 获取功能列表
  fastify.get('/api/ai-image/capabilities', {
    schema: {
      description: '获取AI图像服务功能列表',
      tags: ['AI Image']
    }
  }, (request: FastifyRequest, reply: FastifyReply) => {
    return aiImageController.getCapabilities(request, reply)
  })

  // 图像处理操作（单独的详细接口）
  fastify.post('/api/ai-image/process/:action', {
    schema: {
      description: '执行特定图像处理操作',
      tags: ['AI Image'],
      params: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'compressImage',
              'resizeImage',
              'formatConvert',
              'watermark',
              'smartCrop',
              'faceBeautify',
              'imageEnhance'
            ],
            description: '处理操作类型'
          }
        }
      },
      body: {
        type: 'object',
        required: ['imageUrl'],
        properties: {
          imageUrl: { type: 'string', format: 'uri' },
          // 根据不同action需要不同参数
          quality: { type: 'integer', minimum: 1, maximum: 100 },
          width: { type: 'integer', minimum: 1, maximum: 4096 },
          height: { type: 'integer', minimum: 1, maximum: 4096 },
          targetFormat: { type: 'string', enum: ['jpg', 'png', 'webp'] },
          watermark: { type: 'object' },
          scenes: { type: 'string' },
          beautifyConfig: { type: 'object' },
          enhanceType: { type: 'string' },
          intensity: { type: 'integer', minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { action } = request.params as { action: string }
      const body = request.body as any

      // 导入SCF服务
      const { scfService } = await import('../services/scf-service.js')

      const result = await scfService.callImageProcessor(action, body)

      return reply.send({
        success: true,
        data: result.data,
        message: `${action}操作完成`,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error(`❌ 图像处理操作失败:`, error)
      return reply.status(500).send({
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : '处理失败'
        },
        timestamp: new Date().toISOString()
      })
    }
  })
}

export default aiImageRoutes