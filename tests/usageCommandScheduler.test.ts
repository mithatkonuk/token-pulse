import { describe, it, expect } from 'vitest'
import {
  shouldRefreshUsageCommand,
  ACTIVE_INTERVAL_MS,
  IDLE_INTERVAL_MS,
  IDLE_THRESHOLD_MS,
} from '../src/main/usageCommandScheduler'

describe('shouldRefreshUsageCommand', () => {
  it('refreshes on the active cadence when there was recent activity', () => {
    const lastActivityAt = 0
    const lastRefreshAt = 0
    expect(
      shouldRefreshUsageCommand({ now: ACTIVE_INTERVAL_MS - 1, lastActivityAt, lastRefreshAt })
    ).toBe(false)
    expect(shouldRefreshUsageCommand({ now: ACTIVE_INTERVAL_MS, lastActivityAt, lastRefreshAt })).toBe(true)
  })

  it('backs off to the idle cadence once activity has been quiet past the threshold', () => {
    const lastActivityAt = 0
    const lastRefreshAt = IDLE_THRESHOLD_MS
    // Still within the active interval since the last refresh, but activity is now stale.
    expect(
      shouldRefreshUsageCommand({
        now: IDLE_THRESHOLD_MS + ACTIVE_INTERVAL_MS,
        lastActivityAt,
        lastRefreshAt,
      })
    ).toBe(false)
    expect(
      shouldRefreshUsageCommand({
        now: lastRefreshAt + IDLE_INTERVAL_MS,
        lastActivityAt,
        lastRefreshAt,
      })
    ).toBe(true)
  })

  it('snaps back to the active cadence on the first check after activity resumes', () => {
    const lastRefreshAt = 0
    const lastActivityAt = IDLE_THRESHOLD_MS + ACTIVE_INTERVAL_MS
    const now = lastActivityAt + ACTIVE_INTERVAL_MS
    expect(shouldRefreshUsageCommand({ now, lastActivityAt, lastRefreshAt })).toBe(true)
  })
})
