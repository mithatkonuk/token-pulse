export function formatCountdown(resetsAtIso: string, now: Date = new Date()): string {
  const diffMs = new Date(resetsAtIso).getTime() - now.getTime()
  if (diffMs <= 0) {
    return 'resets now'
  }
  const totalMinutes = Math.round(diffMs / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  if (days >= 1) {
    return `resets in ${days}d`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours >= 1) {
    return `resets in ${hours}h ${minutes}m`
  }
  return `resets in ${minutes}m`
}
