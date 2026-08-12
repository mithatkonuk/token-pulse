// `claude -p "/usage"` is a real subprocess spawn that hits Anthropic's account-status
// endpoint — worth polling briskly while Claude is actually being used, but wasteful to
// keep firing every few minutes when nothing has touched a Claude session in a while.
export const ACTIVE_INTERVAL_MS = 3 * 60 * 1000
export const IDLE_INTERVAL_MS = 10 * 60 * 1000
export const IDLE_THRESHOLD_MS = 15 * 60 * 1000
// Sitting at (or near) the cap is exactly the moment someone is watching most closely, so the
// ambient active/idle cadence isn't good enough there either — override both with a short cadence
// until usage drops back below the threshold (e.g. the window resets).
export const NEAR_LIMIT_INTERVAL_MS = 30 * 1000
// Opening the panel, or a watched session file actually changing, are direct signals that the
// numbers are being read or the source is being used right now — the scheduled cadence isn't
// good enough there: the bars would otherwise be up to ACTIVE_INTERVAL_MS old, or IDLE_INTERVAL_MS
// old if nobody had touched a session in a while. This floor only exists to stop a burst of
// triggers (repeated tray clicks, a flurry of file writes) from spawning a subprocess each.
export const IMMEDIATE_REFRESH_MIN_INTERVAL_MS = 15 * 1000

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
