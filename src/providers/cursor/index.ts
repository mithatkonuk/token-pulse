import os from 'node:os'
import path from 'node:path'
import { readCursorAccessToken } from './cursorAuth'
import { fetchCurrentPeriodUsage, type CursorPeriodUsage } from './dashboardClient'

export interface CursorProviderOptions {
  chatsDir?: string
  readAccessTokenFn?: () => string | null
  fetchCurrentPeriodUsageFn?: (accessToken: string) => Promise<CursorPeriodUsage | null>
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

export class CursorProvider {
  private readonly chatsDir: string
  private readonly readAccessTokenFn: () => string | null
  private readonly fetchCurrentPeriodUsageFn: (accessToken: string) => Promise<CursorPeriodUsage | null>
  private lastPlanTier: string | null = null

  constructor(options: CursorProviderOptions = {}) {
    this.chatsDir = options.chatsDir ?? path.join(os.homedir(), '.cursor', 'chats')
    this.readAccessTokenFn = options.readAccessTokenFn ?? readCursorAccessToken
    this.fetchCurrentPeriodUsageFn = options.fetchCurrentPeriodUsageFn ?? ((token) => fetchCurrentPeriodUsage(token))
  }

  getWatchedPaths(): string[] {
    return [this.chatsDir]
  }

  getPlanTier(): string | null {
    return this.lastPlanTier
  }

  getCachedUsage(): { currentModel: string | null; contextWindow: null } {
    return { currentModel: null, contextWindow: null }
  }

  async getUsageFromCommand(): Promise<{
    windows: Array<{ id: string; label: string; percentUsed: number; resetsText: string | null }>
    contributing: null
    cost: { spentCents: number; limitCents: number | null }
    recentActivity: null
    fetchedAt: string
  } | null> {
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
      recentActivity: null,
      fetchedAt: new Date().toISOString(),
    }
  }
}
