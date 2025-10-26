/**
 * AI图像生成服务 - 整合完整的AI生图流程
 *
 * 流程: 图像预处理 -> 提示词生成 -> 图像生成 -> 后处理
 *
 * @author 老王
 * @version 3.0.0
 */

import { scfService } from './scf-service.js'
import { v4 as uuidv4 } from 'uuid'

export interface ImageGenerationRequest {
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

export interface ProcessedImage {
  originalUrl: string
  processedUrl?: string
  processingTime?: number
  operations?: string[]
}

export interface GeneratedPrompt {
  prompt: string
  analysis?: any
  confidence?: number
  keywords?: string[]
}

export interface GeneratedImage {
  url: string
  prompt: string
  model: string
  parameters: any
  processingTime?: number
}

export interface AIImageGenerationResult {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  processedImages: ProcessedImage[]
  generatedPrompt?: GeneratedPrompt
  generatedImages?: GeneratedImage[]
  processingTime: number
  error?: string
}

/**
 * AI图像生成服务类
 */
export class AIImageService {
  /**
   * 完整的AI图像生成流程
   */
  async generateImages(request: ImageGenerationRequest): Promise<AIImageGenerationResult> {
    const startTime = Date.now()
    const taskId = uuidv4()

    console.log(`🚀 开始AI图像生成流程: ${taskId}`)

    try {
      // 1. 图像预处理
      console.log('📷 步骤1: 图像预处理')
      const processedImages = await this.preprocessImages(request.clothingImages)

      // 2. 提示词生成
      console.log('🧠 步骤2: 生成AI提示词')
      const generatedPrompt = await this.generatePrompt(processedImages, {
        sceneType: request.sceneType,
        stylePreference: request.stylePreference
      })

      // 3. 图像生成
      console.log('🎨 步骤3: 生成图像')
      const generatedImages = await this.generateImagesFromPrompt(generatedPrompt.prompt, {
        ...request.options,
        generationMode: request.generationMode,
        referenceWorkId: request.referenceWorkId
      })

      // 4. 图像后处理（可选）
      console.log('✨ 步骤4: 图像后处理')
      const postProcessedImages = await this.postprocessImages(generatedImages)

      const processingTime = Date.now() - startTime

      console.log(`✅ AI图像生成完成: ${taskId}, 耗时: ${processingTime}ms`)

      return {
        taskId,
        status: 'completed',
        processedImages,
        generatedPrompt,
        generatedImages: postProcessedImages,
        processingTime
      }

    } catch (error) {
      const processingTime = Date.now() - startTime
      console.error(`❌ AI图像生成失败: ${taskId}`, error)

      return {
        taskId,
        status: 'failed',
        processedImages: [],
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 图像预处理
   */
  private async preprocessImages(imageUrls: string[]): Promise<ProcessedImage[]> {
    const results: ProcessedImage[] = []

    for (const imageUrl of imageUrls) {
      try {
        console.log(`🔄 预处理图像: ${imageUrl}`)

        // 压缩图片
        const compressResult = await scfService.callImageProcessor('compressImage', {
          imageUrl,
          quality: 85,
          lossless: false
        })

        // 调整尺寸
        const resizeResult = await scfService.callImageProcessor('resizeImage', {
          imageUrl: compressResult.data.processedUrl,
          width: 1024,
          height: 1024,
          mode: 'fit'
        })

        results.push({
          originalUrl: imageUrl,
          processedUrl: resizeResult.data.processedUrl,
          operations: ['compress', 'resize']
        })

      } catch (error) {
        console.error(`❌ 图像预处理失败: ${imageUrl}`, error)
        // 使用原图继续流程
        results.push({
          originalUrl: imageUrl,
          operations: []
        })
      }
    }

    return results
  }

  /**
   * 生成AI提示词
   */
  private async generatePrompt(
    processedImages: ProcessedImage[],
    options: {
      sceneType?: string
      stylePreference?: string
    }
  ): Promise<GeneratedPrompt> {
    // 使用第一张处理过的图片生成提示词
    const primaryImage = processedImages[0]
    if (!primaryImage.processedUrl) {
      throw new Error('没有可用的处理图片用于提示词生成')
    }

    const result = await scfService.callPromptGenerator({
      imageUrl: primaryImage.processedUrl,
      clothingType: 'fashion',
      stylePreference: options.stylePreference || 'modern',
      sceneType: options.sceneType || 'indoor'
    })

    if (!result.success) {
      throw new Error(`提示词生成失败: ${result.error?.message}`)
    }

    return {
      prompt: result.data.prompt,
      analysis: result.data.analysis,
      confidence: result.data.confidence,
      keywords: result.data.keywords
    }
  }

  /**
   * 根据提示词生成图像
   */
  private async generateImagesFromPrompt(
    prompt: string,
    options: {
      size?: string
      quality?: string
      n?: number
      generationMode?: string
      referenceWorkId?: string
    }
  ): Promise<GeneratedImage[]> {
    const result = await scfService.callImageGenerator({
      prompt,
      options: {
        size: options.size || '1024x1024',
        quality: options.quality || 'standard',
        n: options.n || 2
      },
      generationMode: options.generationMode || 'NORMAL',
      referenceWorkId: options.referenceWorkId,
      modelConfig: {
        model: 'doubao-Seedream-4-0-250828'
      }
    })

    if (!result.success) {
      throw new Error(`图像生成失败: ${result.error?.message}`)
    }

    return result.data.images.map((image: any, index: number) => ({
      url: image.url,
      prompt: result.data.prompt,
      model: result.data.modelInfo.model,
      parameters: result.data.parameters,
      processingTime: result.data.processingTime
    }))
  }

  /**
   * 图像后处理
   */
  private async postprocessImages(images: GeneratedImage[]): Promise<GeneratedImage[]> {
    const processedImages: GeneratedImage[] = []

    for (const image of images) {
      try {
        console.log(`✨ 后处理图像: ${image.url}`)

        // 添加水印
        const watermarkResult = await scfService.callImageProcessor('watermark', {
          imageUrl: image.url,
          watermark: {
            text: 'AI摄影师',
            font: 'ZHHeiTi',
            size: 16,
            color: '3D3D3D',
            gravity: 'SouthEast',
            dx: 10,
            dy: 10
          }
        })

        // 格式转换为WebP
        const formatResult = await scfService.callImageProcessor('formatConvert', {
          imageUrl: watermarkResult.data.processedUrl,
          targetFormat: 'webp'
        })

        processedImages.push({
          ...image,
          url: formatResult.data.processedUrl
        })

      } catch (error) {
        console.error(`❌ 图像后处理失败: ${image.url}`, error)
        // 使用原图继续
        processedImages.push(image)
      }
    }

    return processedImages
  }

  /**
   * 仅图像预处理（用于独立使用）
   */
  async onlyPreprocessImages(imageUrls: string[], options: {
    compress?: boolean
    resize?: boolean
    format?: string
  } = {}): Promise<ProcessedImage[]> {
    const results: ProcessedImage[] = []

    for (const imageUrl of imageUrls) {
      try {
        let currentUrl = imageUrl
        const operations: string[] = []

        if (options.compress !== false) {
          const compressResult = await scfService.callImageProcessor('compressImage', {
            imageUrl: currentUrl,
            quality: 85
          })
          currentUrl = compressResult.data.processedUrl
          operations.push('compress')
        }

        if (options.resize) {
          const resizeResult = await scfService.callImageProcessor('resizeImage', {
            imageUrl: currentUrl,
            width: options.resize.width,
            height: options.resize.height,
            mode: options.resize.mode || 'fit'
          })
          currentUrl = resizeResult.data.processedUrl
          operations.push('resize')
        }

        if (options.format) {
          const formatResult = await scfService.callImageProcessor('formatConvert', {
            imageUrl: currentUrl,
            targetFormat: options.format
          })
          currentUrl = formatResult.data.processedUrl
          operations.push('format_convert')
        }

        results.push({
          originalUrl: imageUrl,
          processedUrl: currentUrl,
          operations
        })

      } catch (error) {
        console.error(`❌ 图像预处理失败: ${imageUrl}`, error)
        results.push({
          originalUrl: imageUrl,
          operations: []
        })
      }
    }

    return results
  }

  /**
   * 仅提示词生成（用于独立使用）
   */
  async onlyGeneratePrompt(params: {
    imageUrl: string
    clothingType?: string
    stylePreference?: string
    sceneType?: string
  }): Promise<GeneratedPrompt> {
    const result = await scfService.callPromptGenerator(params)

    if (!result.success) {
      throw new Error(`提示词生成失败: ${result.error?.message}`)
    }

    return {
      prompt: result.data.prompt,
      analysis: result.data.analysis,
      confidence: result.data.confidence,
      keywords: result.data.keywords
    }
  }

  /**
   * 仅图像生成（用于独立使用）
   */
  async onlyGenerateImages(params: {
    prompt: string
    options?: {
      size?: string
      quality?: string
      n?: number
    }
    modelConfig?: {
      model?: string
    }
  }): Promise<GeneratedImage[]> {
    const result = await scfService.callImageGenerator(params)

    if (!result.success) {
      throw new Error(`图像生成失败: ${result.error?.message}`)
    }

    return result.data.images.map((image: any) => ({
      url: image.url,
      prompt: result.data.prompt,
      model: result.data.modelInfo.model,
      parameters: result.data.parameters
    }))
  }
}

// 导出单例实例
export const aiImageService = new AIImageService()
export default aiImageService