import type { ContextWindow, Contributing, CostSummary, UsageEvent, UsageWindow } from '../shared/types'

export interface CachedLimits {
  windows: UsageWindow[]
  fetchedAt: string
}

export interface CachedUsage {
  currentModel: string | null
  contextWindow: ContextWindow | null
  limits: CachedLimits | null
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
  // Optional. Marks the current end of each local activity file, so that old activity is not counted.
  // With a start time, it returns the cost of the activity since that time.
  primeActivity?(since?: number): number
  // Optional. Returns the cost of new local activity in a changed file, or null when the file is
  // not an activity file.
  readActivity?(changedPath: string): number | null
}
