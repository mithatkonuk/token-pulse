export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`
  }
  return `${Math.round(n)}`
}

export function formatPlanTier(planTier: string | null): string {
  if (!planTier) {
    return 'plan unknown'
  }
  const stripped = planTier.replace(/^claude_/, '')
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime()
  if (diffMs < 60000) {
    return 'just now'
  }
  const totalMinutes = Math.round(diffMs / 60000)
  if (totalMinutes < 60) {
    return `${totalMinutes}m ago`
  }
  const hours = Math.floor(totalMinutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
