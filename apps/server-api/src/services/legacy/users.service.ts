import { getPrismaClient } from '@ai-photographer/db'
import type { Prisma, User } from '@prisma/client'
import { legacyDataStore } from './data-store.js'
import type { LegacyUserPreferences } from './types.js'

const prisma = getPrismaClient()

const allowedPreferenceKeys = new Set<keyof LegacyUserPreferences>([
  'default_gender',
  'default_age',
  'default_height',
  'default_nationality',
  'default_skin_tone',
  'auto_save_params',
  'notification_enabled',
])

const pickPreferences = (incoming: Record<string, unknown>): LegacyUserPreferences => {
  const sanitized: LegacyUserPreferences = {}

  for (const [key, value] of Object.entries(incoming)) {
    if (allowedPreferenceKeys.has(key as keyof LegacyUserPreferences)) {
      sanitized[key as keyof LegacyUserPreferences] = value as never
    }
  }

  return sanitized
}

const mapUserToLegacyFormat = (user: User): LegacyUserPreferences => {
  // 从Prisma User对象的metadata中提取preferences
  const metadata = user.metadata as Record<string, unknown> | null
  return (metadata?.preferences as LegacyUserPreferences) || {}
}

export class LegacyUsersService {
  async getUserStats(userId: string) {
    try {
      // 使用Prisma查询用户和作品统计
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          works: {
            select: {
              type: true,
              status: true,
              isFavorite: true,
            }
          },
          tasks: {
            select: {
              type: true,
              status: true,
            }
          }
        }
      })

      if (!user) {
        return null
      }

      const works = user.works
      const tasks = user.tasks

      // 计算作品统计
      const workStats = {
        total: works.length,
        photography: works.filter((work) => work.type === 'photography').length,
        fitting: works.filter((work) => work.type === 'fitting').length,
        favorites: works.filter((work) => work.isFavorite).length,
        completed: works.filter((work) => work.status === 'completed').length,
        processing: works.filter((work) => work.status === 'processing').length,
      }

      // 计算任务统计
      const taskStats = {
        total: tasks.length,
        photography: tasks.filter((task) => task.type === 'photography').length,
        fitting: tasks.filter((task) => task.type === 'fitting').length,
        completed: tasks.filter((task) => task.status === 'completed').length,
        processing: tasks.filter((task) => task.status === 'processing').length,
        pending: tasks.filter((task) => task.status === 'pending').length,
      }

      const preferences = mapUserToLegacyFormat(user)

      return {
        user_info: {
          id: user.id,
          nickname: user.nickname ?? null,
          avatar_url: user.avatarUrl ?? null,
          credits: user.credits,
          total_credits: user.totalCredits,
          total_consumed_credits: user.totalConsumedCredits,
          total_earned_credits: user.totalEarnedCredits,
          register_time: user.registerTime?.toISOString() ?? null,
          last_login_time: user.lastLoginTime?.toISOString() ?? null,
          last_checkin_date: user.lastCheckinDate?.toISOString() ?? null,
          invite_code: user.inviteCode ?? null,
          invited_by: user.invitedBy ?? null,
          status: user.status ?? null,
          preferences: preferences,
        },
        work_stats: workStats,
        task_stats: taskStats,
        credit_stats: {
          current_credits: user.credits,
          total_earned: user.totalEarnedCredits,
          total_consumed: user.totalConsumedCredits,
        },
      }
    } catch (error) {
      console.error('获取用户统计失败:', error)
      // 如果Prisma查询失败，回退到legacy data store
      console.warn('回退到legacy data store')
      return this.getUserStatsLegacy(userId)
    }
  }

  async updateUserPreferences(userId: string, preferences: Record<string, unknown>) {
    const sanitized = pickPreferences(preferences)
    if (Object.keys(sanitized).length === 0) {
      return null
    }

    try {
      // 使用Prisma更新用户偏好设置
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user) {
        return null
      }

      // 获取现有metadata并合并新的preferences
      const existingMetadata = (user.metadata as Record<string, unknown>) || {}
      const existingPreferences = (existingMetadata.preferences as Record<string, unknown>) || {}

      const updatedMetadata = {
        ...existingMetadata,
        preferences: {
          ...existingPreferences,
          ...sanitized
        },
        updatedAt: new Date().toISOString()
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          metadata: updatedMetadata as Prisma.InputJsonValue
        }
      })

      const finalPreferences = mapUserToLegacyFormat(updated)

      return {
        id: updated.id,
        preferences: finalPreferences,
      }
    } catch (error) {
      console.error('更新用户偏好设置失败:', error)
      // 如果Prisma更新失败，回退到legacy data store
      console.warn('回退到legacy data store')
      return this.updateUserPreferencesLegacy(userId, sanitized)
    }
  }

  // 保留原有方法作为回退方案
  private getUserStatsLegacy(userId: string) {
    const user = legacyDataStore.getUser(userId)
    if (!user) {
      return null
    }

    const works = legacyDataStore.listWorksByUser(userId)

    const workStats = {
      total: works.length,
      photography: works.filter((work) => work.type === 'photography').length,
      fitting: works.filter((work) => work.type === 'fitting').length,
      favorites: works.filter((work) => work.isFavorite).length,
      completed: works.filter((work) => work.status === 'completed').length,
      processing: works.filter((work) => work.status === 'processing').length,
    }

    return {
      user_info: {
        id: user.id,
        nickname: user.nickname,
        avatar_url: user.avatarUrl ?? null,
        credits: user.credits,
        total_credits: user.totalCredits,
        total_consumed_credits: user.totalConsumedCredits,
        total_earned_credits: user.totalEarnedCredits,
        register_time: user.registerTime,
        last_login_time: user.lastLoginTime ?? null,
        last_checkin_date: user.lastCheckinDate ?? null,
        invite_code: user.inviteCode ?? null,
        invited_by: user.invitedBy ?? null,
        status: user.status ?? null,
        preferences: user.preferences,
      },
      work_stats: workStats,
      credit_stats: {
        current_credits: user.credits,
        total_earned: user.totalEarnedCredits,
        total_consumed: user.totalConsumedCredits,
      },
    }
  }

  private updateUserPreferencesLegacy(userId: string, sanitized: LegacyUserPreferences) {
    const updated = legacyDataStore.upsertUserPreferences(userId, sanitized)
    return updated
      ? {
          id: updated.id,
          preferences: updated.preferences,
        }
      : null
  }
}

export const legacyUsersService = new LegacyUsersService()
