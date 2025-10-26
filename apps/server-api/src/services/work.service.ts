import { getPrismaClient, Work, WorkImage, User } from '@ai-photographer/db'
import { FastifyRequest } from 'fastify'

/**
 * 作品查询参数接口
 */
export interface WorkQueryParams {
  /** 页码 */
  page?: number
  /** 每页数量 */
  limit?: number
  /** 作品类型 */
  type?: string
  /** 状态筛选 */
  status?: string
  /** 是否只看收藏 */
  favorite?: boolean
  /** 排序方式 */
  sortBy?: 'createdAt' | 'updatedAt' | 'title'
  /** 排序顺序 */
  sortOrder?: 'asc' | 'desc'
  /** 搜索关键词 */
  search?: string
}

/**
 * 创建作品数据接口
 */
export interface CreateWorkData {
  title?: string
  type: string
  metadata?: Record<string, any>
  images?: Array<{
    url: string
    sortOrder?: number
  }>
}

/**
 * 更新作品数据接口
 */
export interface UpdateWorkData {
  title?: string
  metadata?: Record<string, any>
  status?: string
}

/**
 * 作品列表响应接口
 */
export interface WorkListResponse {
  works: Array<{
    id: string
    title?: string
    type: string
    status: string
    isFavorite: boolean
    createdAt: Date
    updatedAt: Date
    images: Array<{
      id: string
      url: string
      sortOrder: number
    }>
    _count: {
      images: number
    }
  }>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

/**
 * 作品详情响应接口
 */
export interface WorkDetailResponse {
  id: string
  title?: string
  type: string
  status: string
  isFavorite: boolean
  taskId?: string
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
  images: Array<{
    id: string
    url: string
    sortOrder: number
    createdAt: Date
  }>
  user: {
    id: string
    nickname?: string
    avatarUrl?: string
  }
}

/**
 * 作品服务类
 * 处理作品相关的业务逻辑
 */
export class WorkService {
  private prisma = getPrismaClient()

  /**
   * 获取作品列表
   * @param userId 用户ID
   * @param params 查询参数
   * @returns 作品列表
   */
  async getWorkList(userId: string, params: WorkQueryParams): Promise<WorkListResponse> {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        status,
        favorite,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search,
      } = params

      const skip = (page - 1) * limit

      // 构建查询条件
      const where: any = {
        userId,
      }

      if (type) {
        where.type = type
      }

      if (status) {
        where.status = status
      }

      if (favorite !== undefined) {
        where.isFavorite = favorite
      }

      if (search) {
        where.OR = [
          {
            title: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            metadata: {
              path: [],
              string_contains: search,
            },
          },
        ]
      }

      // 构建排序条件
      const orderBy: any = {}
      orderBy[sortBy] = sortOrder

      // 查询作品列表
      const [works, total] = await Promise.all([
        this.prisma.work.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            images: {
              orderBy: {
                sortOrder: 'asc',
              },
            },
            _count: {
              select: {
                images: true,
              },
            },
          },
        }),
        this.prisma.work.count({ where }),
      ])

      const totalPages = Math.ceil(total / limit)

      return {
        works: works.map(work => ({
          id: work.id,
          title: work.title || undefined,
          type: work.type,
          status: work.status,
          isFavorite: work.isFavorite,
          createdAt: work.createdAt,
          updatedAt: work.updatedAt,
          images: work.images.map(img => ({
            id: img.id,
            url: img.url,
            sortOrder: img.sortOrder,
          })),
          _count: {
            images: work._count.images,
          },
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      }
    } catch (error) {
      console.error('[WorkService] 获取作品列表失败:', error)
      throw new Error(error instanceof Error ? error.message : '获取作品列表失败')
    }
  }

  /**
   * 获取作品详情
   * @param userId 用户ID
   * @param workId 作品ID
   * @returns 作品详情
   */
  async getWorkDetail(userId: string, workId: string): Promise<WorkDetailResponse> {
    try {
      const work = await this.prisma.work.findFirst({
        where: {
          id: workId,
          userId,
        },
        include: {
          images: {
            orderBy: {
              sortOrder: 'asc',
            },
          },
          user: {
            select: {
              id: true,
              nickname: true,
              avatarUrl: true,
            },
          },
        },
      })

      if (!work) {
        throw new Error('作品不存在')
      }

      return {
        id: work.id,
        title: work.title || undefined,
        type: work.type,
        status: work.status,
        isFavorite: work.isFavorite,
        taskId: work.taskId || undefined,
        metadata: work.metadata || undefined,
        createdAt: work.createdAt,
        updatedAt: work.updatedAt,
        images: work.images.map(img => ({
          id: img.id,
          url: img.url,
          sortOrder: img.sortOrder,
          createdAt: img.createdAt,
        })),
        user: {
          id: work.user.id,
          nickname: work.user.nickname || undefined,
          avatarUrl: work.user.avatarUrl || undefined,
        },
      }
    } catch (error) {
      console.error('[WorkService] 获取作品详情失败:', error)
      throw new Error(error instanceof Error ? error.message : '获取作品详情失败')
    }
  }

  /**
   * 创建作品
   * @param userId 用户ID
   * @param data 作品数据
   * @returns 创建的作品
   */
  async createWork(userId: string, data: CreateWorkData): Promise<WorkDetailResponse> {
    try {
      const { title, type, metadata, images } = data

      // 创建作品
      const work = await this.prisma.work.create({
        data: {
          userId,
          title,
          type,
          status: 'pending',
          metadata,
        },
        include: {
          images: {
            orderBy: {
              sortOrder: 'asc',
            },
          },
          user: {
            select: {
              id: true,
              nickname: true,
              avatarUrl: true,
            },
          },
        },
      })

      // 如果有图片，创建图片记录
      if (images && images.length > 0) {
        const imageRecords = await Promise.all(
          images.map(img =>
            this.prisma.workImage.create({
              data: {
                workId: work.id,
                url: img.url,
                sortOrder: img.sortOrder || 0,
              },
            })
          )
        )

        // 重新查询作品以包含图片信息
        const workWithImages = await this.prisma.work.findUnique({
          where: { id: work.id },
          include: {
            images: {
              orderBy: {
                sortOrder: 'asc',
              },
            },
            user: {
              select: {
                id: true,
                nickname: true,
                avatarUrl: true,
              },
            },
          },
        })

        if (workWithImages) {
          return this.formatWorkDetail(workWithImages)
        }
      }

      return this.formatWorkDetail(work)
    } catch (error) {
      console.error('[WorkService] 创建作品失败:', error)
      throw new Error(error instanceof Error ? error.message : '创建作品失败')
    }
  }

  /**
   * 更新作品
   * @param userId 用户ID
   * @param workId 作品ID
   * @param data 更新数据
   * @returns 更新后的作品
   */
  async updateWork(userId: string, workId: string, data: UpdateWorkData): Promise<WorkDetailResponse> {
    try {
      const { title, metadata, status } = data

      // 检查作品是否存在且属于当前用户
      const existingWork = await this.prisma.work.findFirst({
        where: {
          id: workId,
          userId,
        },
      })

      if (!existingWork) {
        throw new Error('作品不存在')
      }

      // 更新作品
      const updatedWork = await this.prisma.work.update({
        where: { id: workId },
        data: {
          ...(title !== undefined && { title }),
          ...(metadata !== undefined && { metadata }),
          ...(status !== undefined && { status }),
          updatedAt: new Date(),
        },
        include: {
          images: {
            orderBy: {
              sortOrder: 'asc',
            },
          },
          user: {
            select: {
              id: true,
              nickname: true,
              avatarUrl: true,
            },
          },
        },
      })

      return this.formatWorkDetail(updatedWork)
    } catch (error) {
      console.error('[WorkService] 更新作品失败:', error)
      throw new Error(error instanceof Error ? error.message : '更新作品失败')
    }
  }

  /**
   * 删除作品
   * @param userId 用户ID
   * @param workId 作品ID
   * @returns 是否删除成功
   */
  async deleteWork(userId: string, workId: string): Promise<boolean> {
    try {
      // 检查作品是否存在且属于当前用户
      const existingWork = await this.prisma.work.findFirst({
        where: {
          id: workId,
          userId,
        },
      })

      if (!existingWork) {
        throw new Error('作品不存在')
      }

      // 删除作品（级联删除图片）
      await this.prisma.work.delete({
        where: { id: workId },
      })

      console.log(`[WorkService] 作品删除成功: ${workId}`)
      return true
    } catch (error) {
      console.error('[WorkService] 删除作品失败:', error)
      throw new Error(error instanceof Error ? error.message : '删除作品失败')
    }
  }

  /**
   * 切换收藏状态
   * @param userId 用户ID
   * @param workId 作品ID
   * @returns 更新后的收藏状态
   */
  async toggleFavorite(userId: string, workId: string): Promise<{ isFavorite: boolean }> {
    try {
      // 检查作品是否存在且属于当前用户
      const existingWork = await this.prisma.work.findFirst({
        where: {
          id: workId,
          userId,
        },
      })

      if (!existingWork) {
        throw new Error('作品不存在')
      }

      // 切换收藏状态
      const updatedWork = await this.prisma.work.update({
        where: { id: workId },
        data: {
          isFavorite: !existingWork.isFavorite,
          updatedAt: new Date(),
        },
      })

      return {
        isFavorite: updatedWork.isFavorite,
      }
    } catch (error) {
      console.error('[WorkService] 切换收藏状态失败:', error)
      throw new Error(error instanceof Error ? error.message : '切换收藏状态失败')
    }
  }

  /**
   * 批量删除作品
   * @param userId 用户ID
   * @param workIds 作品ID列表
   * @returns 删除结果
   */
  async deleteWorks(userId: string, workIds: string[]): Promise<{
    success: number
    failed: number
    errors: string[]
  }> {
    try {
      const result = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      }

      for (const workId of workIds) {
        try {
          await this.deleteWork(userId, workId)
          result.success++
        } catch (error) {
          result.failed++
          result.errors.push(`作品 ${workId}: ${error instanceof Error ? error.message : '删除失败'}`)
        }
      }

      return result
    } catch (error) {
      console.error('[WorkService] 批量删除作品失败:', error)
      throw new Error(error instanceof Error ? error.message : '批量删除作品失败')
    }
  }

  /**
   * 获取作品统计信息
   * @param userId 用户ID
   * @returns 统计信息
   */
  async getWorkStats(userId: string): Promise<{
    total: number
    byType: Record<string, number>
    byStatus: Record<string, number>
    favorites: number
  }> {
    try {
      const [total, byType, byStatus, favorites] = await Promise.all([
        this.prisma.work.count({
          where: { userId },
        }),
        this.prisma.work.groupBy({
          by: ['type'],
          where: { userId },
          _count: {
            type: true,
          },
        }),
        this.prisma.work.groupBy({
          by: ['status'],
          where: { userId },
          _count: {
            status: true,
          },
        }),
        this.prisma.work.count({
          where: {
            userId,
            isFavorite: true,
          },
        }),
      ])

      return {
        total,
        byType: byType.reduce((acc, item) => {
          acc[item.type] = item._count.type
          return acc
        }, {} as Record<string, number>),
        byStatus: byStatus.reduce((acc, item) => {
          acc[item.status] = item._count.status
          return acc
        }, {} as Record<string, number>),
        favorites,
      }
    } catch (error) {
      console.error('[WorkService] 获取作品统计失败:', error)
      throw new Error(error instanceof Error ? error.message : '获取作品统计失败')
    }
  }

  /**
   * 格式化作品详情响应
   * @param work 作品数据
   * @returns 格式化后的作品详情
   */
  private formatWorkDetail(work: any): WorkDetailResponse {
    return {
      id: work.id,
      title: work.title || undefined,
      type: work.type,
      status: work.status,
      isFavorite: work.isFavorite,
      taskId: work.taskId || undefined,
      metadata: work.metadata || undefined,
      createdAt: work.createdAt,
      updatedAt: work.updatedAt,
      images: work.images.map((img: any) => ({
        id: img.id,
        url: img.url,
        sortOrder: img.sortOrder,
        createdAt: img.createdAt,
      })),
      user: {
        id: work.user.id,
        nickname: work.user.nickname || undefined,
        avatarUrl: work.user.avatarUrl || undefined,
      },
    }
  }
}

// 导出单例实例
export const workService = new WorkService()