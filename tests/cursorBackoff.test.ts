import { describe, it, expect } from 'vitest'
import { computeBackoffIntervalMs, MAX_BACKOFF_MS } from '../src/main/cursorBackoff'

describe('computeBackoffIntervalMs', () => {
  it('returns the base interval when there have been no failures', () => {
    expect(computeBackoffIntervalMs(5 * 60 * 1000, 0)).toBe(5 * 60 * 1000)
  })

  it('doubles the interval per consecutive failure', () => {
    const base = 5 * 60 * 1000
    expect(computeBackoffIntervalMs(base, 1)).toBe(base * 2)
    expect(computeBackoffIntervalMs(base, 2)).toBe(base * 4)
  })

  it('caps the backoff at one hour', () => {
    expect(computeBackoffIntervalMs(5 * 60 * 1000, 10)).toBe(MAX_BACKOFF_MS)
  })
})
