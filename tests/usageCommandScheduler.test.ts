import { describe, it, expect } from 'vitest'
import {
  shouldRefreshUsageCommand,
  shouldRefreshImmediately,
  ACTIVE_INTERVAL_MS,
  IDLE_INTERVAL_MS,
  IDLE_THRESHOLD_MS,
  NEAR_LIMIT_INTERVAL_MS,
  IMMEDIATE_REFRESH_MIN_INTERVAL_MS,
  USER_TRIGGERED_MAX_FLOOR_MS,
  computeImmediateRefreshFloorMs,
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

describe('shouldRefreshUsageCommand near the limit', () => {
  it('uses the short near-limit cadence even while idle, so a session sitting at the cap is checked briskly', () => {
    const lastActivityAt = 0
    const lastRefreshAt = IDLE_THRESHOLD_MS
    expect(
      shouldRefreshUsageCommand(
        { now: lastRefreshAt + NEAR_LIMIT_INTERVAL_MS - 1, lastActivityAt, lastRefreshAt },
        { nearLimit: true }
      )
    ).toBe(false)
    expect(
      shouldRefreshUsageCommand(
        { now: lastRefreshAt + NEAR_LIMIT_INTERVAL_MS, lastActivityAt, lastRefreshAt },
        { nearLimit: true }
      )
    ).toBe(true)
  })

  it('overrides the active cadence too, so a session sitting at the cap while in active use is still checked briskly', () => {
    const lastActivityAt = 0
    const lastRefreshAt = 0
    expect(
      shouldRefreshUsageCommand(
        { now: NEAR_LIMIT_INTERVAL_MS - 1, lastActivityAt, lastRefreshAt },
        { nearLimit: true }
      )
    ).toBe(false)
    expect(
      shouldRefreshUsageCommand(
        { now: NEAR_LIMIT_INTERVAL_MS, lastActivityAt, lastRefreshAt },
        { nearLimit: true }
      )
    ).toBe(true)
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

describe('shouldRefreshImmediately', () => {
  it('refreshes even when the regular active interval has not elapsed yet', () => {
    const now = IMMEDIATE_REFRESH_MIN_INTERVAL_MS
    expect(shouldRefreshUsageCommand({ now, lastActivityAt: now, lastRefreshAt: 0 })).toBe(false)
    expect(shouldRefreshImmediately({ now, lastRefreshAt: 0 })).toBe(true)
  })

  it('does not refresh when one just finished, so repeated clicks cannot spawn a subprocess each time', () => {
    expect(shouldRefreshImmediately({ now: IMMEDIATE_REFRESH_MIN_INTERVAL_MS - 1, lastRefreshAt: 0 })).toBe(false)
  })

  it('honours a widened floor so a failing source keeps its backoff', () => {
    const backoffMs = 10 * 60 * 1000
    expect(shouldRefreshImmediately({ now: backoffMs - 1, lastRefreshAt: 0 }, backoffMs)).toBe(false)
    expect(shouldRefreshImmediately({ now: backoffMs, lastRefreshAt: 0 }, backoffMs)).toBe(true)
  })
})

describe('computeImmediateRefreshFloorMs', () => {
  const backoffMs = 60 * 60 * 1000

  it('uses the caller floor while the source is healthy', () => {
    expect(
      computeImmediateRefreshFloorMs({
        minIntervalMs: IMMEDIATE_REFRESH_MIN_INTERVAL_MS,
        backoffMs,
        consecutiveFailures: 0,
        userTriggered: true,
      })
    ).toBe(IMMEDIATE_REFRESH_MIN_INTERVAL_MS)
  })

  it('caps a failing source so opening the panel can still retry within a minute', () => {
    expect(
      computeImmediateRefreshFloorMs({
        minIntervalMs: IMMEDIATE_REFRESH_MIN_INTERVAL_MS,
        backoffMs,
        consecutiveFailures: 5,
        userTriggered: true,
      })
    ).toBe(USER_TRIGGERED_MAX_FLOOR_MS)
  })

  it('never drops below the caller floor', () => {
    expect(
      computeImmediateRefreshFloorMs({
        minIntervalMs: USER_TRIGGERED_MAX_FLOOR_MS * 2,
        backoffMs,
        consecutiveFailures: 5,
        userTriggered: true,
      })
    ).toBe(USER_TRIGGERED_MAX_FLOOR_MS * 2)
  })

  it('keeps the full backoff for triggers nobody is watching', () => {
    expect(
      computeImmediateRefreshFloorMs({
        minIntervalMs: IMMEDIATE_REFRESH_MIN_INTERVAL_MS,
        backoffMs,
        consecutiveFailures: 5,
        userTriggered: false,
      })
    ).toBe(backoffMs)
  })

  it('treats a backoff exactly at the cap as already capped', () => {
    expect(
      computeImmediateRefreshFloorMs({
        minIntervalMs: IMMEDIATE_REFRESH_MIN_INTERVAL_MS,
        backoffMs: USER_TRIGGERED_MAX_FLOOR_MS,
        consecutiveFailures: 1,
        userTriggered: true,
      })
    ).toBe(USER_TRIGGERED_MAX_FLOOR_MS)
  })

  it('still floors a failing source below the caller minimum', () => {
    expect(
      computeImmediateRefreshFloorMs({
        minIntervalMs: IMMEDIATE_REFRESH_MIN_INTERVAL_MS,
        backoffMs: IMMEDIATE_REFRESH_MIN_INTERVAL_MS / 2,
        consecutiveFailures: 1,
        userTriggered: true,
      })
    ).toBe(IMMEDIATE_REFRESH_MIN_INTERVAL_MS)
  })
})
