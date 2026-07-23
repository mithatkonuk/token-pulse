import type { UsageState } from '../shared/types'
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
        <span className="widget-panel__tier">{state.planTier}</span>
      </div>
      {fiveHour && <UsageBar window={fiveHour} />}
      {weekly && <UsageBar window={weekly} />}
      <label className="widget-panel__autostart">
        <input
          type="checkbox"
          checked={state.startAtLogin}
          onChange={(e) => window.ipcRenderer.invoke('settings:setStartAtLogin', e.target.checked)}
        />
        Start at login
      </label>
    </div>
  )
}
