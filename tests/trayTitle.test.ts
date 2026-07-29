import { describe, it, expect } from 'vitest'
import { formatTrayTitle, trayWindowLabelForWindowId } from '../src/main/trayTitle'

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
