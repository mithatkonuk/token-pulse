import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ContextWindow } from '../../shared/types'
import type { CachedUsage, CommandUsageResult, UsageProvider } from '../types'
import { findNewestTranscript, formatModelDisplayName, readLastModelId } from './transcript'
import { parseUsageOutput, runUsageCommand } from './usageCommand'

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
}

export class ClaudeCodeProvider implements UsageProvider {
  private readonly claudeJsonPath: string
  private readonly statuslineCachePath: string
  private readonly projectsDir: string
  private readonly runUsageCommandFn: (cwd: string) => Promise<string | null>

  constructor(options: ClaudeCodeProviderOptions = {}) {
    const home = os.homedir()
    this.claudeJsonPath = options.claudeJsonPath ?? path.join(home, '.claude.json')
    this.statuslineCachePath = options.statuslineCachePath ?? path.join(home, '.claude', 'token-pulse-cache.json')
    this.projectsDir = options.projectsDir ?? path.join(home, '.claude', 'projects')
    this.runUsageCommandFn = options.runUsageCommandFn ?? ((cwd) => runUsageCommand(cwd, this.projectsDir))
  }

  getWatchedPaths(): string[] {
    return [this.statuslineCachePath, this.claudeJsonPath, this.projectsDir]
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

  getCachedUsage(): CachedUsage {
    return {
      currentModel: this.getModelFromTranscript() ?? this.getModelFromStatuslineCache(),
      contextWindow: this.getContextWindowFromStatuslineCache(),
    }
  }

  async getUsageFromCommand(cwd: string): Promise<CommandUsageResult | null> {
    const stdout = await this.runUsageCommandFn(cwd)
    if (stdout === null) {
      return null
    }
    const parsed = parseUsageOutput(stdout)

    const windows: CommandUsageResult['windows'] = []
    if (parsed.fiveHour) {
      windows.push({ id: 'five_hour', label: 'Every 5 hours', percentUsed: parsed.fiveHour.percentUsed, resetsText: parsed.fiveHour.resetsText })
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
