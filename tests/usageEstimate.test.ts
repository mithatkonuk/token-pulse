import { describe, it, expect } from 'vitest'
import { estimatePercent, recordConfirmed, EMPTY_ESTIMATE, type EstimateState } from '../src/main/usageEstimate'

const WINDOW = 'Nov 24 at 3pm (Europe/Berlin)'

function confirmAll(steps: Array<[percent: number, cost: number, resetsText?: string]>, start: EstimateState = EMPTY_ESTIMATE) {
  return steps.reduce((state, [percent, cost, resetsText = WINDOW]) => recordConfirmed(state, { percent, resetsText }, cost), start)
}

describe('recordConfirmed', () => {
  it('learns the rate after a step of a few percent', () => {
    const state = confirmAll([
      [10, 0],
      [13, 300],
    ])
    expect(state.rate).toBeCloseTo(0.01)
  })

  it('waits for a larger step before it learns', () => {
    const state = confirmAll([
      [10, 0],
      [11, 100],
    ])
    expect(state.rate).toBeNull()
  })

  it('starts again in a new window', () => {
    const state = confirmAll([
      [80, 0],
      [2, 100, 'Nov 24 at 8pm (Europe/Berlin)'],
      [5, 400, 'Nov 24 at 8pm (Europe/Berlin)'],
    ])
    expect(state.rate).toBeCloseTo(0.01)
  })

  it('ignores a step that no local cost explains', () => {
    const state = confirmAll([
      [10, 0],
      [40, 0],
      [41, 100],
    ])
    expect(state.rate).toBeNull()
  })

  it('smooths a new sample into the old rate', () => {
    const state = confirmAll([
      [10, 0],
      [13, 300],
      [16, 400],
    ])
    expect(state.rate).toBeGreaterThan(0.01)
    expect(state.rate).toBeLessThan(0.03)
  })
})

describe('estimatePercent', () => {
  it('returns null before a rate is known', () => {
    expect(estimatePercent(confirmAll([[10, 0]]), 500)).toBeNull()
  })

  it('adds the cost since the last confirmed value', () => {
    const state = confirmAll([
      [10, 0],
      [13, 300],
    ])
    expect(estimatePercent(state, 500)).toBe(15)
  })

  it('returns null when the cost adds less than one percent', () => {
    const state = confirmAll([
      [10, 0],
      [13, 300],
    ])
    expect(estimatePercent(state, 320)).toBeNull()
  })

  it('stops at 100 percent', () => {
    const state = confirmAll([
      [10, 0],
      [13, 300],
    ])
    expect(estimatePercent(state, 100_000)).toBe(100)
  })

  it('keeps a learned rate from an earlier run', () => {
    const state = recordConfirmed({ ...EMPTY_ESTIMATE, rate: 0.01 }, { percent: 40, resetsText: WINDOW }, 1000)
    expect(estimatePercent(state, 1200)).toBe(42)
  })
})
