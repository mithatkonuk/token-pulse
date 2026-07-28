import { describe, it, expect } from 'vitest'
import { getContextWindowSizeForModel } from '../src/providers/claude-code/modelContextWindows'

describe('getContextWindowSizeForModel', () => {
  it('returns 1M for current-generation 1M-context models', () => {
    expect(getContextWindowSizeForModel('claude-fable-5')).toBe(1_000_000)
    expect(getContextWindowSizeForModel('claude-mythos-5')).toBe(1_000_000)
    expect(getContextWindowSizeForModel('claude-opus-5')).toBe(1_000_000)
    expect(getContextWindowSizeForModel('claude-sonnet-5')).toBe(1_000_000)
    expect(getContextWindowSizeForModel('claude-opus-4-8')).toBe(1_000_000)
    expect(getContextWindowSizeForModel('claude-opus-4-7')).toBe(1_000_000)
    expect(getContextWindowSizeForModel('claude-opus-4-6')).toBe(1_000_000)
    expect(getContextWindowSizeForModel('claude-sonnet-4-6')).toBe(1_000_000)
  })

  it('returns 200k for models that are still on the 200k-token window', () => {
    expect(getContextWindowSizeForModel('claude-haiku-4-5-20251001')).toBe(200_000)
    expect(getContextWindowSizeForModel('claude-sonnet-4-5-20250929')).toBe(200_000)
    expect(getContextWindowSizeForModel('claude-opus-4-5-20251101')).toBe(200_000)
    expect(getContextWindowSizeForModel('claude-opus-4-1-20250805')).toBe(200_000)
  })

  it('falls back to the 1M default for an unrecognized or future model id', () => {
    expect(getContextWindowSizeForModel('claude-opus-99')).toBe(1_000_000)
  })

  it('falls back to the 1M default when given null', () => {
    expect(getContextWindowSizeForModel(null)).toBe(1_000_000)
  })
})
