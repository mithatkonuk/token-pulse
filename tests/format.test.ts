import { describe, it, expect } from 'vitest'
import { formatCountdown } from '../src/shared/format'

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
