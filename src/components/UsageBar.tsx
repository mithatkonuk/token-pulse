import type { UsageWindow } from '../shared/types'
import { formatCountdown } from '../shared/format'

export function UsageBar({ window }: { window: UsageWindow }) {
  const percent = Math.min(100, Math.max(0, window.percentUsed))
  return (
    <div className="usage-bar">
      <div className="usage-bar__header">
        <span>{window.label}</span>
        <span>{Math.round(window.percentUsed)}%</span>
      </div>
      <div className="usage-bar__track">
        <div className="usage-bar__fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="usage-bar__footer">{formatCountdown(window.resetsAt)}</div>
    </div>
  )
}
