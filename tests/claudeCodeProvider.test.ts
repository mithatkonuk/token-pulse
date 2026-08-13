import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeProvider } from '../src/providers/claude-code'

describe('ClaudeCodeProvider.isAvailable', () => {
  it('returns true when the injected availability check returns true', () => {
    const provider = new ClaudeCodeProvider({ isAvailableFn: () => true })
    expect(provider.isAvailable()).toBe(true)
  })

  it('returns false when the injected availability check returns false', () => {
    // hasLocalDataFn is also injected here to isolate this assertion from whatever real
    // ~/.claude.json or ~/.claude/projects happen to exist on the machine running the tests.
    const provider = new ClaudeCodeProvider({ isAvailableFn: () => false, hasLocalDataFn: () => false })
    expect(provider.isAvailable()).toBe(false)
  })

  it('returns true when local Claude data exists even if the CLI availability check returns false', () => {
    const provider = new ClaudeCodeProvider({ isAvailableFn: () => false, hasLocalDataFn: () => true })
    expect(provider.isAvailable()).toBe(true)
  })

  it('returns false when neither the CLI nor local data is available', () => {
    const provider = new ClaudeCodeProvider({ isAvailableFn: () => false, hasLocalDataFn: () => false })
    expect(provider.isAvailable()).toBe(false)
  })

  describe('default hasLocalDataFn', () => {
    let dir: string

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-claude-local-data-test-'))
    })

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('returns true when claudeJsonPath exists on disk, even if the CLI check returns false', () => {
      const claudeJsonPath = path.join(dir, '.claude.json')
      fs.writeFileSync(claudeJsonPath, '{}')
      const provider = new ClaudeCodeProvider({
        claudeJsonPath,
        projectsDir: path.join(dir, 'nonexistent-projects'),
        isAvailableFn: () => false,
      })
      expect(provider.isAvailable()).toBe(true)
    })

    it('returns false when neither claudeJsonPath nor projectsDir exist on disk', () => {
      const provider = new ClaudeCodeProvider({
        claudeJsonPath: path.join(dir, 'nonexistent.claude.json'),
        projectsDir: path.join(dir, 'nonexistent-projects'),
        isAvailableFn: () => false,
      })
      expect(provider.isAvailable()).toBe(false)
    })
  })
})
