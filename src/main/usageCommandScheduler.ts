// `claude -p "/usage"` is a real subprocess spawn that hits Anthropic's account-status
// endpoint — worth polling briskly while Claude is actually being used, but wasteful to
// keep firing every few minutes when nothing has touched a Claude session in a while.
export const ACTIVE_INTERVAL_MS = 3 * 60 * 1000
export const IDLE_INTERVAL_MS = 10 * 60 * 1000
export const IDLE_THRESHOLD_MS = 15 * 60 * 1000
// Sitting at (or near) the cap is exactly the moment someone is watching most closely, so the
// ambient active/idle cadence isn't good enough there either — override both with a short cadence
// until usage drops back below the threshold (e.g. the window resets).
// The usage endpoint is shared by all Claude clients of the account, and it gives 429 when they
// ask too often. Then the CLI prints old cached limits. Thus these cadences stay at 2 minutes.
export const NEAR_LIMIT_INTERVAL_MS = 2 * 60 * 1000
// Floor for each refresh that an event starts: a new reply, a panel click, a wake or a source
// switch. On 2026-11-25 a click 74 seconds after a fetch got 429, and the CLI then stopped for
// 58 minutes. Data that is less than 2 minutes old is current enough for the panel.
export const IMMEDIATE_REFRESH_MIN_INTERVAL_MS = 2 * 60 * 1000

export interface UsageCommandScheduleState {
  now: number
  lastActivityAt: number
  lastRefreshAt: number
}

export interface UsageCommandScheduleConfig {
  activeIntervalMs?: number
  idleIntervalMs?: number
  idleThresholdMs?: number
  nearLimit?: boolean
  nearLimitIntervalMs?: number
}

export function shouldRefreshUsageCommand(
  { now, lastActivityAt, lastRefreshAt }: UsageCommandScheduleState,
  config: UsageCommandScheduleConfig = {}
): boolean {
  const activeIntervalMs = config.activeIntervalMs ?? ACTIVE_INTERVAL_MS
  const idleIntervalMs = config.idleIntervalMs ?? IDLE_INTERVAL_MS
  const idleThresholdMs = config.idleThresholdMs ?? IDLE_THRESHOLD_MS
  const nearLimitIntervalMs = config.nearLimitIntervalMs ?? NEAR_LIMIT_INTERVAL_MS
  if (config.nearLimit) {
    return now - lastRefreshAt >= nearLimitIntervalMs
  }
  const isIdle = now - lastActivityAt >= idleThresholdMs
  const interval = isIdle ? idleIntervalMs : activeIntervalMs
  return now - lastRefreshAt >= interval
}

export function shouldRefreshImmediately(
  { now, lastRefreshAt }: { now: number; lastRefreshAt: number },
  minIntervalMs: number = IMMEDIATE_REFRESH_MIN_INTERVAL_MS
): boolean {
  return now - lastRefreshAt >= minIntervalMs
}

// A source that keeps failing gets an exponentially widening retry interval, which is right for
// the background cadence but wrong for a human who just opened the panel: at the top of the
// backoff that lockout is an hour long, so the bars stay frozen with no way to recover short of
// restarting the app. Clicks get the backoff capped here instead; background triggers keep it.
export const USER_TRIGGERED_MAX_FLOOR_MS = 5 * 60 * 1000

export interface ImmediateRefreshFloorState {
  minIntervalMs: number
  backoffMs: number
  consecutiveFailures: number
  userTriggered: boolean
}

export function computeImmediateRefreshFloorMs({
  minIntervalMs,
  backoffMs,
  consecutiveFailures,
  userTriggered,
}: ImmediateRefreshFloorState): number {
  if (consecutiveFailures <= 0) {
    return minIntervalMs
  }
  const effectiveBackoffMs = userTriggered ? Math.min(backoffMs, USER_TRIGGERED_MAX_FLOOR_MS) : backoffMs
  return Math.max(minIntervalMs, effectiveBackoffMs)
}

// A cache file holds limits from a `/usage` fetch at a known time, so it counts as a refresh at
// that time. Then the usual floors decide when the next subprocess runs. Our own subprocess also
// writes the cache before it exits: that cache is not newer than our refresh, so it does not stop
// the next refresh. Only a fetch by another Claude Code process can do that.
export function lastRefreshAtAfterCache(lastRefreshAt: number, cacheFetchedAt: string | null): number {
  const fetchedAtMs = cacheFetchedAt === null ? NaN : Date.parse(cacheFetchedAt)
  return Number.isFinite(fetchedAtMs) ? Math.max(lastRefreshAt, fetchedAtMs) : lastRefreshAt
}
