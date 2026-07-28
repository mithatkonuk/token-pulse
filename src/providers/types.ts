import type { ContextWindow, Contributing, UsageWindow } from '../shared/types'

export interface CachedUsage {
  currentModel: string | null
  contextWindow: ContextWindow | null
}

export interface CommandUsageResult {
  windows: UsageWindow[]
  contributing: Contributing | null
  cost: { spentCents: number; limitCents: number | null } | null
  recentActivity: Array<{ timestamp: string; model: string; tokens: number; costCents: number | null }> | null
  fetchedAt: string
}

export interface UsageProvider {
  getWatchedPaths(): string[]
  getPlanTier(): string | null
  getCachedUsage(): CachedUsage
  getUsageFromCommand(cwd: string): Promise<CommandUsageResult | null>
}
