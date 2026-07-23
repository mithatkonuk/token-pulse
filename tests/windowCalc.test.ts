import { describe, it, expect } from 'vitest'
import { computeWindow, tokensForTurn, type TurnRow } from '../src/providers/claude-code/windowCalc'

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000

function turn(
  timestamp: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheCreationTokens = 0
): TurnRow {
  return { timestamp, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }
}

describe('tokensForTurn', () => {
  it('sums input, output, and cache-creation tokens but not cache-read tokens', () => {
    expect(tokensForTurn(turn('2026-07-23T10:00:00.000Z', 100, 200, 5000, 10))).toBe(310)
  })
})

describe('computeWindow', () => {
  const now = new Date('2026-07-23T12:00:00.000Z')

  it('returns zero usage and resetsAt=now when there are no turns', () => {
    const result = computeWindow([], FIVE_HOURS_MS, now)
    expect(result.usedTokens).toBe(0)
    expect(result.resetsAt).toEqual(now)
  })

  it('excludes turns older than the window', () => {
    const turns = [turn('2026-07-23T06:00:00.000Z', 1000, 1000)]
    const result = computeWindow(turns, FIVE_HOURS_MS, now)
    expect(result.usedTokens).toBe(0)
  })

  it('sums turns inside the window', () => {
    const turns = [turn('2026-07-23T11:00:00.000Z', 100, 50), turn('2026-07-23T11:30:00.000Z', 200, 100)]
    const result = computeWindow(turns, FIVE_HOURS_MS, now)
    expect(result.usedTokens).toBe(450)
  })

  it('sets resetsAt to the oldest in-window turn plus the window duration', () => {
    const turns = [turn('2026-07-23T11:00:00.000Z', 100, 50), turn('2026-07-23T11:30:00.000Z', 200, 100)]
    const result = computeWindow(turns, FIVE_HOURS_MS, now)
    expect(result.resetsAt).toEqual(new Date('2026-07-23T16:00:00.000Z'))
  })
})
