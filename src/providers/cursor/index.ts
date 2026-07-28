import os from 'node:os'
import path from 'node:path'
import type { CachedUsage, CommandUsageResult, UsageProvider } from '../types'
import type { UsageEvent } from '../../shared/types'
import { readCursorAccessToken } from './cursorAuth'
import { fetchCurrentPeriodUsage, fetchFilteredUsageEvents, type CursorPeriodUsage, type CursorUsageEvent } from './dashboardClient'

const MAX_RECENT_ACTIVITY = 5

export interface CursorProviderOptions {
  chatsDir?: string
  readAccessTokenFn?: () => string | null
  fetchCurrentPeriodUsageFn?: (accessToken: string) => Promise<CursorPeriodUsage | null>
  fetchFilteredUsageEventsFn?: (accessToken: string) => Promise<CursorUsageEvent[] | null>
}

function formatResetDate(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) {
    return 'reset time unknown'
  }
  const formatted = new Date(epochMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return `resets ${formatted}`
}

export class CursorProvider implements UsageProvider {
  private readonly chatsDir: string
  private readonly readAccessTokenFn: () => string | null
  private readonly fetchCurrentPeriodUsageFn: (accessToken: string) => Promise<CursorPeriodUsage | null>
  private readonly fetchFilteredUsageEventsFn: (accessToken: string) => Promise<CursorUsageEvent[] | null>
  private lastPlanTier: string | null = null

  constructor(options: CursorProviderOptions = {}) {
    this.chatsDir = options.chatsDir ?? path.join(os.homedir(), '.cursor', 'chats')
    this.readAccessTokenFn = options.readAccessTokenFn ?? readCursorAccessToken
    this.fetchCurrentPeriodUsageFn = options.fetchCurrentPeriodUsageFn ?? ((token) => fetchCurrentPeriodUsage(token))
    this.fetchFilteredUsageEventsFn = options.fetchFilteredUsageEventsFn ?? ((token) => fetchFilteredUsageEvents(token))
  }

  getWatchedPaths(): string[] {
    return [this.chatsDir]
  }

  getPlanTier(): string | null {
    return this.lastPlanTier
  }

  getCachedUsage(): CachedUsage {
    return { currentModel: null, contextWindow: null }
  }

  async getUsageFromCommand(): Promise<CommandUsageResult | null> {
    const token = this.readAccessTokenFn()
    if (token === null) {
      return null
    }
    const usage = await this.fetchCurrentPeriodUsageFn(token)
    if (usage === null) {
      return null
    }
    this.lastPlanTier = usage.limitType
    const percentUsed = usage.limitCents > 0 ? (usage.totalSpendCents / usage.limitCents) * 100 : 0
    const events = await this.fetchFilteredUsageEventsFn(token)
    const recentActivity: UsageEvent[] | null =
      events === null
        ? null
        : events.slice(0, MAX_RECENT_ACTIVITY).map((event) => ({
            timestamp: new Date(event.timestampMs).toISOString(),
            model: event.model,
            tokens: event.totalTokens,
            costCents: event.costCents,
          }))
    return {
      windows: [
        {
          id: 'billing_cycle',
          label: 'Monthly billing cycle',
          percentUsed,
          resetsText: formatResetDate(usage.billingCycleEndMs),
        },
      ],
      contributing: null,
      cost: { spentCents: usage.totalSpendCents, limitCents: usage.limitCents },
      recentActivity,
      fetchedAt: new Date().toISOString(),
    }
  }
}
