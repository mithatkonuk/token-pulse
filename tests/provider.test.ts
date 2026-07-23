import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeProvider } from '../src/providers/claude-code'

let dir: string
let historyPath: string
let claudeJsonPath: string
let statuslineCachePath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-provider-test-'))
  historyPath = path.join(dir, 'plan-usage-history.json')
  claudeJsonPath = path.join(dir, 'claude.json')
  statuslineCachePath = path.join(dir, 'token-pulse-cache.json')
  fs.writeFileSync(
    claudeJsonPath,
    JSON.stringify({ oauthAccount: { organizationType: 'claude_max_5x', organizationUuid: 'org-a' } })
  )
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function provider() {
  return new ClaudeCodeProvider({ claudeJsonPath, historyPath, statuslineCachePath })
}

describe('ClaudeCodeProvider', () => {
  it('reads the plan tier from claude.json', () => {
    expect(provider().getPlanTier()).toBe('claude_max_5x')
  })

  it('falls back to null when claude.json is missing', () => {
    const p = new ClaudeCodeProvider({ claudeJsonPath: path.join(dir, 'missing.json'), historyPath, statuslineCachePath })
    expect(p.getPlanTier()).toBeNull()
  })

  it('returns null cached usage when the history file does not exist', () => {
    expect(provider().getCachedUsage()).toBeNull()
  })

  it('returns the latest sample as current percentages, with resetsAt null when no reset event is in history', () => {
    fs.writeFileSync(
      historyPath,
      JSON.stringify({
        version: 2,
        samples: [
          { t: 1000, org: 'org-a', u: { fh: 10, sd: 5 } },
          { t: 2000, org: 'org-a', u: { fh: 20, sd: 6 } },
          { t: 3000, org: 'org-a', u: { fh: 30, sd: 7 } },
        ],
      })
    )
    const usage = provider().getCachedUsage()
    expect(usage).not.toBeNull()
    expect(usage!.cacheUpdatedAt).toBe(new Date(3000).toISOString())
    expect(usage!.windows).toHaveLength(2)
    const fiveHour = usage!.windows.find((w) => w.id === 'five_hour')
    expect(fiveHour!.percentUsed).toBe(30)
    expect(fiveHour!.resetsAt).toBeNull()
  })

  it('approximates resetsAt as the last reset event time plus the window duration', () => {
    fs.writeFileSync(
      historyPath,
      JSON.stringify({
        version: 2,
        samples: [
          { t: 1000, org: 'org-a', u: { fh: 90, sd: 50 } },
          { t: 2000, org: 'org-a', u: { fh: 5, sd: 51 } }, // fh reset here
          { t: 3000, org: 'org-a', u: { fh: 15, sd: 52 } },
        ],
      })
    )
    const usage = provider().getCachedUsage()
    const fiveHour = usage!.windows.find((w) => w.id === 'five_hour')
    expect(fiveHour!.percentUsed).toBe(15)
    expect(fiveHour!.resetsAt).toBe(new Date(2000 + 5 * 60 * 60 * 1000).toISOString())
  })

  it('filters samples to the current org when org info is present', () => {
    fs.writeFileSync(
      historyPath,
      JSON.stringify({
        version: 2,
        samples: [
          { t: 1000, org: 'org-a', u: { fh: 10, sd: 5 } },
          { t: 2000, org: 'org-b', u: { fh: 99, sd: 99 } }, // different org, must be ignored
        ],
      })
    )
    const usage = provider().getCachedUsage()
    const fiveHour = usage!.windows.find((w) => w.id === 'five_hour')
    expect(fiveHour!.percentUsed).toBe(10)
  })

  it('reads the current model from the statusline cache as a best-effort label', () => {
    fs.writeFileSync(historyPath, JSON.stringify({ version: 2, samples: [{ t: 1000, org: 'org-a', u: { fh: 1, sd: 1 } }] }))
    fs.writeFileSync(statuslineCachePath, JSON.stringify({ model_display_name: 'Sonnet 5' }))
    const usage = provider().getCachedUsage()
    expect(usage!.currentModel).toBe('Sonnet 5')
  })

  it('returns null current model when the statusline cache is missing', () => {
    fs.writeFileSync(historyPath, JSON.stringify({ version: 2, samples: [{ t: 1000, org: 'org-a', u: { fh: 1, sd: 1 } }] }))
    const usage = provider().getCachedUsage()
    expect(usage!.currentModel).toBeNull()
  })

  it('returns null when the history file contains the JSON literal null (crash-safety)', () => {
    fs.writeFileSync(historyPath, 'null')
    expect(() => provider().getCachedUsage()).not.toThrow()
    expect(provider().getCachedUsage()).toBeNull()
  })

  it('returns null when samples is missing or not an array (crash-safety)', () => {
    fs.writeFileSync(historyPath, JSON.stringify({ version: 2 }))
    expect(() => provider().getCachedUsage()).not.toThrow()
    expect(provider().getCachedUsage()).toBeNull()
  })
})
