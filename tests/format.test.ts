import { describe, it, expect } from 'vitest'
import { formatCountdown, formatRelativeTime } from '../src/shared/format'

describe('formatCountdown', () => {
  const now = new Date('2026-07-23T12:00:00.000Z')

  it('formats a sub-hour countdown in minutes', () => {
    expect(formatCountdown('2026-07-23T12:45:00.000Z', now)).toBe('resets in 45m')
  })

  it('formats an hours+minutes countdown', () => {
    expect(formatCountdown('2026-07-23T14:14:00.000Z', now)).toBe('resets in 2h 14m')
  })

  it('formats a multi-day countdown in days', () => {
    expect(formatCountdown('2026-07-26T12:00:00.000Z', now)).toBe('resets in 3d')
  })

  it('returns "resets now" when the reset time has passed', () => {
    expect(formatCountdown('2026-07-23T11:00:00.000Z', now)).toBe('resets now')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-23T12:00:00.000Z')

  it('returns "just now" for anything under a minute old', () => {
    expect(formatRelativeTime('2026-07-23T11:59:30.000Z', now)).toBe('just now')
  })

  it('formats a sub-hour age in minutes', () => {
    expect(formatRelativeTime('2026-07-23T11:45:00.000Z', now)).toBe('15m ago')
  })

  it('formats a sub-day age in hours', () => {
    expect(formatRelativeTime('2026-07-23T09:00:00.000Z', now)).toBe('3h ago')
  })

  it('formats a multi-day age in days', () => {
    expect(formatRelativeTime('2026-07-20T12:00:00.000Z', now)).toBe('3d ago')
  })
})
