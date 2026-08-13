import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseUsageOutput, runUsageCommand, resolveExecutableOnPath, isClaudeCliAvailable } from '../src/providers/claude-code/usageCommand'

const FULL_OUTPUT = `You are currently using your subscription to power your Claude Code usage

Current session: 4% used · resets Jul 26 at 4:30am (Europe/Berlin)
Current week (all models): 78% used · resets Jul 26 at 10am (Europe/Berlin)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices or claude.ai. Behaviors are independent characteristics, not a breakdown.

Last 24h · 342 requests · 2 sessions
  91% of your usage was at >150k context

Last 7d · 3990 requests · 9 sessions
  98% of your usage came from subagent-heavy sessions
  98% of your usage came from sessions active for 8+ hours
  79% of your usage was at >150k context
  Top skills: /superpowers:using-git-worktrees 3%, /superpowers:subagent-driven-development 1%, /superpowers:writing-plans 1%
  Top subagents: superpowers:using-git-worktrees 2%, testter 2%, general-purpose 1%, code-reviewer 1%, superpowers:subagent-driven-development 1%
  Top plugins: superpowers 8%
  Top MCP servers: postgres 3%
`

describe('parseUsageOutput', () => {
  it('parses the five-hour and weekly windows', () => {
    const result = parseUsageOutput(FULL_OUTPUT)
    expect(result.fiveHour).toEqual({ percentUsed: 4, resetsText: 'Jul 26 at 4:30am (Europe/Berlin)' })
    expect(result.weekly).toEqual({ percentUsed: 78, resetsText: 'Jul 26 at 10am (Europe/Berlin)' })
  })

  it('parses request/session counts and the above-150k-context percentage for both ranges', () => {
    const result = parseUsageOutput(FULL_OUTPUT)
    expect(result.last24h).toMatchObject({ requests: 342, sessions: 2, aboveContextPercent: 91 })
    expect(result.last7d).toMatchObject({ requests: 3990, sessions: 9, aboveContextPercent: 79 })
  })

  it('parses top skills/subagents/plugins/MCP servers into name+percent entries', () => {
    const result = parseUsageOutput(FULL_OUTPUT)
    expect(result.last7d!.topSkills).toEqual([
      { name: '/superpowers:using-git-worktrees', percent: 3 },
      { name: '/superpowers:subagent-driven-development', percent: 1 },
      { name: '/superpowers:writing-plans', percent: 1 },
    ])
    expect(result.last7d!.topSubagents).toEqual([
      { name: 'superpowers:using-git-worktrees', percent: 2 },
      { name: 'testter', percent: 2 },
      { name: 'general-purpose', percent: 1 },
      { name: 'code-reviewer', percent: 1 },
      { name: 'superpowers:subagent-driven-development', percent: 1 },
    ])
    expect(result.last7d!.topPlugins).toEqual([{ name: 'superpowers', percent: 8 }])
    expect(result.last7d!.topMcpServers).toEqual([{ name: 'postgres', percent: 3 }])
  })

  it('returns an empty top list for a category with no matching line', () => {
    const result = parseUsageOutput(FULL_OUTPUT)
    expect(result.last24h!.topSkills).toEqual([])
    expect(result.last24h!.topSubagents).toEqual([])
    expect(result.last24h!.topPlugins).toEqual([])
    expect(result.last24h!.topMcpServers).toEqual([])
  })

  it('returns null windows and contributing blocks when the text has none of the expected lines', () => {
    const result = parseUsageOutput('Something unrelated happened.')
    expect(result.fiveHour).toBeNull()
    expect(result.weekly).toBeNull()
    expect(result.last24h).toBeNull()
    expect(result.last7d).toBeNull()
  })

  it('handles a last-24h block with only some of the four top-list categories present', () => {
    const partial = `Current session: 6% used · resets Jul 26 at 4:29am (Europe/Berlin)
Current week (all models): 79% used · resets Jul 26 at 9:59am (Europe/Berlin)

Last 24h · 353 requests · 2 sessions
  90% of your usage was at >150k context
  Top skills: /superpowers:brainstorming 1%
  Top plugins: superpowers 1%
`
    const result = parseUsageOutput(partial)
    expect(result.last24h).toMatchObject({ requests: 353, sessions: 2, aboveContextPercent: 90 })
    expect(result.last24h!.topSkills).toEqual([{ name: '/superpowers:brainstorming', percent: 1 }])
    expect(result.last24h!.topPlugins).toEqual([{ name: 'superpowers', percent: 1 }])
    expect(result.last24h!.topSubagents).toEqual([])
    expect(result.last24h!.topMcpServers).toEqual([])
  })
})

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

describe('runUsageCommand', () => {
  let projectsDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-usage-command-test-'))
  })

  afterEach(() => {
    fs.rmSync(projectsDir, { recursive: true, force: true })
  })

  it('resolves with stdout on success, passing a pinned --session-id', async () => {
    const { execFile } = await import('node:child_process')
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: object, cb: (error: Error | null, stdout: string) => void) => {
      cb(null, 'usage output')
      return {} as ReturnType<typeof execFile>
    }) as typeof execFile)

    const result = await runUsageCommand('/tmp', projectsDir)
    expect(result).toBe('usage output')
    expect(execFile).toHaveBeenCalledWith(
      'claude',
      ['-p', '/usage', '--session-id', expect.any(String), '--mcp-config', '{"mcpServers":{}}', '--strict-mcp-config'],
      expect.objectContaining({ cwd: '/tmp' }),
      expect.any(Function)
    )
  })

  it('augments PATH with common install locations, since a packaged app is launched without the shell PATH', async () => {
    const { execFile } = await import('node:child_process')
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: object, cb: (error: Error | null, stdout: string) => void) => {
      cb(null, 'usage output')
      return {} as ReturnType<typeof execFile>
    }) as typeof execFile)

    await runUsageCommand('/tmp', projectsDir)
    const callOpts = vi.mocked(execFile).mock.calls[0][2] as { env: Record<string, string | undefined> }
    expect(callOpts.env.PATH).toContain('/opt/homebrew/bin')
    expect(callOpts.env.PATH).toContain('/usr/local/bin')
  })

  it('resolves with null when the command fails', async () => {
    const { execFile } = await import('node:child_process')
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: object, cb: (error: Error | null, stdout: string) => void) => {
      cb(new Error('boom'), '')
      return {} as ReturnType<typeof execFile>
    }) as typeof execFile)

    const result = await runUsageCommand('/tmp', projectsDir)
    expect(result).toBeNull()
  })

  it('deletes the session transcript file it created after reading the output', async () => {
    const projectSubdir = path.join(projectsDir, 'some-project')
    fs.mkdirSync(projectSubdir)
    const { execFile } = await import('node:child_process')
    vi.mocked(execFile).mockImplementation(((_cmd: string, args: string[], _opts: object, cb: (error: Error | null, stdout: string) => void) => {
      const sessionId = args[args.indexOf('--session-id') + 1]
      fs.writeFileSync(path.join(projectSubdir, `${sessionId}.jsonl`), '{}')
      cb(null, 'usage output')
      return {} as ReturnType<typeof execFile>
    }) as typeof execFile)

    await runUsageCommand('/tmp', projectsDir)
    expect(fs.readdirSync(projectSubdir)).toEqual([])
  })

  it('does not throw when the transcript file was never created (e.g. the command errored before writing)', async () => {
    const { execFile } = await import('node:child_process')
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: object, cb: (error: Error | null, stdout: string) => void) => {
      cb(new Error('boom'), '')
      return {} as ReturnType<typeof execFile>
    }) as typeof execFile)

    await expect(runUsageCommand('/tmp', projectsDir)).resolves.toBeNull()
  })
})

describe('resolveExecutableOnPath', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-path-test-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('finds an executable file in one of the path directories', () => {
    const binPath = path.join(dir, 'claude')
    fs.writeFileSync(binPath, '#!/bin/sh\n')
    fs.chmodSync(binPath, 0o755)
    const pathString = ['/definitely-not-a-real-dir', dir].join(path.delimiter)
    expect(resolveExecutableOnPath('claude', pathString)).toBe(binPath)
  })

  it('returns null when the executable is not found in any directory', () => {
    const pathString = ['/definitely-not-a-real-dir', dir].join(path.delimiter)
    expect(resolveExecutableOnPath('claude', pathString)).toBeNull()
  })

  it('returns null when a matching file exists but is not executable', () => {
    const binPath = path.join(dir, 'claude')
    fs.writeFileSync(binPath, '#!/bin/sh\n')
    fs.chmodSync(binPath, 0o644)
    expect(resolveExecutableOnPath('claude', dir)).toBeNull()
  })

  it('skips empty PATH segments', () => {
    const binPath = path.join(dir, 'claude')
    fs.writeFileSync(binPath, '#!/bin/sh\n')
    fs.chmodSync(binPath, 0o755)
    const pathString = ['', dir, ''].join(path.delimiter)
    expect(resolveExecutableOnPath('claude', pathString)).toBe(binPath)
  })
})

describe('isClaudeCliAvailable', () => {
  const originalPath = process.env.PATH

  afterEach(() => {
    process.env.PATH = originalPath
  })

  it('returns true when claude is found on PATH', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-claude-cli-test-'))
    const binPath = path.join(dir, 'claude')
    fs.writeFileSync(binPath, '#!/bin/sh\n')
    fs.chmodSync(binPath, 0o755)
    process.env.PATH = dir
    expect(isClaudeCliAvailable()).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns false when claude is not found anywhere on PATH', () => {
    process.env.PATH = '/definitely-not-a-real-dir'
    expect(isClaudeCliAvailable()).toBe(false)
  })
})
