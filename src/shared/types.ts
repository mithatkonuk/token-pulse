export interface UsageWindow {
  id: string
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

export interface UsageEvent {
  timestamp: string
  model: string
  tokens: number
  costCents: number | null
}

export interface CostSummary {
  spentCents: number
  limitCents: number | null
}

export interface AppSettings {
  startAtLogin: boolean
  theme: 'dark' | 'light' | 'system'
  accentColor: string
  fontFamily: 'system' | 'roboto' | 'open-sans'
  fontSize: 'small' | 'medium' | 'large'
}

export interface SourceUsage {
  planTier: string | null
  accountEmail: string | null
  currentModel: string | null
  windows: UsageWindow[]
  contextWindow: ContextWindow | null
  contributing: Contributing | null
  cost: CostSummary | null
  recentActivity: UsageEvent[] | null
  updatedAt: string
  cacheUpdatedAt: string | null
}

export interface SourceDescriptor {
  id: string
  label: string
}

export interface AppState {
  sources: SourceDescriptor[]
  activeSourceId: string | null
  usageBySource: Record<string, SourceUsage>
  settings: AppSettings
  appVersion: string
}
