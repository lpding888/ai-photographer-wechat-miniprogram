export type LegacyWorkStatus = 'processing' | 'completed' | 'cancelled'
export type LegacyWorkTab = 'all' | 'favorites' | 'photography' | 'fitting' | 'completed' | 'processing'

export interface LegacyWorkRecord {
  id: string
  userId: string
  title: string
  type: 'photography' | 'fitting' | 'other'
  status: LegacyWorkStatus
  isFavorite: boolean
  images: Array<{ url: string }>
  createdAt: string
  taskId?: string
  metadata?: Record<string, unknown>
}

export interface LegacyUserPreferences {
  default_gender?: string
  default_age?: number
  default_height?: number
  default_nationality?: string
  default_skin_tone?: string
  auto_save_params?: boolean
  notification_enabled?: boolean
  [key: string]: unknown
}

export interface LegacyUserRecord {
  id: string
  nickname: string
  avatarUrl?: string
  credits: number
  totalCredits: number
  totalConsumedCredits: number
  totalEarnedCredits: number
  registerTime: string
  lastLoginTime?: string
  lastCheckinDate?: string
  inviteCode?: string
  invitedBy?: string
  status?: string
  preferences: LegacyUserPreferences
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor?: {
    lastId: string
    lastCreatedAt: string
  }
}
