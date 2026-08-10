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
