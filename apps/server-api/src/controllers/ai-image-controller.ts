/**
 * AI图像生成控制器
 *
 * @author 老王
 * @version 3.0.0
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { aiImageService } from '../services/ai-image-service.js'
import { scfService } from '../services/scf-service.js'

interface GenerateImageRequest {
  clothingImages: string[]
  sceneType?: string
  stylePreference?: string
  generationMode?: 'NORMAL' | 'POSE_VARIATION'
  referenceWorkId?: string
  options?: {
    size?: string
    quality?: string
    n?: number
  }
}

interface PreprocessImageRequest {
  images: string[]
  options?: {
    compress?: boolean
    resize?: {
      width: number
      height: number
      mode?: 'fit' | 'fill' | 'crop'
    }
    format?: string
  }
}

interface GeneratePromptRequest {
  imageUrl: string
  clothingType?: string
  stylePreference?: string
  sceneType?: string
}

/**
 * AI图像控制器类
 */
export class AIImageController {
  /**
   * 完整的AI图像生成流程
   */
  async generateImages(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as GenerateImageRequest

      // 参数验证
      if (!body.clothingImages || !Array.isArray(body.clothingImages) || body.clothingImages.length === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_CLOTHING_IMAGES',
            message: '缺少服装图片数组'
          }
        })
      }

      if (body.clothingImages.length > 5) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'TOO_MANY_IMAGES',
            message: '最多支持5张服装图片'
          }
        })
      }

      console.log(`🎨 收到图像生成请求: ${body.clothingImages.length}张图片`)

      // 调用AI图像生成服务
      const result = await aiImageService.generateImages(body)

      if (result.status === 'failed') {
        return reply.status(500).send({
          success: false,
          error: {
            code: 'GENERATION_FAILED',
            message: result.error || '图像生成失败'
          },
          taskId: result.taskId
        })
      }

      return reply.send({
        success: true,
        data: result,
        message: 'AI图像生成成功',
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('❌ 图像生成控制器错误:', error)
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CONTROLLER_ERROR',
          message: error instanceof Error ? error.message : '未知错误'
        },
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * 仅图像预处理
   */
  async preprocessImages(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as PreprocessImageRequest

      // 参数验证
      if (!body.images || !Array.isArray(body.images) || body.images.length === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_IMAGES',
            message: '缺少图片数组'
          }
        })
      }

      if (body.images.length > 10) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'TOO_MANY_IMAGES',
            message: '最多支持10张图片'
          }
        })
      }

      console.log(`🔧 收到图像预处理请求: ${body.images.length}张图片`)

      // 调用预处理服务
      const results = await aiImageService.onlyPreprocessImages(body.images, body.options)

      return reply.send({
        success: true,
        data: {
          processedImages: results,
          totalCount: body.images.length,
          successCount: results.filter(img => img.processedUrl).length
        },
        message: '图像预处理完成',
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('❌ 图像预处理控制器错误:', error)
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CONTROLLER_ERROR',
          message: error instanceof Error ? error.message : '未知错误'
        },
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * 仅生成提示词
   */
  async generatePrompt(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as GeneratePromptRequest

      // 参数验证
      if (!body.imageUrl) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_IMAGE_URL',
            message: '缺少图片URL'
          }
        })
      }

      console.log(`🧠 收到提示词生成请求: ${body.imageUrl}`)

      // 调用提示词生成服务
      const result = await aiImageService.onlyGeneratePrompt(body)

      return reply.send({
        success: true,
        data: result,
        message: '提示词生成成功',
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('❌ 提示词生成控制器错误:', error)
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CONTROLLER_ERROR',
          message: error instanceof Error ? error.message : '未知错误'
        },
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * 仅图像生成
   */
  async onlyGenerateImages(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as {
        prompt: string
        options?: {
          size?: string
          quality?: string
          n?: number
        }
        modelConfig?: {
          model?: string
        }
      }

      // 参数验证
      if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_PROMPT',
            message: '缺少提示词'
          }
        })
      }

      if (body.prompt.length > 1000) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'PROMPT_TOO_LONG',
            message: '提示词长度不能超过1000字符'
          }
        })
      }

      console.log(`🎨 收到纯图像生成请求: ${body.prompt.substring(0, 50)}...`)

      // 调用图像生成服务
      const results = await aiImageService.onlyGenerateImages(body)

      return reply.send({
        success: true,
        data: {
          images: results,
          prompt: body.prompt,
          count: results.length
        },
        message: '图像生成成功',
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('❌ 纯图像生成控制器错误:', error)
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CONTROLLER_ERROR',
          message: error instanceof Error ? error.message : '未知错误'
        },
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * SCF函数健康检查
   */
  async healthCheck(request: FastifyRequest, reply: FastifyReply) {
    try {
      console.log(`🏥 SCF函数健康检查`)

      const healthResults = await scfService.healthCheck()

      const allHealthy = healthResults.functions.every(func => func.status === 'healthy')

      return reply.send({
        success: true,
        data: {
          ...healthResults,
          overall: allHealthy ? 'healthy' : 'degraded'
        },
        message: allHealthy ? '所有SCF函数正常' : '部分SCF函数异常',
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('❌ 健康检查控制器错误:', error)
      return reply.status(500).send({
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: error instanceof Error ? error.message : '健康检查失败'
        },
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * 获取支持的功能列表
   */
  async getCapabilities(request: FastifyRequest, reply: FastifyReply) {
    try {
      const capabilities = {
        imageProcessor: {
          operations: [
            'compressImage',
            'resizeImage',
            'formatConvert',
            'watermark',
            'smartCrop',
            'faceBeautify',
            'imageEnhance',
            'batchProcess'
          ],
          supportedFormats: ['jpg', 'jpeg', 'png', 'webp', 'bmp'],
          maxImageSize: '10MB',
          maxBatchSize: 10
        },
        promptGenerator: {
          supportedClothingTypes: ['fashion', 'casual', 'formal', 'traditional'],
          supportedStyles: ['modern', 'classic', 'vintage', 'futuristic'],
          supportedSceneTypes: ['indoor', 'outdoor', 'studio', 'street'],
          maxImageSize: '5MB'
        },
        imageGenerator: {
          models: [
            'doubao-Seedream-4-0-250828'
          ],
          supportedSizes: ['1024x1024', '512x512', '2048x2048'],
          supportedQualities: ['standard', 'hd'],
          maxPromptLength: 1000,
          maxImagesPerRequest: 4
        }
      }

      return reply.send({
        success: true,
        data: capabilities,
        message: '功能列表获取成功',
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('❌ 功能列表控制器错误:', error)
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CAPABILITIES_ERROR',
          message: error instanceof Error ? error.message : '获取功能列表失败'
        },
        timestamp: new Date().toISOString()
      })
    }
  }
}

// 导出单例实例
export const aiImageController = new AIImageController()
export default aiImageController