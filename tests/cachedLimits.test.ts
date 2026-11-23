import { describe, it, expect } from 'vitest'
import {
  CACHED_LIMITS_MAX_AGE_MS,
  formatResetsText,
  readClaudeJsonLimits,
  readStatuslineLimits,
} from '../src/providers/claude-code/cachedLimits'
import { parseResetTimestamp } from '../src/main/resetTimestamp'

const NOW = Date.parse('2026-11-23T13:40:00Z')
const FIVE_HOUR_RESET = Date.parse('2026-11-23T17:00:00Z')
const WEEKLY_RESET = Date.parse('2026-11-28T13:00:00Z')

describe('formatResetsText', () => {
  it('writes the same text as the `/usage` command', () => {
    expect(formatResetsText(new Date(FIVE_HOUR_RESET), 'Europe/Berlin')).toBe('Nov 23 at 6pm (Europe/Berlin)')
  })

  it('writes the minutes when the reset is not on the hour', () => {
    expect(formatResetsText(new Date('2026-08-10T18:39:00Z'), 'Europe/Berlin')).toBe('Aug 10 at 8:39pm (Europe/Berlin)')
  })

  it('removes the seconds, as the `/usage` command shows 16:59:59.75 as 5:59pm', () => {
    expect(formatResetsText(new Date('2026-11-23T16:59:59.754Z'), 'Europe/Berlin')).toBe('Nov 23 at 5:59pm (Europe/Berlin)')
  })

  it('writes a text that parseResetTimestamp reads back to the same instant in the local zone', () => {
    const text = formatResetsText(new Date(FIVE_HOUR_RESET))
    expect(parseResetTimestamp(text, new Date(NOW))?.getTime()).toBe(FIVE_HOUR_RESET)
  })
})

function statusline(overrides: Record<string, unknown> = {}) {
  return {
    five_hour: { used_percentage: 23.4, resets_at: FIVE_HOUR_RESET / 1000 },
    seven_day: { used_percentage: 4, resets_at: WEEKLY_RESET / 1000 },
    updated_at: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  }
}

describe('readStatuslineLimits', () => {
  it('returns rounded 5-hour and weekly windows with the cache time', () => {
    expect(readStatuslineLimits(statusline(), NOW, 'Europe/Berlin')).toEqual({
      windows: [
        { id: 'five_hour', label: 'Every 5 hours', percentUsed: 23, resetsText: 'Nov 23 at 6pm (Europe/Berlin)' },
        { id: 'weekly', label: 'Weekly', percentUsed: 4, resetsText: 'Nov 28 at 2pm (Europe/Berlin)' },
      ],
      fetchedAt: new Date(NOW - 60_000).toISOString(),
    })
  })

  it('returns null when the cache is older than the maximum age', () => {
    const old = statusline({ updated_at: new Date(NOW - CACHED_LIMITS_MAX_AGE_MS - 1).toISOString() })
    expect(readStatuslineLimits(old, NOW)).toBeNull()
  })

  it('returns null when the cache has no time', () => {
    expect(readStatuslineLimits(statusline({ updated_at: undefined }), NOW)).toBeNull()
  })

  it('returns null when the cache has no limit windows', () => {
    expect(readStatuslineLimits(statusline({ five_hour: null, seven_day: null }), NOW)).toBeNull()
  })

  it('shows a 0% 5-hour window when only the weekly window is present, as the `/usage` path does', () => {
    const limits = readStatuslineLimits(statusline({ five_hour: null }), NOW)
    expect(limits?.windows[0]).toEqual({ id: 'five_hour', label: 'Every 5 hours', percentUsed: 0, resetsText: null })
    expect(limits?.windows[1].id).toBe('weekly')
  })

  it('returns null for a value with the wrong shape', () => {
    expect(readStatuslineLimits(statusline({ five_hour: { used_percentage: '23' } }), NOW)).toBeNull()
    expect(readStatuslineLimits(null, NOW)).toBeNull()
    expect(readStatuslineLimits('text', NOW)).toBeNull()
  })
})

const ACCOUNT = 'f51111c3-445d-4643-8b13-860f53c9ddc4'

function claudeJson(cacheOverrides: Record<string, unknown> = {}, accountUuid: string = ACCOUNT) {
  return {
    oauthAccount: { accountUuid },
    cachedUsageUtilization: {
      fetchedAtMs: NOW - 30_000,
      accountUuid: ACCOUNT,
      utilization: {
        five_hour: { utilization: 31, resets_at: '2026-11-23T16:59:59.754366+00:00' },
        seven_day: { utilization: 4, resets_at: '2026-11-28T12:59:59.754391+00:00' },
        seven_day_opus: null,
      },
      ...cacheOverrides,
    },
  }
}

describe('readClaudeJsonLimits', () => {
  it('returns the 5-hour and weekly windows when the cache belongs to the signed-in account', () => {
    expect(readClaudeJsonLimits(claudeJson(), NOW, 'Europe/Berlin')).toEqual({
      windows: [
        { id: 'five_hour', label: 'Every 5 hours', percentUsed: 31, resetsText: 'Nov 23 at 5:59pm (Europe/Berlin)' },
        { id: 'weekly', label: 'Weekly', percentUsed: 4, resetsText: 'Nov 28 at 1:59pm (Europe/Berlin)' },
      ],
      fetchedAt: new Date(NOW - 30_000).toISOString(),
    })
  })

  it('returns null when the cache belongs to a different account', () => {
    expect(readClaudeJsonLimits(claudeJson({}, 'another-account'), NOW)).toBeNull()
  })

  it('returns null when an account id is missing', () => {
    expect(readClaudeJsonLimits(claudeJson({ accountUuid: undefined }), NOW)).toBeNull()
    expect(readClaudeJsonLimits({ cachedUsageUtilization: claudeJson().cachedUsageUtilization }, NOW)).toBeNull()
  })

  it('returns null when the cache is older than the maximum age', () => {
    expect(readClaudeJsonLimits(claudeJson({ fetchedAtMs: NOW - CACHED_LIMITS_MAX_AGE_MS - 1 }), NOW)).toBeNull()
  })

  it('returns null when Claude Code changes the cache format', () => {
    expect(readClaudeJsonLimits(claudeJson({ utilization: undefined }), NOW)).toBeNull()
    expect(readClaudeJsonLimits(claudeJson({ utilization: { five_hour: { percent: 31 } } }), NOW)).toBeNull()
    expect(readClaudeJsonLimits({ oauthAccount: { accountUuid: ACCOUNT } }, NOW)).toBeNull()
  })
})
