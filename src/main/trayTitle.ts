export type TrayWindowLabel = 'five_hour' | 'weekly' | null

const WINDOW_LABEL_TEXT: Record<Exclude<TrayWindowLabel, null>, string> = {
  five_hour: '5h',
  weekly: 'Weekly',
}

export function formatTrayTitle(percentUsed: number, windowLabel: TrayWindowLabel = null): string {
  const prefix = windowLabel ? `${WINDOW_LABEL_TEXT[windowLabel]} ` : ' '
  return `${prefix}${Math.round(percentUsed)}%`
}
