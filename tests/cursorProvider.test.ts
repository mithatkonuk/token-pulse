import { describe, it, expect } from 'vitest'
import { CursorProvider } from '../src/providers/cursor'
import type { CursorPeriodUsage, CursorUsageEvent } from '../src/providers/cursor/dashboardClient'

function fakeUsage(overrides: Partial<CursorPeriodUsage> = {}): CursorPeriodUsage {
  return {
    billingCycleEndMs: 1786014291000,
    totalSpendCents: 636,
    limitCents: 2000,
    limitType: 'team',
    ...overrides,
  }
}

function fakeEvent(overrides: Partial<CursorUsageEvent> = {}): CursorUsageEvent {
  return {
    timestampMs: 1785178363958,
    model: 'default',
    totalTokens: 23402,
    costCents: 120,
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
      fetchFilteredUsageEventsFn: async () => [],
    })
    const result = await provider.getUsageFromCommand()
    expect(result).not.toBeNull()
    expect(result!.windows).toEqual([
      { id: 'billing_cycle', label: 'Monthly billing cycle', percentUsed: 31.8, resetsText: 'resets Aug 6' },
    ])
    expect(result!.cost).toEqual({ spentCents: 636, limitCents: 2000 })
    expect(result!.contributing).toBeNull()
    expect(provider.getPlanTier()).toBe('team')
  })

  it('maps fetched events into recentActivity, most recent first, capped at 5', async () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      fakeEvent({ timestampMs: 1785178363958 - i * 1000, model: `model-${i}`, totalTokens: i, costCents: i })
    )
    const provider = new CursorProvider({
      readAccessTokenFn: () => 'fake-token',
      fetchCurrentPeriodUsageFn: async () => fakeUsage(),
      fetchFilteredUsageEventsFn: async () => events,
    })
    const result = await provider.getUsageFromCommand()
    expect(result!.recentActivity).toHaveLength(5)
    expect(result!.recentActivity![0]).toEqual({
      timestamp: new Date(1785178363958).toISOString(),
      model: 'model-0',
      tokens: 0,
      costCents: 0,
    })
  })

  it('leaves recentActivity null when the events fetch fails, without failing the whole result', async () => {
    const provider = new CursorProvider({
      readAccessTokenFn: () => 'fake-token',
      fetchCurrentPeriodUsageFn: async () => fakeUsage(),
      fetchFilteredUsageEventsFn: async () => null,
    })
    const result = await provider.getUsageFromCommand()
    expect(result).not.toBeNull()
    expect(result!.recentActivity).toBeNull()
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
