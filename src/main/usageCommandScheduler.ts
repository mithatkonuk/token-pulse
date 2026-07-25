// `claude -p "/usage"` is a real subprocess spawn that hits Anthropic's account-status
// endpoint — worth polling briskly while Claude is actually being used, but wasteful to
// keep firing every few minutes when nothing has touched a Claude session in a while.
export const ACTIVE_INTERVAL_MS = 3 * 60 * 1000
export const IDLE_INTERVAL_MS = 20 * 60 * 1000
export const IDLE_THRESHOLD_MS = 15 * 60 * 1000

export interface UsageCommandScheduleState {
  now: number
  lastActivityAt: number
  lastRefreshAt: number
}

export function shouldRefreshUsageCommand({ now, lastActivityAt, lastRefreshAt }: UsageCommandScheduleState): boolean {
  const isIdle = now - lastActivityAt >= IDLE_THRESHOLD_MS
  const interval = isIdle ? IDLE_INTERVAL_MS : ACTIVE_INTERVAL_MS
  return now - lastRefreshAt >= interval
}
