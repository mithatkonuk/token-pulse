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

// A tilde marks a value that is not a recent confirmed fetch: an estimate, or old data.
export function formatTrayTitle(percentUsed: number, windowLabel: TrayWindowLabel = null, approximate = false): string {
  const suffix = windowLabel ? ` ${WINDOW_LABEL_TEXT[windowLabel]}` : ''
  return ` ${approximate ? '~' : ''}${Math.round(percentUsed)}%${suffix}`
}

export function trayTitleFor(percentUsed: number | null, windowLabel: TrayWindowLabel = null, approximate = false): string {
  return percentUsed === null ? '' : formatTrayTitle(percentUsed, windowLabel, approximate)
}

// The scheduled cadence fetches at least every 10 minutes. Data older than 15 minutes means that
// the fetches fail.
export const OLD_DATA_AFTER_MS = 15 * 60 * 1000

export function isDataOld(fetchedAt: string | null, now: number): boolean {
  return fetchedAt !== null && now - Date.parse(fetchedAt) > OLD_DATA_AFTER_MS
}
