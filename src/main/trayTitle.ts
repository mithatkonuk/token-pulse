export type TrayWindowLabel = 'five_hour' | 'weekly' | 'billing_cycle' | null

const WINDOW_LABEL_TEXT: Record<Exclude<TrayWindowLabel, null>, string> = {
  five_hour: '5h',
  weekly: 'Wk',
  billing_cycle: 'Mo',
}

const KNOWN_WINDOW_IDS = new Set(Object.keys(WINDOW_LABEL_TEXT))

export function trayWindowLabelForWindowId(id: string | undefined): TrayWindowLabel {
  return id !== undefined && KNOWN_WINDOW_IDS.has(id) ? (id as Exclude<TrayWindowLabel, null>) : null
}

export function formatTrayTitle(percentUsed: number, windowLabel: TrayWindowLabel = null): string {
  const suffix = windowLabel ? ` ${WINDOW_LABEL_TEXT[windowLabel]}` : ''
  return ` ${Math.round(percentUsed)}%${suffix}`
}
