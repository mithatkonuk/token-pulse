import type { UsageState } from '../shared/types'
import { formatRelativeTime } from '../shared/format'
import { UsageBar } from './UsageBar'

export function WidgetPanel({ state }: { state: UsageState | null }) {
  if (!state) {
    return <div className="widget-panel">Loading usage…</div>
  }
  const fiveHour = state.windows.find((w) => w.id === 'five_hour')
  const weekly = state.windows.find((w) => w.id === 'weekly')
  return (
    <div className="widget-panel">
      <div className="widget-panel__header">
        <span>{state.currentModel ?? 'No recent activity'}</span>
        <span className="widget-panel__tier">{state.planTier ?? 'plan unknown'}</span>
      </div>
      {fiveHour && <UsageBar window={fiveHour} />}
      {weekly && <UsageBar window={weekly} />}
      {state.windows.length === 0 && (
        <div className="widget-panel__empty">No usage data yet — open a Claude Code session to populate this.</div>
      )}
      <label className="widget-panel__autostart">
        <input
          type="checkbox"
          checked={state.startAtLogin}
          onChange={(e) =>
            window.ipcRenderer
              .invoke('settings:setStartAtLogin', e.target.checked)
              .catch((err: unknown) => console.error('Failed to update start-at-login setting', err))
          }
        />
        Start at login
      </label>
      {state.cacheUpdatedAt && (
        <div className="widget-panel__freshness">Data as of {formatRelativeTime(state.cacheUpdatedAt)}</div>
      )}
    </div>
  )
}
