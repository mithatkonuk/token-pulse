import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeProvider } from '../src/providers/claude-code'

let dir: string
let claudeJsonPath: string
let statuslineCachePath: string
let projectsDir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-provider-test-'))
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

function provider(runUsageCommandFn?: (cwd: string) => Promise<string | null>) {
  return new ClaudeCodeProvider({ claudeJsonPath, statuslineCachePath, projectsDir, runUsageCommandFn })
}

describe('ClaudeCodeProvider', () => {
  it('reads the plan tier from claude.json', () => {
    expect(provider().getPlanTier()).toBe('claude_max_5x')
  })

  it('reads the signed-in account email from claude.json', () => {
    fs.writeFileSync(
      claudeJsonPath,
      JSON.stringify({ oauthAccount: { organizationType: 'claude_team', emailAddress: 'me@example.com' } })
    )
    expect(provider().getAccountEmail()).toBe('me@example.com')
  })

  it('returns a null account email when claude.json has none or is missing', () => {
    expect(provider().getAccountEmail()).toBeNull()
    const p = new ClaudeCodeProvider({ claudeJsonPath: path.join(dir, 'missing.json'), statuslineCachePath })
    expect(p.getAccountEmail()).toBeNull()
  })

  it('falls back to null when claude.json is missing', () => {
    const p = new ClaudeCodeProvider({ claudeJsonPath: path.join(dir, 'missing.json'), statuslineCachePath })
    expect(p.getPlanTier()).toBeNull()
  })

  it('exposes the paths it reads from, for file-watch wiring', () => {
    expect(provider().getWatchedPaths()).toEqual([statuslineCachePath, claudeJsonPath, projectsDir])
  })

  it('reads the current model from the statusline cache as a best-effort label', () => {
    fs.writeFileSync(statuslineCachePath, JSON.stringify({ model_display_name: 'Sonnet 5' }))
    expect(provider().getCachedUsage().currentModel).toBe('Sonnet 5')
  })

  it('returns null current model when the statusline cache is missing', () => {
    expect(provider().getCachedUsage().currentModel).toBeNull()
  })

  it('prefers the model from the newest session transcript over the statusline cache', () => {
    fs.writeFileSync(statuslineCachePath, JSON.stringify({ model_display_name: 'Sonnet 5' }))
    const projectDir = path.join(projectsDir, 'my-project')
    fs.mkdirSync(projectDir)
    fs.writeFileSync(path.join(projectDir, 'session.jsonl'), JSON.stringify({ message: { model: 'claude-opus-5' } }))
    expect(provider().getCachedUsage().currentModel).toBe('Opus 5')
  })

  it('reads the context window from the statusline cache', () => {
    fs.writeFileSync(
      statuslineCachePath,
      JSON.stringify({ context_window: { used_percentage: 27, total_input_tokens: 263600, context_window_size: 967000 } })
    )
    expect(provider().getCachedUsage().contextWindow).toEqual({
      usedPercentage: 27,
      totalInputTokens: 263600,
      contextWindowSize: 967000,
    })
  })

  it('returns null context window when the statusline cache is missing', () => {
    expect(provider().getCachedUsage().contextWindow).toBeNull()
  })

  it('returns null context window when the cached fields are malformed', () => {
    fs.writeFileSync(statuslineCachePath, JSON.stringify({ context_window: { used_percentage: 'a lot' } }))
    expect(provider().getCachedUsage().contextWindow).toBeNull()
  })

  it('prefers a fresh token count from the transcript over a stale cached total, keeping the cached window size', () => {
    fs.writeFileSync(
      statuslineCachePath,
      JSON.stringify({ context_window: { used_percentage: 3, total_input_tokens: 28701, context_window_size: 1000000 } })
    )
    const projectDir = path.join(projectsDir, 'my-project')
    fs.mkdirSync(projectDir)
    fs.writeFileSync(
      path.join(projectDir, 'session.jsonl'),
      JSON.stringify({
        type: 'assistant',
        message: { usage: { input_tokens: 2, cache_creation_input_tokens: 19, cache_read_input_tokens: 331300 } },
      })
    )
    const contextWindow = provider().getCachedUsage().contextWindow
    expect(contextWindow?.totalInputTokens).toBe(331321)
    expect(contextWindow?.contextWindowSize).toBe(1000000)
    expect(contextWindow?.usedPercentage).toBeCloseTo(33.1321, 4)
  })

  it('falls back to a default context window size when the transcript has usage but the cache is missing entirely', () => {
    const projectDir = path.join(projectsDir, 'my-project')
    fs.mkdirSync(projectDir)
    fs.writeFileSync(
      path.join(projectDir, 'session.jsonl'),
      JSON.stringify({
        type: 'assistant',
        message: { usage: { input_tokens: 2, cache_creation_input_tokens: 19, cache_read_input_tokens: 331300 } },
      })
    )
    const contextWindow = provider().getCachedUsage().contextWindow
    expect(contextWindow?.totalInputTokens).toBe(331321)
    expect(contextWindow?.contextWindowSize).toBe(1000000)
    expect(contextWindow?.usedPercentage).toBeCloseTo(33.1321, 4)
  })

  it('prefers the exact context window size for the transcript-reported model over a stale/wrong cached size', () => {
    fs.writeFileSync(
      statuslineCachePath,
      JSON.stringify({ context_window: { used_percentage: 3, total_input_tokens: 28701, context_window_size: 1000000 } })
    )
    const projectDir = path.join(projectsDir, 'my-project')
    fs.mkdirSync(projectDir)
    fs.writeFileSync(
      path.join(projectDir, 'session.jsonl'),
      JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-haiku-4-5-20251001',
          usage: { input_tokens: 2, cache_creation_input_tokens: 19, cache_read_input_tokens: 51300 },
        },
      })
    )
    const contextWindow = provider().getCachedUsage().contextWindow
    expect(contextWindow?.totalInputTokens).toBe(51321)
    expect(contextWindow?.contextWindowSize).toBe(200_000)
    expect(contextWindow?.usedPercentage).toBeCloseTo(25.6605, 4)
  })

  it('falls back to the statusline cache entirely when the transcript has no usage data', () => {
    fs.writeFileSync(
      statuslineCachePath,
      JSON.stringify({ context_window: { used_percentage: 27, total_input_tokens: 263600, context_window_size: 967000 } })
    )
    const projectDir = path.join(projectsDir, 'my-project')
    fs.mkdirSync(projectDir)
    fs.writeFileSync(path.join(projectDir, 'session.jsonl'), JSON.stringify({ type: 'user', message: { role: 'user' } }))
    expect(provider().getCachedUsage().contextWindow).toEqual({
      usedPercentage: 27,
      totalInputTokens: 263600,
      contextWindowSize: 967000,
    })
  })

  describe('getUsageFromCommand', () => {
    const USAGE_TEXT = `Current session: 6% used · resets Jul 26 at 4:30am (Europe/Berlin)
Current week (all models): 79% used · resets Jul 26 at 10am (Europe/Berlin)

Last 24h · 350 requests · 2 sessions
  90% of your usage was at >150k context

Last 7d · 3998 requests · 9 sessions
  79% of your usage was at >150k context
  Top plugins: superpowers 8%
`

    it('returns windows and contributing stats parsed from the command output', async () => {
      const p = provider(async () => USAGE_TEXT)
      const result = await p.getUsageFromCommand('/some/cwd')
      expect(result).not.toBeNull()
      expect(result!.windows).toEqual([
        { id: 'five_hour', label: 'Every 5 hours', percentUsed: 6, resetsText: 'Jul 26 at 4:30am (Europe/Berlin)' },
        { id: 'weekly', label: 'Weekly', percentUsed: 79, resetsText: 'Jul 26 at 10am (Europe/Berlin)' },
      ])
      expect(result!.contributing!.last24h).toMatchObject({ requests: 350, sessions: 2, aboveContextPercent: 90 })
      expect(result!.contributing!.last7d!.topPlugins).toEqual([{ name: 'superpowers', percent: 8 }])
    })

    it('reports an explicit 0%-used five_hour window when no session is currently active, instead of dropping it', async () => {
      const NO_ACTIVE_SESSION_TEXT = `Current week (all models): 79% used · resets Jul 26 at 10am (Europe/Berlin)

Last 24h · 0 requests · 0 sessions

Last 7d · 3998 requests · 9 sessions
`
      const p = provider(async () => NO_ACTIVE_SESSION_TEXT)
      const result = await p.getUsageFromCommand('/some/cwd')
      expect(result).not.toBeNull()
      expect(result!.windows).toContainEqual({ id: 'five_hour', label: 'Every 5 hours', percentUsed: 0, resetsText: null })
    })

    it('omits the five_hour window entirely (does not synthesize 0%) when the output is garbage/error text with no weekly line either', async () => {
      const p = provider(async () => 'Something unrelated happened.')
      const result = await p.getUsageFromCommand('/some/cwd')
      expect(result).not.toBeNull()
      expect(result!.windows).toEqual([])
    })

    it('passes the given cwd through to the injected command runner', async () => {
      let receivedCwd: string | null = null
      const p = provider(async (cwd) => {
        receivedCwd = cwd
        return USAGE_TEXT
      })
      await p.getUsageFromCommand('/my/scratch/dir')
      expect(receivedCwd).toBe('/my/scratch/dir')
    })

    it('returns null when the command fails', async () => {
      const p = provider(async () => null)
      expect(await p.getUsageFromCommand('/some/cwd')).toBeNull()
    })
  })
})
