import { describe, it, expect } from 'vitest'
import {
  parseResetTimestamp,
  computeResetRefreshDelayMs,
  RESET_REFRESH_BUFFER_MS,
  STALE_RESET_RETRY_MS,
} from '../src/main/resetTimestamp'

describe('parseResetTimestamp', () => {
  it('parses a time with minutes', () => {
    const now = new Date(2026, 7, 10, 12, 0, 0)
    const result = parseResetTimestamp('Aug 10 at 8:39pm (Europe/Berlin)', now)
    expect(result).toEqual(new Date(2026, 7, 10, 20, 39, 0))
  })

  it('parses a time without minutes', () => {
    const now = new Date(2026, 7, 10, 12, 0, 0)
    const result = parseResetTimestamp('Aug 16 at 10am (Europe/Berlin)', now)
    expect(result).toEqual(new Date(2026, 7, 16, 10, 0, 0))
  })

  it('handles 12am/12pm correctly', () => {
    const now = new Date(2026, 7, 9, 20, 0, 0)
    expect(parseResetTimestamp('Aug 10 at 12am (Europe/Berlin)', now)).toEqual(new Date(2026, 7, 10, 0, 0, 0))
    expect(parseResetTimestamp('Aug 10 at 12pm (Europe/Berlin)', now)).toEqual(new Date(2026, 7, 10, 12, 0, 0))
  })

  it('rolls over to next year when the parsed date has already passed this year', () => {
    const now = new Date(2026, 11, 31, 23, 0, 0)
    const result = parseResetTimestamp('Jan 2 at 3am (Europe/Berlin)', now)
    expect(result).toEqual(new Date(2027, 0, 2, 3, 0, 0))
  })

  it('returns null for unparseable text', () => {
    expect(parseResetTimestamp('sometime soon')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(parseResetTimestamp(null)).toBeNull()
  })
})

describe('computeResetRefreshDelayMs', () => {
  it('returns the buffered delay for an upcoming reset', () => {
    const now = new Date(2026, 7, 20, 3, 0, 0)
    const delay = computeResetRefreshDelayMs('Aug 20 at 4:10am (Europe/Berlin)', now)
    expect(delay).toBe(70 * 60 * 1000 + RESET_REFRESH_BUFFER_MS)
  })

  it('retries soon instead of waiting a year when the CLI repeats a just-passed reset', () => {
    // Refresh landed 6 seconds after the reset instant, but the backend hasn't rolled the window
    // yet, so the CLI still reports the same (now just-barely-past) text.
    const now = new Date(2026, 7, 20, 4, 10, 6)
    const delay = computeResetRefreshDelayMs('Aug 20 at 4:10am (Europe/Berlin)', now)
    expect(delay).toBe(STALE_RESET_RETRY_MS)
  })

  it('returns null for unparseable text', () => {
    expect(computeResetRefreshDelayMs('sometime soon')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(computeResetRefreshDelayMs(null)).toBeNull()
  })
})
