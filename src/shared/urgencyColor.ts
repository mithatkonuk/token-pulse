export type UrgencyColor = 'blue' | 'orange' | 'red'

export const RED_URGENCY_THRESHOLD_PERCENT = 90

export function urgencyColorForPercent(percentUsed: number): UrgencyColor {
  if (percentUsed >= RED_URGENCY_THRESHOLD_PERCENT) {
    return 'red'
  }
  if (percentUsed >= 80) {
    return 'orange'
  }
  return 'blue'
}
