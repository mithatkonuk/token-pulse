import { describe, it, expect } from 'vitest'
import {
  shouldRefreshUsageCommand,
  shouldRefreshOnOpen,
  ACTIVE_INTERVAL_MS,
  IDLE_INTERVAL_MS,
  IDLE_THRESHOLD_MS,
  OPEN_REFRESH_MIN_INTERVAL_MS,
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

describe('shouldRefreshUsageCommand with a custom config', () => {
  it('uses the overridden active interval instead of the default', () => {
    const lastActivityAt = 0
    const lastRefreshAt = 0
    const customActiveMs = 5 * 60 * 1000
    expect(
      shouldRefreshUsageCommand(
        { now: customActiveMs - 1, lastActivityAt, lastRefreshAt },
        { activeIntervalMs: customActiveMs }
      )
    ).toBe(false)
    expect(
      shouldRefreshUsageCommand(
        { now: customActiveMs, lastActivityAt, lastRefreshAt },
        { activeIntervalMs: customActiveMs }
      )
    ).toBe(true)
  })

  it('falls back to the module defaults for any field left unspecified', () => {
    expect(
      shouldRefreshUsageCommand({ now: ACTIVE_INTERVAL_MS, lastActivityAt: 0, lastRefreshAt: 0 }, {})
    ).toBe(true)
  })
})

describe('shouldRefreshOnOpen', () => {
  it('refreshes even when the regular active interval has not elapsed yet', () => {
    const now = OPEN_REFRESH_MIN_INTERVAL_MS
    expect(shouldRefreshUsageCommand({ now, lastActivityAt: now, lastRefreshAt: 0 })).toBe(false)
    expect(shouldRefreshOnOpen({ now, lastRefreshAt: 0 })).toBe(true)
  })

  it('does not refresh when one just finished, so repeated clicks cannot spawn a subprocess each time', () => {
    expect(shouldRefreshOnOpen({ now: OPEN_REFRESH_MIN_INTERVAL_MS - 1, lastRefreshAt: 0 })).toBe(false)
  })

  it('honours a widened floor so a failing source keeps its backoff', () => {
    const backoffMs = 10 * 60 * 1000
    expect(shouldRefreshOnOpen({ now: backoffMs - 1, lastRefreshAt: 0 }, backoffMs)).toBe(false)
    expect(shouldRefreshOnOpen({ now: backoffMs, lastRefreshAt: 0 }, backoffMs)).toBe(true)
  })
})
