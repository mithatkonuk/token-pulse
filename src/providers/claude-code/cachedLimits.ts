import type { UsageWindow } from '../../shared/types'
import type { CachedLimits } from '../types'

// Claude Code writes the usage limits to disk in two places. Token-pulse reads them, because a file
// read is fast and costs no subprocess. A cache older than this maximum age is used only while its
// 5-hour window is open. Then, when the endpoint gives 429 after a restart, the tray shows the last
// known value, marked as old, and not a false 0%.
export const CACHED_LIMITS_MAX_AGE_MS = 5 * 60 * 1000

interface LimitValue {
  percentUsed: number
  resetsAt: Date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFresh(fetchedAtMs: number, now: number): boolean {
  return now - fetchedAtMs <= CACHED_LIMITS_MAX_AGE_MS
}

// The `/usage` command writes the reset time as "Nov 23 at 6pm (Europe/Berlin)", in the local zone
// of the machine. This function writes the same text, so that the panel shows one format and
// parseResetTimestamp can read the text back for the reset-boundary refresh.
export function formatResetsText(resetsAt: Date, timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  // `/usage` removes the seconds: it shows 16:59:59.75 as 5:59pm. Do the same, so that both paths
  // show the same text.
  const rounded = new Date(Math.floor(resetsAt.getTime() / 60_000) * 60_000)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(rounded)
      .map((part) => [part.type, part.value])
  )
  const minutes = parts.minute === '00' ? '' : `:${parts.minute}`
  return `${parts.month} ${parts.day} at ${parts.hour}${minutes}${parts.dayPeriod.toLowerCase()} (${timeZone})`
}

// The 0% window without a reset time follows the rule of the `/usage` path: when the weekly window
// is present but the 5-hour window is not, no 5-hour window is open.
function toWindows(fiveHour: LimitValue | null, weekly: LimitValue | null, timeZone?: string): UsageWindow[] | null {
  if (fiveHour === null && weekly === null) {
    return null
  }
  const windows: UsageWindow[] = [
    fiveHour === null
      ? { id: 'five_hour', label: 'Every 5 hours', percentUsed: 0, resetsText: null }
      : {
          id: 'five_hour',
          label: 'Every 5 hours',
          percentUsed: Math.round(fiveHour.percentUsed),
          resetsText: formatResetsText(fiveHour.resetsAt, timeZone),
        },
  ]
  if (weekly !== null) {
    windows.push({
      id: 'weekly',
      label: 'Weekly',
      percentUsed: Math.round(weekly.percentUsed),
      resetsText: formatResetsText(weekly.resetsAt, timeZone),
    })
  }
  return windows
}

// Returns null for a missing window, and undefined for a window with an unknown shape. Undefined
// tells the caller that the format changed, so that it does not show a wrong 0%.
function readLimitValue(
  value: unknown,
  percentKey: string,
  toResetsAt: (raw: unknown) => Date | null
): LimitValue | null | undefined {
  if (value === null || value === undefined) {
    return null
  }
  if (!isRecord(value) || typeof value[percentKey] !== 'number') {
    return undefined
  }
  const resetsAt = toResetsAt(value.resets_at)
  return resetsAt === null ? undefined : { percentUsed: value[percentKey], resetsAt }
}

function unixSecondsToDate(raw: unknown): Date | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? new Date(raw * 1000) : null
}

function isoToDate(raw: unknown): Date | null {
  const ms = typeof raw === 'string' ? Date.parse(raw) : NaN
  return Number.isNaN(ms) ? null : new Date(ms)
}

function buildLimits(
  fiveHour: LimitValue | null | undefined,
  weekly: LimitValue | null | undefined,
  fetchedAtMs: number,
  now: number,
  timeZone?: string
): CachedLimits | null {
  if (fiveHour === undefined || weekly === undefined || !Number.isFinite(fetchedAtMs)) {
    return null
  }
  const windowOpen = fiveHour !== null && fiveHour.resetsAt.getTime() > now
  if (!isFresh(fetchedAtMs, now) && !windowOpen) {
    return null
  }
  const windows = toWindows(fiveHour, weekly, timeZone)
  return windows === null ? null : { windows, fetchedAt: new Date(fetchedAtMs).toISOString() }
}

// Reads the copy that the personal statusline script writes to `~/.claude/token-pulse-cache.json`.
// The script copies the `rate_limits` field of the documented statusline input. Only an
// interactive terminal session runs the statusline, so this file is often old.
export function readStatuslineLimits(parsed: unknown, now: number, timeZone?: string): CachedLimits | null {
  if (!isRecord(parsed)) {
    return null
  }
  const fetchedAtMs = typeof parsed.updated_at === 'string' ? Date.parse(parsed.updated_at) : NaN
  return buildLimits(
    readLimitValue(parsed.five_hour, 'used_percentage', unixSecondsToDate),
    readLimitValue(parsed.seven_day, 'used_percentage', unixSecondsToDate),
    fetchedAtMs,
    now,
    timeZone
  )
}

// Reads `cachedUsageUtilization` from `~/.claude.json`. Claude Code writes it each time it gets
// the usage, but this field is not documented, and a new release can change or remove it. The
// cache keeps the last account that got the usage, so a cache from a different account is not
// used: it shows the limits of the wrong person.
export function readClaudeJsonLimits(parsed: unknown, now: number, timeZone?: string): CachedLimits | null {
  if (!isRecord(parsed) || !isRecord(parsed.oauthAccount) || !isRecord(parsed.cachedUsageUtilization)) {
    return null
  }
  const cache = parsed.cachedUsageUtilization
  const signedInAccount = parsed.oauthAccount.accountUuid
  if (typeof signedInAccount !== 'string' || cache.accountUuid !== signedInAccount) {
    return null
  }
  const fetchedAtMs = typeof cache.fetchedAtMs === 'number' ? cache.fetchedAtMs : NaN
  if (!isRecord(cache.utilization)) {
    return null
  }
  return buildLimits(
    readLimitValue(cache.utilization.five_hour, 'utilization', isoToDate),
    readLimitValue(cache.utilization.seven_day, 'utilization', isoToDate),
    fetchedAtMs,
    now,
    timeZone
  )
}

// Returns the time of the last successful usage fetch of the signed-in account, or null when
// claude.json does not tell it.
export function readUsageCacheTime(parsed: unknown): number | null {
  if (!isRecord(parsed) || !isRecord(parsed.oauthAccount) || !isRecord(parsed.cachedUsageUtilization)) {
    return null
  }
  const cache = parsed.cachedUsageUtilization
  if (cache.accountUuid !== parsed.oauthAccount.accountUuid || typeof cache.fetchedAtMs !== 'number') {
    return null
  }
  return Number.isFinite(cache.fetchedAtMs) ? cache.fetchedAtMs : null
}
