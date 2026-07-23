import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeProvider } from '../src/providers/claude-code'

let dir: string
let cachePath: string
let claudeJsonPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-provider-test-'))
  cachePath = path.join(dir, 'token-pulse-cache.json')
  claudeJsonPath = path.join(dir, 'claude.json')
  fs.writeFileSync(claudeJsonPath, JSON.stringify({ oauthAccount: { organizationType: 'claude_max_5x' } }))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('ClaudeCodeProvider', () => {
  it('reads the plan tier from claude.json', () => {
    const provider = new ClaudeCodeProvider({ claudeJsonPath, cachePath })
    expect(provider.getPlanTier()).toBe('claude_max_5x')
  })

  it('falls back to null when claude.json is missing', () => {
    const provider = new ClaudeCodeProvider({ claudeJsonPath: path.join(dir, 'missing.json'), cachePath })
    expect(provider.getPlanTier()).toBeNull()
  })

  it('returns null cached usage when the cache file does not exist yet', () => {
    const provider = new ClaudeCodeProvider({ claudeJsonPath, cachePath })
    expect(provider.getCachedUsage()).toBeNull()
  })

  it('reads both windows, model, and freshness from a real cache file', () => {
    fs.writeFileSync(
      cachePath,
      JSON.stringify({
        five_hour: { used_percentage: 15, resets_at: 1784850000 },
        seven_day: { used_percentage: 52, resets_at: 1784950000 },
        model_display_name: 'Sonnet 5',
        updated_at: '2026-07-23T20:10:00Z',
      })
    )
    const provider = new ClaudeCodeProvider({ claudeJsonPath, cachePath })
    const usage = provider.getCachedUsage()
    expect(usage).not.toBeNull()
    expect(usage!.currentModel).toBe('Sonnet 5')
    expect(usage!.cacheUpdatedAt).toBe('2026-07-23T20:10:00Z')
    expect(usage!.windows).toEqual([
      { id: 'five_hour', label: 'Every 5 hours', percentUsed: 15, resetsAt: new Date(1784850000 * 1000).toISOString() },
      { id: 'weekly', label: 'Weekly', percentUsed: 52, resetsAt: new Date(1784950000 * 1000).toISOString() },
    ])
  })

  it('omits a window whose rate-limit data is null in the cache', () => {
    fs.writeFileSync(
      cachePath,
      JSON.stringify({
        five_hour: { used_percentage: 15, resets_at: 1784850000 },
        seven_day: null,
        model_display_name: null,
        updated_at: '2026-07-23T20:10:00Z',
      })
    )
    const provider = new ClaudeCodeProvider({ claudeJsonPath, cachePath })
    const usage = provider.getCachedUsage()
    expect(usage!.windows).toHaveLength(1)
    expect(usage!.windows[0].id).toBe('five_hour')
    expect(usage!.currentModel).toBeNull()
  })

  it('omits a window whose rate-limit field is present but malformed (missing resets_at), without throwing', () => {
    fs.writeFileSync(
      cachePath,
      JSON.stringify({
        five_hour: { used_percentage: 15 },
        seven_day: { used_percentage: 52, resets_at: 1784950000 },
        model_display_name: 'Sonnet 5',
        updated_at: 12345,
      })
    )
    const provider = new ClaudeCodeProvider({ claudeJsonPath, cachePath })
    let usage: ReturnType<typeof provider.getCachedUsage>
    expect(() => {
      usage = provider.getCachedUsage()
    }).not.toThrow()
    expect(usage!.windows).toHaveLength(1)
    expect(usage!.windows[0].id).toBe('weekly')
    expect(usage!.cacheUpdatedAt).toBeNull()
  })

  it('returns null when the cache file contains the JSON literal null', () => {
    fs.writeFileSync(cachePath, 'null')
    const provider = new ClaudeCodeProvider({ claudeJsonPath, cachePath })
    expect(() => provider.getCachedUsage()).not.toThrow()
    expect(provider.getCachedUsage()).toBeNull()
  })
})
