export interface UsageWindow {
  id: 'five_hour' | 'weekly'
  label: string
  usedTokens: number
  limitTokens: number
  percentUsed: number
  resetsAt: string
}

export interface UsageState {
  planTier: string
  currentModel: string | null
  windows: UsageWindow[]
  updatedAt: string
  startAtLogin: boolean
}
