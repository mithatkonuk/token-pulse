import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { computeWindow } from './windowCalc'
import { readTurnsSince, readLatestModel } from './usageDb'
import { getLimitsForTier, type PlanLimitsConfig } from './planLimits'
import type { UsageWindow } from '../../shared/types'

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const WINDOW_DEFS: Record<'five_hour' | 'weekly', { label: string; durationMs: number }> = {
  five_hour: { label: 'Every 5 hours', durationMs: FIVE_HOURS_MS },
  weekly: { label: 'Weekly', durationMs: SEVEN_DAYS_MS },
}

export interface ClaudeCodeProviderOptions {
  claudeJsonPath?: string
  usageDbPath?: string
  planLimitsConfig: PlanLimitsConfig
}

export class ClaudeCodeProvider {
  private readonly claudeJsonPath: string
  private readonly usageDbPath: string
  private readonly planLimitsConfig: PlanLimitsConfig

  constructor(options: ClaudeCodeProviderOptions) {
    this.claudeJsonPath = options.claudeJsonPath ?? path.join(os.homedir(), '.claude.json')
    this.usageDbPath = options.usageDbPath ?? path.join(os.homedir(), '.claude', 'usage.db')
    this.planLimitsConfig = options.planLimitsConfig
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

  getCurrentModel(): string | null {
    try {
      return readLatestModel(this.usageDbPath)
    } catch {
      return null
    }
  }

  getWindow(id: 'five_hour' | 'weekly', now: Date = new Date()): UsageWindow {
    const def = WINDOW_DEFS[id]
    const limits = getLimitsForTier(this.planLimitsConfig, this.getPlanTier())
    let turns: ReturnType<typeof readTurnsSince> = []
    try {
      const since = new Date(now.getTime() - def.durationMs).toISOString()
      turns = readTurnsSince(this.usageDbPath, since)
    } catch {
      turns = []
    }
    const { usedTokens, resetsAt } = computeWindow(turns, def.durationMs, now)
    const limitTokens = id === 'five_hour' ? limits.five_hour : limits.weekly
    return {
      id,
      label: def.label,
      usedTokens,
      limitTokens,
      percentUsed: limitTokens > 0 ? (usedTokens / limitTokens) * 100 : 0,
      resetsAt: resetsAt.toISOString(),
    }
  }
}
