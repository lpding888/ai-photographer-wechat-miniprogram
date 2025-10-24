import { getPrismaClient } from '@ai-photographer/db'
import type { Prisma, Work, WorkImage } from '@prisma/client'

import { legacyDataStore } from './data-store.js'
import type { LegacyWorkRecord, LegacyWorkStatus, LegacyWorkTab } from './types.js'

const prisma = getPrismaClient()

const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 50

interface ListWorksParams {
  userId: string
  tab?: LegacyWorkTab
  onlyCompleted?: boolean
  pageSize?: number
  lastId?: string | null
  lastCreatedAt?: string | null
}

interface PaginationCursor {
  lastId?: string | null
  lastCreatedAt?: string | null
}

type WorkWithImages = Work & { images: WorkImage[] }

type JsonValue = Prisma.JsonValue

type CursorConditionInput = {
  cursor?: PaginationCursor
  orderBy: Array<Prisma.WorkOrderByWithRelationInput>
}

type PaginatedWorksResult = {
  pageItems: WorkWithImages[]
  hasMore: boolean
}

const normalizePageSize = (size?: number): number => {
  if (!size || Number.isNaN(size)) {
    return DEFAULT_PAGE_SIZE
  }

  const boundedSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE))
  return boundedSize
}

const buildTabFilter = (tab?: LegacyWorkTab): Prisma.WorkWhereInput => {
  if (!tab || tab === 'all') {
    return {}
  }

  if (tab === 'favorites') {
    return { isFavorite: true }
  }

  if (tab === 'photography') {
    return { type: 'photography' }
  }

  if (tab === 'fitting') {
    return { type: 'fitting' }
  }

  if (tab === 'completed') {
    return { status: 'completed' }
  }

  if (tab === 'processing') {
    return { status: 'processing' }
  }

  return {}
}

const buildCompletionFilter = (onlyCompleted?: boolean): Prisma.WorkWhereInput => {
  if (!onlyCompleted) {
    return {}
  }

  return { status: 'completed' }
}

const buildCursorFilter = ({ cursor, orderBy }: CursorConditionInput): Prisma.WorkWhereInput => {
  if (!cursor?.lastCreatedAt || !cursor?.lastId) {
    return {}
  }

  const createdAt = new Date(cursor.lastCreatedAt)
  const id = cursor.lastId
  const createdOrder = orderBy.find((input) => 'createdAt' in input)
  const idOrder = orderBy.find((input) => 'id' in input)

  const createdDirection = createdOrder?.createdAt ?? 'desc'
  const idDirection = idOrder?.id ?? 'desc'

  const createdComparator: Prisma.DateTimeFilter<'Work'> =
    createdDirection === 'desc' ? { lt: createdAt } : { gt: createdAt }

  const idComparator: Prisma.StringFilter<'Work'> =
    idDirection === 'desc' ? { lt: id } : { gt: id }

  return {
    OR: [
      {
        createdAt: createdComparator,
      },
      {
        AND: [
          { createdAt },
          { id: idComparator },
        ],
      },
    ],
  }
}

const isJsonObject = (value: JsonValue | undefined | null): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const mapStatusToLegacy = (status: string): LegacyWorkStatus => {
  if (status === 'completed' || status === 'cancelled') {
    return status
  }

  return 'processing'
}

const mapTypeToLegacy = (type: string | null): LegacyWorkRecord['type'] => {
  if (type === 'photography' || type === 'fitting') {
    return type
  }

  return 'other'
}

const mapWorkToLegacyRecord = (work: WorkWithImages): LegacyWorkRecord => {
  const metadata = isJsonObject(work.metadata) ? work.metadata : undefined

  return {
    id: work.id,
    userId: work.userId,
    title: work.title ?? '',
    type: mapTypeToLegacy(work.type),
    status: mapStatusToLegacy(work.status),
    isFavorite: work.isFavorite,
    images: [...work.images]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => ({ url: image.url })),
    createdAt: work.createdAt.toISOString(),
    taskId: work.taskId ?? undefined,
    metadata,
  }
}

const findPaginatedWorks = async (
  where: Prisma.WorkWhereInput,
  orderBy: Array<Prisma.WorkOrderByWithRelationInput>,
  pageSize: number,
): Promise<PaginatedWorksResult> => {
  const works = await prisma.work.findMany({
    where,
    orderBy,
    take: pageSize + 1,
    include: { images: true },
  })

  const hasMore = works.length > pageSize
  const pageItems = hasMore ? works.slice(0, pageSize) : works

  return { pageItems, hasMore }
}

export class LegacyWorksService {
  async listWorks(params: ListWorksParams) {
    const pageSize = normalizePageSize(params.pageSize)
    const cursor: PaginationCursor = {
      lastId: params.lastId ?? null,
      lastCreatedAt: params.lastCreatedAt ?? null,
    }

    const orderBy: Array<Prisma.WorkOrderByWithRelationInput> = [
      { createdAt: 'desc' },
      { id: 'desc' },
    ]

    const where: Prisma.WorkWhereInput = {
      userId: params.userId,
      ...buildTabFilter(params.tab),
      ...buildCompletionFilter(params.onlyCompleted),
    }

    const cursorCondition = buildCursorFilter({ cursor, orderBy })
    const combinedWhere: Prisma.WorkWhereInput =
      Object.keys(cursorCondition).length > 0
        ? { AND: [where, cursorCondition] }
        : where

    const { pageItems, hasMore } = await findPaginatedWorks(combinedWhere, orderBy, pageSize)
    const mappedItems = pageItems.map((work) => this.mapToLegacyResponse(mapWorkToLegacyRecord(work)))

    const next = hasMore ? pageItems[pageItems.length - 1] : undefined

    return {
      items: mappedItems,
      nextCursor: next
        ? {
            lastId: next.id,
            lastCreatedAt: next.createdAt,
          }
        : undefined,
    }
  }

  async getWorkDetail(workId: string, userId: string) {
    const work = await prisma.work.findUnique({
      where: { id: workId },
      include: { images: true },
    })

    if (!work || work.userId !== userId) {
      return null
    }

    return this.mapToLegacyResponse(mapWorkToLegacyRecord(work))
  }

  async deleteWork(workId: string, userId: string) {
    const work = await prisma.work.findUnique({ where: { id: workId } })
    if (!work || work.userId !== userId) {
      return false
    }

    await prisma.$transaction([
      prisma.workImage.deleteMany({ where: { workId } }),
      prisma.work.delete({ where: { id: workId } }),
    ])

    return true
  }

  async toggleFavorite(workId: string, userId: string) {
    const work = await prisma.work.findUnique({ where: { id: workId } })
    if (!work || work.userId !== userId) {
      return null
    }

    const metadata: Record<string, unknown> = isJsonObject(work.metadata)
      ? { ...work.metadata }
      : {}

    metadata.toggledAt = new Date().toISOString()

    const updated = await prisma.work.update({
      where: { id: workId },
      data: {
        isFavorite: !work.isFavorite,
        metadata,
      },
    })

    return updated.isFavorite
  }

  async cancelTask(taskId: string, userId: string) {
    const work = legacyDataStore
      .listWorksByUser(userId)
      .find((record) => record.taskId === taskId && record.status === 'processing')

    if (!work) {
      return false
    }

    const updated: LegacyWorkRecord = {
      ...work,
      status: 'cancelled',
      metadata: {
        ...work.metadata,
        cancelledAt: new Date().toISOString(),
      },
    }

    legacyDataStore.saveWork(updated)
    return true
  }

  private mapToLegacyResponse(work: LegacyWorkRecord) {
    return {
      ...work,
      cover_url: work.images[0]?.url ?? null,
      created_time: work.createdAt,
      display_time: new Date(work.createdAt).toLocaleString('zh-CN', { hour12: false }),
    }
  }
}

export const legacyWorksService = new LegacyWorksService()
