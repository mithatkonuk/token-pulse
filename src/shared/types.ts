export interface UsageWindow {
  id: 'five_hour' | 'weekly'
  label: string
  percentUsed: number
  resetsAt: string | null
}

export interface AppSettings {
  startAtLogin: boolean
  theme: 'dark' | 'light'
  accentColor: string
  fontFamily: 'system' | 'monospace' | 'serif'
  fontSize: 'small' | 'medium' | 'large'
}

export interface UsageState {
  planTier: string | null
  currentModel: string | null
  windows: UsageWindow[]
  updatedAt: string
  cacheUpdatedAt: string | null
  settings: AppSettings
  appVersion: string
}
