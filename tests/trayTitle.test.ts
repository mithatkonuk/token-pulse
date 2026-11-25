import { describe, it, expect } from 'vitest'
import { formatTrayTitle, trayWindowLabelForWindowId, trayTitleFor, isDataOld } from '../src/main/trayTitle'

describe('formatTrayTitle', () => {
  it('shows just the percentage when no window label is given', () => {
    expect(formatTrayTitle(63)).toBe(' 63%')
  })

  it('suffixes with "5h" for the five-hour window', () => {
    expect(formatTrayTitle(63, 'five_hour')).toBe(' 63% 5h')
  })

  it('suffixes with "Wk" for the weekly window', () => {
    expect(formatTrayTitle(18, 'weekly')).toBe(' 18% Wk')
  })

  it('suffixes with "Mo" for Cursor\'s billing-cycle window', () => {
    expect(formatTrayTitle(32, 'billing_cycle')).toBe(' 32% Mo')
  })

  it('rounds the percentage', () => {
    expect(formatTrayTitle(24.6, 'weekly')).toBe(' 25% Wk')
  })
})

describe('trayWindowLabelForWindowId', () => {
  it('recognizes five_hour, weekly, and billing_cycle', () => {
    expect(trayWindowLabelForWindowId('five_hour')).toBe('five_hour')
    expect(trayWindowLabelForWindowId('weekly')).toBe('weekly')
    expect(trayWindowLabelForWindowId('billing_cycle')).toBe('billing_cycle')
  })

  it('returns null for an unknown or missing window id', () => {
    expect(trayWindowLabelForWindowId('something_else')).toBeNull()
    expect(trayWindowLabelForWindowId(undefined)).toBeNull()
  })
})

describe('trayTitleFor', () => {
  it('returns an empty string when percentUsed is null (no source available)', () => {
    expect(trayTitleFor(null)).toBe('')
  })

  it('delegates to formatTrayTitle when percentUsed is a number', () => {
    expect(trayTitleFor(63, 'five_hour')).toBe(' 63% 5h')
  })

  it('delegates to formatTrayTitle with no label when none is given', () => {
    expect(trayTitleFor(0)).toBe(' 0%')
  })
})

describe('approximate tray title', () => {
  it('marks an approximate value with a tilde', () => {
    expect(formatTrayTitle(48, 'five_hour', true)).toBe(' ~48% 5h')
  })

  it('adds no mark to a confirmed value', () => {
    expect(trayTitleFor(48, 'five_hour', false)).toBe(' 48% 5h')
  })
})

describe('isDataOld', () => {
  const now = Date.parse('2026-11-25T12:00:00Z')

  it('treats data older than 15 minutes as old', () => {
    expect(isDataOld('2026-11-25T11:40:00Z', now)).toBe(true)
  })

  it('treats recent data as current', () => {
    expect(isDataOld('2026-11-25T11:50:00Z', now)).toBe(false)
  })

  it('treats missing data as current', () => {
    expect(isDataOld(null, now)).toBe(false)
  })
})
