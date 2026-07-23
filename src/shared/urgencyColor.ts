export type UrgencyColor = 'green' | 'yellow' | 'red'

export function urgencyColorForPercent(percentUsed: number): UrgencyColor {
  if (percentUsed >= 90) {
    return 'red'
  }
  if (percentUsed >= 70) {
    return 'yellow'
  }
  return 'green'
}
