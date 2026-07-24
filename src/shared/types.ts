export interface UsageWindow {
  id: 'five_hour' | 'weekly'
  label: string
  percentUsed: number
  resetsAt: string | null
}

export interface ContextWindow {
  usedPercentage: number
  totalInputTokens: number
  contextWindowSize: number
}

export interface AppSettings {
  startAtLogin: boolean
  theme: 'dark' | 'light' | 'system'
  accentColor: string
  fontFamily: 'system' | 'monospace' | 'serif' | 'menlo' | 'jetbrains-mono'
  fontSize: 'small' | 'medium' | 'large'
}

export interface UsageState {
  planTier: string | null
  currentModel: string | null
  windows: UsageWindow[]
  contextWindow: ContextWindow | null
  updatedAt: string
  cacheUpdatedAt: string | null
  settings: AppSettings
  appVersion: string
}
