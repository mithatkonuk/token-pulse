// `claude -p "/usage"` is a real subprocess spawn that hits Anthropic's account-status
// endpoint — worth polling briskly while Claude is actually being used, but wasteful to
// keep firing every few minutes when nothing has touched a Claude session in a while.
export const ACTIVE_INTERVAL_MS = 3 * 60 * 1000
export const IDLE_INTERVAL_MS = 20 * 60 * 1000
export const IDLE_THRESHOLD_MS = 15 * 60 * 1000
// Opening the panel is the one moment the numbers are actually being read, so the scheduled
// cadence isn't good enough there: the bars would otherwise be up to ACTIVE_INTERVAL_MS old —
// or IDLE_INTERVAL_MS old, which is exactly the case where someone has just come back to the
// machine. This floor only exists to stop repeated tray clicks from spawning a subprocess each.
export const OPEN_REFRESH_MIN_INTERVAL_MS = 15 * 1000

export interface UsageCommandScheduleState {
  now: number
  lastActivityAt: number
  lastRefreshAt: number
}

export interface UsageCommandScheduleConfig {
  activeIntervalMs?: number
  idleIntervalMs?: number
  idleThresholdMs?: number
}

export function shouldRefreshUsageCommand(
  { now, lastActivityAt, lastRefreshAt }: UsageCommandScheduleState,
  config: UsageCommandScheduleConfig = {}
): boolean {
  const activeIntervalMs = config.activeIntervalMs ?? ACTIVE_INTERVAL_MS
  const idleIntervalMs = config.idleIntervalMs ?? IDLE_INTERVAL_MS
  const idleThresholdMs = config.idleThresholdMs ?? IDLE_THRESHOLD_MS
  const isIdle = now - lastActivityAt >= idleThresholdMs
  const interval = isIdle ? idleIntervalMs : activeIntervalMs
  return now - lastRefreshAt >= interval
}

export function shouldRefreshOnOpen(
  { now, lastRefreshAt }: { now: number; lastRefreshAt: number },
  minIntervalMs: number = OPEN_REFRESH_MIN_INTERVAL_MS
): boolean {
  return now - lastRefreshAt >= minIntervalMs
}
