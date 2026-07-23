import { describe, it, expect } from 'vitest'
import { urgencyColorForPercent } from '../src/shared/urgencyColor'

describe('urgencyColorForPercent', () => {
  it('returns green below 70%', () => {
    expect(urgencyColorForPercent(0)).toBe('green')
    expect(urgencyColorForPercent(69.9)).toBe('green')
  })

  it('returns yellow from 70% up to 90%', () => {
    expect(urgencyColorForPercent(70)).toBe('yellow')
    expect(urgencyColorForPercent(89.9)).toBe('yellow')
  })

  it('returns red at 90% and above, including over 100%', () => {
    expect(urgencyColorForPercent(90)).toBe('red')
    expect(urgencyColorForPercent(150)).toBe('red')
  })
})
