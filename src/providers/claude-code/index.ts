import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { UsageWindow } from '../../shared/types'

interface StatuslineRateLimit {
  used_percentage: number
  resets_at: number
}

interface StatuslineCache {
  five_hour: StatuslineRateLimit | null
  seven_day: StatuslineRateLimit | null
  model_display_name: string | null
  updated_at: string
}

export interface CachedUsage {
  windows: UsageWindow[]
  currentModel: string | null
  cacheUpdatedAt: string | null
}

export interface ClaudeCodeProviderOptions {
  claudeJsonPath?: string
  cachePath?: string
}

function isValidRateLimit(value: unknown): value is StatuslineRateLimit {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StatuslineRateLimit).used_percentage === 'number' &&
    typeof (value as StatuslineRateLimit).resets_at === 'number'
  )
}

function toUsageWindow(id: 'five_hour' | 'weekly', label: string, rateLimit: StatuslineRateLimit): UsageWindow {
  return {
    id,
    label,
    percentUsed: rateLimit.used_percentage,
    resetsAt: new Date(rateLimit.resets_at * 1000).toISOString(),
  }
}

export class ClaudeCodeProvider {
  private readonly claudeJsonPath: string
  private readonly cachePath: string

  constructor(options: ClaudeCodeProviderOptions = {}) {
    this.claudeJsonPath = options.claudeJsonPath ?? path.join(os.homedir(), '.claude.json')
    this.cachePath = options.cachePath ?? path.join(os.homedir(), '.claude', 'token-pulse-cache.json')
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

  getCachedUsage(): CachedUsage | null {
    let cache: StatuslineCache
    try {
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'))
      if (typeof parsed !== 'object' || parsed === null) {
        return null
      }
      cache = parsed as StatuslineCache
    } catch {
      return null
    }
    const windows: UsageWindow[] = []
    if (isValidRateLimit(cache.five_hour)) {
      windows.push(toUsageWindow('five_hour', 'Every 5 hours', cache.five_hour))
    }
    if (isValidRateLimit(cache.seven_day)) {
      windows.push(toUsageWindow('weekly', 'Weekly', cache.seven_day))
    }
    return {
      windows,
      currentModel: cache.model_display_name ?? null,
      cacheUpdatedAt: typeof cache.updated_at === 'string' ? cache.updated_at : null,
    }
  }
}
