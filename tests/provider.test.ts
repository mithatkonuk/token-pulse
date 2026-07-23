import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeProvider } from '../src/providers/claude-code'
import type { PlanLimitsConfig } from '../src/providers/claude-code/planLimits'

let dir: string
let dbPath: string
let claudeJsonPath: string

const planLimitsConfig: PlanLimitsConfig = {
  defaultTier: 'claude_pro',
  tiers: {
    claude_pro: { five_hour: 1000, weekly: 10000 },
    claude_max_5x: { five_hour: 5000, weekly: 50000 },
  },
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-provider-test-'))
  dbPath = path.join(dir, 'usage.db')
  claudeJsonPath = path.join(dir, 'claude.json')

  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE turns (
      timestamp TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
      cache_read_tokens INTEGER, cache_creation_tokens INTEGER
    )
  `)
  db.exec(`INSERT INTO turns VALUES ('2026-07-23T11:00:00.000Z', 'claude-sonnet-5', 100, 100, 0, 0)`)
  db.close()

  fs.writeFileSync(claudeJsonPath, JSON.stringify({ oauthAccount: { organizationType: 'claude_max_5x' } }))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('ClaudeCodeProvider', () => {
  it('reads the plan tier from claude.json', () => {
    const provider = new ClaudeCodeProvider({ claudeJsonPath, usageDbPath: dbPath, planLimitsConfig })
    expect(provider.getPlanTier()).toBe('claude_max_5x')
  })

  it('falls back to null when claude.json is missing', () => {
    const provider = new ClaudeCodeProvider({
      claudeJsonPath: path.join(dir, 'missing.json'),
      usageDbPath: dbPath,
      planLimitsConfig,
    })
    expect(provider.getPlanTier()).toBeNull()
  })

  it('reads the most recent model from usage.db', () => {
    const provider = new ClaudeCodeProvider({ claudeJsonPath, usageDbPath: dbPath, planLimitsConfig })
    expect(provider.getCurrentModel()).toBe('claude-sonnet-5')
  })

  it('computes the five_hour window using the tier-specific limit', () => {
    const provider = new ClaudeCodeProvider({ claudeJsonPath, usageDbPath: dbPath, planLimitsConfig })
    const now = new Date('2026-07-23T12:00:00.000Z')
    const window = provider.getWindow('five_hour', now)
    expect(window.usedTokens).toBe(200)
    expect(window.limitTokens).toBe(5000)
    expect(window.percentUsed).toBe(4)
  })
})
