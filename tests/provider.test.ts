import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeProvider } from '../src/providers/claude-code'

let dir: string
let historyPath: string
let claudeJsonPath: string
let statuslineCachePath: string
let projectsDir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-provider-test-'))
  historyPath = path.join(dir, 'plan-usage-history.json')
  claudeJsonPath = path.join(dir, 'claude.json')
  statuslineCachePath = path.join(dir, 'token-pulse-cache.json')
  projectsDir = path.join(dir, 'projects')
  fs.mkdirSync(projectsDir)
  fs.writeFileSync(
    claudeJsonPath,
    JSON.stringify({ oauthAccount: { organizationType: 'claude_max_5x', organizationUuid: 'org-a' } })
  )
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function provider() {
  return new ClaudeCodeProvider({ claudeJsonPath, historyPath, statuslineCachePath, projectsDir })
}

describe('ClaudeCodeProvider', () => {
  it('reads the plan tier from claude.json', () => {
    expect(provider().getPlanTier()).toBe('claude_max_5x')
  })

  it('falls back to null when claude.json is missing', () => {
    const p = new ClaudeCodeProvider({ claudeJsonPath: path.join(dir, 'missing.json'), historyPath, statuslineCachePath })
    expect(p.getPlanTier()).toBeNull()
  })

  it('exposes the paths it reads from, for file-watch wiring', () => {
    expect(provider().getWatchedPaths()).toEqual([historyPath, statuslineCachePath, claudeJsonPath, projectsDir])
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
    // Reset detected between t=1000 (still 90) and t=2000 (dropped to 5) — anchor at the midpoint, 1500.
    expect(fiveHour!.resetsAt).toBe(new Date(1500 + 5 * 60 * 60 * 1000).toISOString())
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

  it('prefers the model from the newest session transcript over the statusline cache', () => {
    fs.writeFileSync(historyPath, JSON.stringify({ version: 2, samples: [{ t: 1000, org: 'org-a', u: { fh: 1, sd: 1 } }] }))
    fs.writeFileSync(statuslineCachePath, JSON.stringify({ model_display_name: 'Sonnet 5' }))
    const projectDir = path.join(projectsDir, 'my-project')
    fs.mkdirSync(projectDir)
    fs.writeFileSync(path.join(projectDir, 'session.jsonl'), JSON.stringify({ message: { model: 'claude-opus-5' } }))
    const usage = provider().getCachedUsage()
    expect(usage!.currentModel).toBe('Opus 5')
  })

  it('falls back to the statusline cache when no transcript is found', () => {
    fs.writeFileSync(historyPath, JSON.stringify({ version: 2, samples: [{ t: 1000, org: 'org-a', u: { fh: 1, sd: 1 } }] }))
    fs.writeFileSync(statuslineCachePath, JSON.stringify({ model_display_name: 'Sonnet 5' }))
    const usage = provider().getCachedUsage()
    expect(usage!.currentModel).toBe('Sonnet 5')
  })

  it('reads the context window from the statusline cache', () => {
    fs.writeFileSync(historyPath, JSON.stringify({ version: 2, samples: [{ t: 1000, org: 'org-a', u: { fh: 1, sd: 1 } }] }))
    fs.writeFileSync(
      statuslineCachePath,
      JSON.stringify({ context_window: { used_percentage: 27, total_input_tokens: 263600, context_window_size: 967000 } })
    )
    const usage = provider().getCachedUsage()
    expect(usage!.contextWindow).toEqual({ usedPercentage: 27, totalInputTokens: 263600, contextWindowSize: 967000 })
  })

  it('returns null context window when the statusline cache is missing', () => {
    fs.writeFileSync(historyPath, JSON.stringify({ version: 2, samples: [{ t: 1000, org: 'org-a', u: { fh: 1, sd: 1 } }] }))
    const usage = provider().getCachedUsage()
    expect(usage!.contextWindow).toBeNull()
  })

  it('returns null context window when the cached fields are malformed', () => {
    fs.writeFileSync(historyPath, JSON.stringify({ version: 2, samples: [{ t: 1000, org: 'org-a', u: { fh: 1, sd: 1 } }] }))
    fs.writeFileSync(statuslineCachePath, JSON.stringify({ context_window: { used_percentage: 'a lot' } }))
    const usage = provider().getCachedUsage()
    expect(usage!.contextWindow).toBeNull()
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

  it('skips a malformed non-tail sample instead of crashing (e.g. u: null)', () => {
    fs.writeFileSync(
      historyPath,
      JSON.stringify({
        version: 2,
        samples: [
          { t: 1000, org: 'org-a', u: null },
          { t: 2000, org: 'org-a', u: { fh: 20, sd: 10 } },
        ],
      })
    )
    expect(() => provider().getCachedUsage()).not.toThrow()
    const usage = provider().getCachedUsage()
    expect(usage).not.toBeNull()
    const fiveHour = usage!.windows.find((w) => w.id === 'five_hour')
    expect(fiveHour!.percentUsed).toBe(20)
  })

  it('anchors resetsAt on the post-drop sample (not the midpoint) when the gap is large, e.g. app was asleep/closed', () => {
    const FIVE_MIN = 5 * 60 * 1000
    const gapStart = 1_000_000
    const gapEnd = gapStart + 3 * 60 * 60 * 1000 // 3h gap — the app was asleep, pre-drop sample is stale
    fs.writeFileSync(
      historyPath,
      JSON.stringify({
        version: 2,
        samples: [
          { t: gapStart, org: 'org-a', u: { fh: 100, sd: 50 } },
          { t: gapEnd, org: 'org-a', u: { fh: 0, sd: 50 } }, // resumed sampling right after the real reset
          { t: gapEnd + FIVE_MIN, org: 'org-a', u: { fh: 10, sd: 50 } },
        ],
      })
    )
    const usage = provider().getCachedUsage()
    const fiveHour = usage!.windows.find((w) => w.id === 'five_hour')
    expect(fiveHour!.resetsAt).toBe(new Date(gapEnd + 5 * 60 * 60 * 1000).toISOString())
  })

  it('picks the most recent reset event when there are multiple resets in history', () => {
    fs.writeFileSync(
      historyPath,
      JSON.stringify({
        version: 2,
        samples: [
          { t: 1000, org: 'org-a', u: { fh: 90, sd: 1 } },
          { t: 2000, org: 'org-a', u: { fh: 10, sd: 1 } }, // first reset
          { t: 3000, org: 'org-a', u: { fh: 50, sd: 1 } },
          { t: 4000, org: 'org-a', u: { fh: 5, sd: 1 } }, // second (most recent) reset
          { t: 5000, org: 'org-a', u: { fh: 15, sd: 1 } },
        ],
      })
    )
    const usage = provider().getCachedUsage()
    const fiveHour = usage!.windows.find((w) => w.id === 'five_hour')
    // Second reset detected between t=3000 (50) and t=4000 (dropped to 5) — midpoint 3500.
    expect(fiveHour!.resetsAt).toBe(new Date(3500 + 5 * 60 * 60 * 1000).toISOString())
  })
})
