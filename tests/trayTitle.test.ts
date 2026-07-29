import { describe, it, expect } from 'vitest'
import { formatTrayTitle } from '../src/main/trayTitle'

describe('formatTrayTitle', () => {
  it('shows just the percentage when no window label is given', () => {
    expect(formatTrayTitle(63)).toBe(' 63%')
  })

  it('prefixes with "5h" for the five-hour window', () => {
    expect(formatTrayTitle(63, 'five_hour')).toBe('5h 63%')
  })

  it('prefixes with "Weekly" for the weekly window', () => {
    expect(formatTrayTitle(18, 'weekly')).toBe('Weekly 18%')
  })

  it('rounds the percentage', () => {
    expect(formatTrayTitle(24.6, 'weekly')).toBe('Weekly 25%')
  })
})
