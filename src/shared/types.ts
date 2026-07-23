export interface UsageWindow {
  id: 'five_hour' | 'weekly'
  label: string
  percentUsed: number
  resetsAt: string | null
}

export interface UsageState {
  planTier: string | null
  currentModel: string | null
  windows: UsageWindow[]
  updatedAt: string
  cacheUpdatedAt: string | null
  startAtLogin: boolean
}
