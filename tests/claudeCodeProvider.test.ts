import { describe, it, expect } from 'vitest'
import { ClaudeCodeProvider } from '../src/providers/claude-code'

describe('ClaudeCodeProvider.isAvailable', () => {
  it('returns true when the injected availability check returns true', () => {
    const provider = new ClaudeCodeProvider({ isAvailableFn: () => true })
    expect(provider.isAvailable()).toBe(true)
  })

  it('returns false when the injected availability check returns false', () => {
    const provider = new ClaudeCodeProvider({ isAvailableFn: () => false })
    expect(provider.isAvailable()).toBe(false)
  })
})
