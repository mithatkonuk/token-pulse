export type UrgencyColor = 'blue' | 'yellow' | 'red'

export function urgencyColorForPercent(percentUsed: number): UrgencyColor {
  if (percentUsed >= 90) {
    return 'red'
  }
  if (percentUsed >= 80) {
    return 'yellow'
  }
  return 'blue'
}
