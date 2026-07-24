import { describe, it, expect } from 'vitest'
import { urgencyColorForPercent } from '../src/shared/urgencyColor'

describe('urgencyColorForPercent', () => {
  it('returns blue below 80%', () => {
    expect(urgencyColorForPercent(0)).toBe('blue')
    expect(urgencyColorForPercent(79.9)).toBe('blue')
  })

  it('returns yellow from 80% up to 90%', () => {
    expect(urgencyColorForPercent(80)).toBe('yellow')
    expect(urgencyColorForPercent(89.9)).toBe('yellow')
  })

  it('returns red at 90% and above, including over 100%', () => {
    expect(urgencyColorForPercent(90)).toBe('red')
    expect(urgencyColorForPercent(150)).toBe('red')
  })
})
