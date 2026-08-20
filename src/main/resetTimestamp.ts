const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// The CLI's "resets" text (e.g. "Aug 10 at 8:39pm (Europe/Berlin)") always reports the wall-clock
// time in the machine's own timezone — the parenthesized zone name is informational, not something
// we need to convert — so building the Date from local components is correct without any TZ math.
export function parseResetTimestamp(resetsText: string | null, now: Date = new Date()): Date | null {
  if (resetsText === null) {
    return null
  }
  const match = resetsText.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!match) {
    return null
  }
  const monthIndex = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase())
  if (monthIndex === -1) {
    return null
  }
  const day = Number(match[2])
  let hour = Number(match[3]) % 12
  if (match[5].toLowerCase() === 'pm') {
    hour += 12
  }
  const minute = match[4] ? Number(match[4]) : 0

  const target = new Date(now.getFullYear(), monthIndex, day, hour, minute, 0, 0)
  // Reset times are always in the near future; a target that lands in the past only happens
  // when the text names a date that has already rolled into next year (e.g. parsed on Dec 31).
  if (target.getTime() <= now.getTime()) {
    target.setFullYear(target.getFullYear() + 1)
  }
  return target
}

// Small margin past the CLI-reported reset instant so the scheduled refresh doesn't land a few
// hundred ms early and still read the pre-reset window.
export const RESET_REFRESH_BUFFER_MS = 5 * 1000

// A five_hour window's real reset is always within a bit over 5h of "now" once a poll has ever
// seen it. parseResetTimestamp's next-year rollover exists for a genuine late-December wraparound,
// but the exact same code path also fires when a refresh lands a few seconds after the clock target
// while Anthropic's backend hasn't rolled the window over yet: the CLI just repeats the same
// (now-just-barely-past) reset text, and rolling that a full year forward silently parks the next
// attempt for 365 days instead of retrying once the reset actually lands. Any computed delay this
// far beyond a realistic 5h window can only be that stale-race case for this specific caller, so
// retry soon instead of trusting the year-out target.
export const RESET_TARGET_SANITY_MS = 6 * 60 * 60 * 1000
export const STALE_RESET_RETRY_MS = 30 * 1000

export function computeResetRefreshDelayMs(resetsText: string | null, now: Date = new Date()): number | null {
  const target = parseResetTimestamp(resetsText, now)
  if (!target) {
    return null
  }
  const delayMs = target.getTime() - now.getTime() + RESET_REFRESH_BUFFER_MS
  if (delayMs > RESET_TARGET_SANITY_MS) {
    return STALE_RESET_RETRY_MS
  }
  return delayMs > 0 ? delayMs : null
}
