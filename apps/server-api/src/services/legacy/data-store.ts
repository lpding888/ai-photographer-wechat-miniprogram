import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { LegacyUserPreferences, LegacyUserRecord, LegacyWorkRecord } from './types.js'

interface LegacySeedData {
  works: LegacyWorkRecord[]
  users: LegacyUserRecord[]
}

const DEFAULT_SEED: LegacySeedData = {
  works: [
    {
      id: 'work-demo-1',
      userId: 'user-demo-1',
      title: '摄影作品示例',
      type: 'photography',
      status: 'completed',
      isFavorite: true,
      images: [{ url: 'https://example.com/work-demo-1.jpg' }],
      createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      taskId: 'task-demo-1',
      metadata: { resolution: '1024x1024' },
    },
    {
      id: 'work-demo-2',
      userId: 'user-demo-1',
      title: '试衣任务示例',
      type: 'fitting',
      status: 'processing',
      isFavorite: false,
      images: [],
      createdAt: new Date().toISOString(),
      taskId: 'task-demo-2',
    },
  ],
  users: [
    {
      id: 'user-demo-1',
      nickname: '体验用户',
      avatarUrl: 'https://example.com/avatar.png',
      credits: 120,
      totalCredits: 320,
      totalConsumedCredits: 200,
      totalEarnedCredits: 320,
      registerTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
      lastLoginTime: new Date().toISOString(),
      lastCheckinDate: new Date().toISOString().slice(0, 10),
      inviteCode: 'TST123',
      invitedBy: undefined,
      status: 'active',
      preferences: {
        default_gender: 'female',
        auto_save_params: true,
      },
    },
  ],
}

const DATA_DIR = process.env.LEGACY_DATA_ROOT
  ? process.env.LEGACY_DATA_ROOT
  : join(process.cwd(), 'tools', 'migration', 'data')

const DATA_FILE = process.env.LEGACY_DATA_FILE
  ? process.env.LEGACY_DATA_FILE
  : join(DATA_DIR, 'legacy-seed.json')

const safeReadSeed = (): LegacySeedData => {
  if (existsSync(DATA_FILE)) {
    try {
      const raw = readFileSync(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(raw) as LegacySeedData
      return {
        works: parsed.works ?? [],
        users: parsed.users ?? [],
      }
    } catch (error) {
      console.warn('[legacy] 读取自定义种子数据失败，采用默认数据', error)
    }
  }

  return DEFAULT_SEED
}

const seed = safeReadSeed()

const worksById = new Map<string, LegacyWorkRecord>()
for (const work of seed.works) {
  worksById.set(work.id, { ...work })
}

const usersById = new Map<string, LegacyUserRecord>()
for (const user of seed.users) {
  usersById.set(user.id, { ...user })
}

export const legacyDataStore = {
  listWorksByUser(userId: string) {
    return [...worksById.values()].filter((work) => work.userId === userId)
  },
  getWorkById(workId: string) {
    return worksById.get(workId)
  },
  saveWork(work: LegacyWorkRecord) {
    worksById.set(work.id, work)
  },
  deleteWork(workId: string) {
    return worksById.delete(workId)
  },
  getUser(userId: string) {
    return usersById.get(userId)
  },
  updateUser(userId: string, updater: (prev: LegacyUserRecord) => LegacyUserRecord) {
    const prev = usersById.get(userId)
    if (!prev) {
      return null
    }
    const updated = updater({ ...prev })
    usersById.set(userId, updated)
    return updated
  },
  upsertUserPreferences(userId: string, preferences: LegacyUserPreferences) {
    const prev = usersById.get(userId)
    if (!prev) {
      return null
    }
    const updated: LegacyUserRecord = {
      ...prev,
      preferences: {
        ...prev.preferences,
        ...preferences,
      },
      lastLoginTime: prev.lastLoginTime ?? new Date().toISOString(),
    }
    usersById.set(userId, updated)
    return updated
  },
}
