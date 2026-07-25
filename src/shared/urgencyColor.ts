export type UrgencyColor = 'blue' | 'orange' | 'red'

export function urgencyColorForPercent(percentUsed: number): UrgencyColor {
  if (percentUsed >= 90) {
    return 'red'
  }
  if (percentUsed >= 80) {
    return 'orange'
  }
  return 'blue'
}
