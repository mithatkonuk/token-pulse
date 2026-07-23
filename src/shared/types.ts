export interface UsageWindow {
  id: 'five_hour' | 'weekly'
  label: string
  percentUsed: number
  resetsAt: string
}

export interface UsageState {
  planTier: string | null
  currentModel: string | null
  windows: UsageWindow[]
  updatedAt: string
  cacheUpdatedAt: string | null
  startAtLogin: boolean
}
