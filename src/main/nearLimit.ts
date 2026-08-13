import type { SourceUsage } from '../shared/types'

// Deliberately the "orange" urgency tier (80%), not the "red" one (90%) urgencyColor.ts uses for
// the UI: a burst of heavy usage (e.g. several subagents running in parallel) can swing 10+
// points within one ACTIVE_INTERVAL_MS poll, so waiting for red to switch to the fast cadence
// means the display is already stale by the time it matters. Starting the fast cadence at orange
// gives a 10-point runway to catch up before the number is actually blocking anyone.
export const NEAR_LIMIT_TRIGGER_THRESHOLD_PERCENT = 80

// Only the five_hour window is checked — it's the one that actually blocks you from working
// right now and resets on a human timescale. Weekly/billing-cycle windows can legitimately sit
// at or above this threshold for days at the end of their period, and pinning the poller to a
// 30-second cadence for that long would be exactly the waste the active/idle cadence exists to
// avoid.
export function isNearLimit(
  usage: SourceUsage,
  threshold: number = NEAR_LIMIT_TRIGGER_THRESHOLD_PERCENT
): boolean {
  const fiveHour = usage.windows.find((w) => w.id === 'five_hour')
  return fiveHour !== undefined && fiveHour.percentUsed >= threshold
}
