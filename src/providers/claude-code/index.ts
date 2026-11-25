import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ContextWindow } from '../../shared/types'
import type { CachedLimits, CachedUsage, CommandUsageResult, UsageProvider } from '../types'
import { readClaudeJsonLimits, readStatuslineLimits, readUsageCacheTime } from './cachedLimits'
import { getContextWindowSizeForModel } from './modelContextWindows'
import { findNewestTranscript, formatModelDisplayName, readLastModelId, readLastUsage } from './transcript'
import { parseUsageOutput, runUsageCommand, isClaudeCliAvailable } from './usageCommand'
import { ReplyScanner } from './replyScanner'

// Claude Desktop sends its own login to its sessions, not the `~/.claude.json` login that this
// provider reports. Its replies are in the same projects folder, so they are skipped here.
const DESKTOP_ENTRYPOINT = 'claude-desktop'

interface StatuslineCache {
  model_display_name?: unknown
  context_window?: {
    used_percentage?: unknown
    total_input_tokens?: unknown
    context_window_size?: unknown
  }
}

export interface ClaudeCodeProviderOptions {
  claudeJsonPath?: string
  statuslineCachePath?: string
  projectsDir?: string
  runUsageCommandFn?: (cwd: string) => Promise<string | null>
  isAvailableFn?: () => boolean
  hasLocalDataFn?: () => boolean
  nowFn?: () => number
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown
  } catch {
    return null
  }
}

export class ClaudeCodeProvider implements UsageProvider {
  private readonly claudeJsonPath: string
  private readonly statuslineCachePath: string
  private readonly projectsDir: string
  private readonly runUsageCommandFn: (cwd: string) => Promise<string | null>
  private readonly isAvailableFn: () => boolean
  private readonly hasLocalDataFn: () => boolean
  private readonly nowFn: () => number
  private readonly replyScanner: ReplyScanner

  constructor(options: ClaudeCodeProviderOptions = {}) {
    const home = os.homedir()
    this.claudeJsonPath = options.claudeJsonPath ?? path.join(home, '.claude.json')
    this.statuslineCachePath = options.statuslineCachePath ?? path.join(home, '.claude', 'token-pulse-cache.json')
    this.projectsDir = options.projectsDir ?? path.join(home, '.claude', 'projects')
    this.runUsageCommandFn = options.runUsageCommandFn ?? runUsageCommand
    this.isAvailableFn = options.isAvailableFn ?? isClaudeCliAvailable
    this.hasLocalDataFn =
      options.hasLocalDataFn ?? (() => fs.existsSync(this.claudeJsonPath) || fs.existsSync(this.projectsDir))
    this.nowFn = options.nowFn ?? Date.now
    this.replyScanner = new ReplyScanner(this.projectsDir, (entrypoint) => entrypoint !== DESKTOP_ENTRYPOINT)
  }

  isAvailable(): boolean {
    return this.isAvailableFn() || this.hasLocalDataFn()
  }

  getWatchedPaths(): string[] {
    return [this.statuslineCachePath, this.claudeJsonPath, this.projectsDir]
  }

  primeActivity(): void {
    this.replyScanner.prime()
  }

  readActivity(changedPath: string): number | null {
    const relative = path.relative(this.projectsDir, changedPath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return null
    }
    return this.replyScanner.readFile(changedPath)
  }

  getPlanTier(): string | null {
    try {
      const raw = fs.readFileSync(this.claudeJsonPath, 'utf-8')
      const parsed = JSON.parse(raw) as { oauthAccount?: { organizationType?: string } }
      return parsed.oauthAccount?.organizationType ?? null
    } catch {
      return null
    }
  }

  getAccountEmail(): string | null {
    try {
      const raw = fs.readFileSync(this.claudeJsonPath, 'utf-8')
      const parsed = JSON.parse(raw) as { oauthAccount?: { emailAddress?: unknown } }
      const email = parsed.oauthAccount?.emailAddress
      return typeof email === 'string' && email !== '' ? email : null
    } catch {
      return null
    }
  }

  // Session transcripts are written by both the CLI and the desktop app, so they track the
  // model the user actually picked. The statusline cache only updates while the CLI renders
  // its statusline, which never happens in the desktop app — hence the fallback ordering.
  private getModelFromTranscript(): string | null {
    const transcript = findNewestTranscript(this.projectsDir)
    if (transcript === null) {
      return null
    }
    const modelId = readLastModelId(transcript)
    return modelId !== null ? formatModelDisplayName(modelId) : null
  }

  private getModelFromStatuslineCache(): string | null {
    try {
      const raw = fs.readFileSync(this.statuslineCachePath, 'utf-8')
      const parsed = JSON.parse(raw) as StatuslineCache
      return typeof parsed.model_display_name === 'string' ? parsed.model_display_name : null
    } catch {
      return null
    }
  }

  private getContextWindowFromStatuslineCache(): ContextWindow | null {
    try {
      const raw = fs.readFileSync(this.statuslineCachePath, 'utf-8')
      const parsed = JSON.parse(raw) as StatuslineCache
      const ctx = parsed.context_window
      if (
        typeof ctx?.used_percentage !== 'number' ||
        typeof ctx?.total_input_tokens !== 'number' ||
        typeof ctx?.context_window_size !== 'number'
      ) {
        return null
      }
      return {
        usedPercentage: ctx.used_percentage,
        totalInputTokens: ctx.total_input_tokens,
        contextWindowSize: ctx.context_window_size,
      }
    } catch {
      return null
    }
  }

  private getContextWindowSizeFromStatuslineCache(): number | null {
    try {
      const raw = fs.readFileSync(this.statuslineCachePath, 'utf-8')
      const parsed = JSON.parse(raw) as StatuslineCache
      const size = parsed.context_window?.context_window_size
      return typeof size === 'number' ? size : null
    } catch {
      return null
    }
  }

  // Token counts from the transcript are always fresh (Desktop writes it too). For
  // context_window_size, the transcript's own model id — looked up in the static table Claude's
  // own numbers were sourced from — is more trustworthy than the statusline cache (which could
  // be for a model the user has since switched away from), so it takes priority; the cache is
  // only consulted when the transcript doesn't name a model at all.
  private getContextWindowFromTranscript(): ContextWindow | null {
    const transcript = findNewestTranscript(this.projectsDir)
    if (transcript === null) {
      return null
    }
    const usage = readLastUsage(transcript)
    if (usage === null) {
      return null
    }
    const totalInputTokens = usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens
    const modelId = readLastModelId(transcript)
    const contextWindowSize =
      modelId !== null
        ? getContextWindowSizeForModel(modelId)
        : (this.getContextWindowSizeFromStatuslineCache() ?? getContextWindowSizeForModel(null))
    return {
      totalInputTokens,
      contextWindowSize,
      usedPercentage: contextWindowSize > 0 ? (totalInputTokens / contextWindowSize) * 100 : 0,
    }
  }

  // The newer cache wins. The statusline cache is written by an interactive terminal session only,
  // so it is often older than the cache in claude.json.
  private getLimitsFromCaches(): CachedLimits | null {
    const now = this.nowFn()
    const statusline = readStatuslineLimits(readJsonFile(this.statuslineCachePath), now)
    const claudeJson = readClaudeJsonLimits(readJsonFile(this.claudeJsonPath), now)
    if (statusline === null || claudeJson === null) {
      return statusline ?? claudeJson
    }
    return Date.parse(claudeJson.fetchedAt) > Date.parse(statusline.fetchedAt) ? claudeJson : statusline
  }

  getCachedUsage(): CachedUsage {
    return {
      currentModel: this.getModelFromTranscript() ?? this.getModelFromStatuslineCache(),
      contextWindow: this.getContextWindowFromTranscript() ?? this.getContextWindowFromStatuslineCache(),
      limits: this.getLimitsFromCaches(),
    }
  }

  // When the usage endpoint gives an error (for example 429), `/usage` prints the cached limits of
  // the CLI and does not update the cache. Thus, a cache that is older than this call shows that
  // the output is old. A null result makes the caller use its failure backoff.
  private isStaleOutput(startedAt: number): boolean {
    const fetchedAtMs = readUsageCacheTime(readJsonFile(this.claudeJsonPath))
    return fetchedAtMs !== null && fetchedAtMs < startedAt
  }

  async getUsageFromCommand(cwd: string): Promise<CommandUsageResult | null> {
    const startedAt = this.nowFn()
    const stdout = await this.runUsageCommandFn(cwd)
    if (stdout === null || this.isStaleOutput(startedAt)) {
      return null
    }
    const parsed = parseUsageOutput(stdout)

    const windows: CommandUsageResult['windows'] = []
    if (parsed.fiveHour) {
      windows.push({ id: 'five_hour', label: 'Every 5 hours', percentUsed: parsed.fiveHour.percentUsed, resetsText: parsed.fiveHour.resetsText })
    } else if (parsed.weekly) {
      // `/usage` only prints a "Current session" line while a 5-hour window is actually open.
      // Once the last window fully elapses with no new usage, that line disappears entirely — the
      // weekly line still parsing confirms this is a real, well-formed response and not a CLI
      // error/garbage output, so it's safe to report an explicit 0%/no-active-session window
      // rather than silently keeping whatever percentage the last real window left behind.
      windows.push({ id: 'five_hour', label: 'Every 5 hours', percentUsed: 0, resetsText: null })
    }
    if (parsed.weekly) {
      windows.push({ id: 'weekly', label: 'Weekly', percentUsed: parsed.weekly.percentUsed, resetsText: parsed.weekly.resetsText })
    }

    return {
      windows,
      contributing: { last24h: parsed.last24h, last7d: parsed.last7d },
      cost: null,
      recentActivity: null,
      fetchedAt: new Date().toISOString(),
    }
  }
}
