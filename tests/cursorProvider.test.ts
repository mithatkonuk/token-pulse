import { describe, it, expect } from 'vitest'
import { CursorProvider } from '../src/providers/cursor'
import type { CursorPeriodUsage } from '../src/providers/cursor/dashboardClient'

function fakeUsage(overrides: Partial<CursorPeriodUsage> = {}): CursorPeriodUsage {
  return {
    billingCycleEndMs: 1786014291000,
    totalSpendCents: 636,
    limitCents: 2000,
    limitType: 'team',
    ...overrides,
  }
}

describe('CursorProvider', () => {
  it('returns null when there is no access token', async () => {
    const provider = new CursorProvider({ readAccessTokenFn: () => null })
    expect(await provider.getUsageFromCommand()).toBeNull()
  })

  it('returns null when the dashboard fetch fails', async () => {
    const provider = new CursorProvider({
      readAccessTokenFn: () => 'fake-token',
      fetchCurrentPeriodUsageFn: async () => null,
    })
    expect(await provider.getUsageFromCommand()).toBeNull()
  })

  it('maps a successful fetch into a billing_cycle window with cost, and caches the plan tier', async () => {
    const provider = new CursorProvider({
      readAccessTokenFn: () => 'fake-token',
      fetchCurrentPeriodUsageFn: async () => fakeUsage(),
    })
    const result = await provider.getUsageFromCommand()
    expect(result).not.toBeNull()
    expect(result!.windows).toEqual([
      { id: 'billing_cycle', label: 'Monthly billing cycle', percentUsed: 31.8, resetsText: 'resets Aug 6' },
    ])
    expect(result!.cost).toEqual({ spentCents: 636, limitCents: 2000 })
    expect(result!.recentActivity).toBeNull()
    expect(result!.contributing).toBeNull()
    expect(provider.getPlanTier()).toBe('team')
  })

  it('exposes the cursor chats directory as the watched path', () => {
    const provider = new CursorProvider({ chatsDir: '/fake/chats' })
    expect(provider.getWatchedPaths()).toEqual(['/fake/chats'])
  })

  it('returns null current model and context window from the cached-usage path', () => {
    const provider = new CursorProvider()
    expect(provider.getCachedUsage()).toEqual({ currentModel: null, contextWindow: null })
  })
})
