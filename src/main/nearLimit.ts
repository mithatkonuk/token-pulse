import { RED_URGENCY_THRESHOLD_PERCENT } from '../shared/urgencyColor'
import type { SourceUsage } from '../shared/types'

// Only the five_hour window is checked — it's the one that actually blocks you from working
// right now and resets on a human timescale. Weekly/billing-cycle windows can legitimately sit
// at or above this threshold for days at the end of their period, and pinning the poller to a
// 30-second cadence for that long would be exactly the waste the active/idle cadence exists to
// avoid.
export function isNearLimit(
  usage: SourceUsage,
  threshold: number = RED_URGENCY_THRESHOLD_PERCENT
): boolean {
  const fiveHour = usage.windows.find((w) => w.id === 'five_hour')
  return fiveHour !== undefined && fiveHour.percentUsed >= threshold
}
