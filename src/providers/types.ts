import type { ContextWindow, Contributing, CostSummary, UsageEvent, UsageWindow } from '../shared/types'

export interface CachedUsage {
  currentModel: string | null
  contextWindow: ContextWindow | null
}

export interface CommandUsageResult {
  windows: UsageWindow[]
  contributing: Contributing | null
  cost: CostSummary | null
  recentActivity: UsageEvent[] | null
  fetchedAt: string
}

export interface UsageProvider {
  isAvailable(): boolean
  getWatchedPaths(): string[]
  getPlanTier(): string | null
  getAccountEmail(): string | null
  getCachedUsage(): CachedUsage
  getUsageFromCommand(cwd: string): Promise<CommandUsageResult | null>
}
