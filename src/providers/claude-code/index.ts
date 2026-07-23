import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { UsageWindow } from '../../shared/types'

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

interface HistorySample {
  t: number
  org?: string
  u: { fh?: number; sd?: number }
}

interface UsageHistoryFile {
  version: number
  samples: HistorySample[]
}

interface StatuslineCache {
  model_display_name?: unknown
}

export interface CachedUsage {
  windows: UsageWindow[]
  currentModel: string | null
  cacheUpdatedAt: string | null
}

export interface ClaudeCodeProviderOptions {
  claudeJsonPath?: string
  historyPath?: string
  statuslineCachePath?: string
}

function defaultHistoryPath(home: string): string {
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'plan-usage-history.json')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Claude', 'plan-usage-history.json')
  }
  return path.join(home, '.config', 'Claude', 'plan-usage-history.json')
}

function findLastResetTime(samples: HistorySample[], key: 'fh' | 'sd'): number | null {
  let lastResetT: number | null = null
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1].u[key]
    const cur = samples[i].u[key]
    if (typeof prev === 'number' && typeof cur === 'number' && cur < prev) {
      lastResetT = samples[i].t
    }
  }
  return lastResetT
}

function buildWindow(
  id: 'five_hour' | 'weekly',
  label: string,
  key: 'fh' | 'sd',
  durationMs: number,
  samples: HistorySample[],
  latest: HistorySample
): UsageWindow | null {
  const percentUsed = latest.u[key]
  if (typeof percentUsed !== 'number') {
    return null
  }
  const resetT = findLastResetTime(samples, key)
  return {
    id,
    label,
    percentUsed,
    resetsAt: resetT !== null ? new Date(resetT + durationMs).toISOString() : null,
  }
}

export class ClaudeCodeProvider {
  private readonly claudeJsonPath: string
  private readonly historyPath: string
  private readonly statuslineCachePath: string

  constructor(options: ClaudeCodeProviderOptions = {}) {
    const home = os.homedir()
    this.claudeJsonPath = options.claudeJsonPath ?? path.join(home, '.claude.json')
    this.historyPath = options.historyPath ?? defaultHistoryPath(home)
    this.statuslineCachePath = options.statuslineCachePath ?? path.join(home, '.claude', 'token-pulse-cache.json')
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

  private getCurrentOrgUuid(): string | null {
    try {
      const raw = fs.readFileSync(this.claudeJsonPath, 'utf-8')
      const parsed = JSON.parse(raw) as { oauthAccount?: { organizationUuid?: string } }
      return parsed.oauthAccount?.organizationUuid ?? null
    } catch {
      return null
    }
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

  getCachedUsage(): CachedUsage | null {
    let file: UsageHistoryFile
    try {
      const parsed = JSON.parse(fs.readFileSync(this.historyPath, 'utf-8'))
      if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.samples)) {
        return null
      }
      file = parsed as UsageHistoryFile
    } catch {
      return null
    }

    const orgUuid = this.getCurrentOrgUuid()
    const samples = orgUuid ? file.samples.filter((s) => !s.org || s.org === orgUuid) : file.samples
    if (samples.length === 0) {
      return null
    }
    const latest = samples[samples.length - 1]
    if (typeof latest.t !== 'number' || typeof latest.u !== 'object' || latest.u === null) {
      return null
    }

    const windows: UsageWindow[] = []
    const fiveHour = buildWindow('five_hour', 'Every 5 hours', 'fh', FIVE_HOURS_MS, samples, latest)
    if (fiveHour) {
      windows.push(fiveHour)
    }
    const weekly = buildWindow('weekly', 'Weekly', 'sd', SEVEN_DAYS_MS, samples, latest)
    if (weekly) {
      windows.push(weekly)
    }

    return {
      windows,
      currentModel: this.getModelFromStatuslineCache(),
      cacheUpdatedAt: new Date(latest.t).toISOString(),
    }
  }
}
