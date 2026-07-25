import { describe, it, expect } from 'vitest'
import { formatCompactNumber, formatPlanTier, formatRelativeTime } from '../src/shared/format'

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

describe('formatCompactNumber', () => {
  it('leaves sub-thousand numbers as plain integers', () => {
    expect(formatCompactNumber(983)).toBe('983')
  })

  it('formats thousands with one decimal and a lowercase k suffix', () => {
    expect(formatCompactNumber(263600)).toBe('263.6k')
  })

  it('formats millions with one decimal and an uppercase M suffix', () => {
    expect(formatCompactNumber(1200000)).toBe('1.2M')
  })
})

describe('formatPlanTier', () => {
  it('returns "plan unknown" for null', () => {
    expect(formatPlanTier(null)).toBe('plan unknown')
  })

  it('strips a leading claude_ prefix and capitalizes the rest', () => {
    expect(formatPlanTier('claude_pro')).toBe('Pro')
  })

  it('capitalizes tiers with no claude_ prefix', () => {
    expect(formatPlanTier('team')).toBe('Team')
  })
})
