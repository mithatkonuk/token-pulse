import { describe, it, expect } from 'vitest'
import { isNearLimit } from '../src/main/nearLimit'
import type { SourceUsage } from '../src/shared/types'

function usageWithWindows(windows: SourceUsage['windows']): SourceUsage {
  return {
    planTier: null,
    currentModel: null,
    windows,
    contextWindow: null,
    contributing: null,
    cost: null,
    recentActivity: null,
    updatedAt: new Date(0).toISOString(),
    cacheUpdatedAt: null,
  }
}

describe('isNearLimit', () => {
  it('is true once the five_hour window is at or above the default (orange) threshold', () => {
    const usage = usageWithWindows([
      { id: 'five_hour', label: 'Every 5 hours', percentUsed: 80, resetsText: null },
    ])
    expect(isNearLimit(usage)).toBe(true)
  })

  it('is false when the five_hour window is below the default threshold', () => {
    const usage = usageWithWindows([
      { id: 'five_hour', label: 'Every 5 hours', percentUsed: 79, resetsText: null },
    ])
    expect(isNearLimit(usage)).toBe(false)
  })

  it('ignores a high weekly/billing_cycle window with no five_hour window present', () => {
    const usage = usageWithWindows([{ id: 'weekly', label: 'Weekly', percentUsed: 100, resetsText: null }])
    expect(isNearLimit(usage)).toBe(false)
  })

  it('ignores a high weekly window even when five_hour is present but low', () => {
    const usage = usageWithWindows([
      { id: 'five_hour', label: 'Every 5 hours', percentUsed: 10, resetsText: null },
      { id: 'weekly', label: 'Weekly', percentUsed: 100, resetsText: null },
    ])
    expect(isNearLimit(usage)).toBe(false)
  })

  it('honours a custom threshold', () => {
    const usage = usageWithWindows([
      { id: 'five_hour', label: 'Every 5 hours', percentUsed: 50, resetsText: null },
    ])
    expect(isNearLimit(usage, 40)).toBe(true)
    expect(isNearLimit(usage, 60)).toBe(false)
  })
})
