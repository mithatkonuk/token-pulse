export interface UsageWindow {
  id: 'five_hour' | 'weekly'
  label: string
  percentUsed: number
  resetsText: string | null
}

export interface TopEntry {
  name: string
  percent: number
}

export interface ContributingStats {
  requests: number
  sessions: number
  aboveContextPercent: number | null
  topSkills: TopEntry[]
  topSubagents: TopEntry[]
  topPlugins: TopEntry[]
  topMcpServers: TopEntry[]
}

export interface Contributing {
  last24h: ContributingStats | null
  last7d: ContributingStats | null
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
  contributing: Contributing | null
  updatedAt: string
  cacheUpdatedAt: string | null
  settings: AppSettings
  appVersion: string
}
