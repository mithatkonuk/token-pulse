import type { UsageState } from '../shared/types'
import { formatRelativeTime } from '../shared/format'
import { UsageBar } from './UsageBar'

export function UsageView({ state }: { state: UsageState }) {
  const fiveHour = state.windows.find((w) => w.id === 'five_hour')
  const weekly = state.windows.find((w) => w.id === 'weekly')
  return (
    <>
      {fiveHour && <UsageBar window={fiveHour} />}
      {weekly && <UsageBar window={weekly} />}
      {state.windows.length === 0 && (
        <div className="widget-panel__empty">No usage data yet — open a Claude Code session to populate this.</div>
      )}
      {state.cacheUpdatedAt && (
        <div className="widget-panel__freshness">Data as of {formatRelativeTime(state.cacheUpdatedAt)}</div>
      )}
    </>
  )
}
