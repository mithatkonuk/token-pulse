import type { UsageWindow } from '../shared/types'
import { formatCountdown } from '../shared/format'
import { urgencyColorForPercent } from '../shared/urgencyColor'

export function UsageBar({ window }: { window: UsageWindow }) {
  const percent = Math.min(100, Math.max(0, window.percentUsed))
  return (
    <div className="usage-bar">
      <div className="usage-bar__header">
        <span>{window.label}</span>
        <span className="usage-bar__meta">
          <span className="usage-bar__reset">
            {window.resetsAt ? formatCountdown(window.resetsAt) : 'reset time unknown'}
          </span>
          <span>{Math.round(window.percentUsed)}%</span>
        </span>
      </div>
      <div className="usage-bar__track">
        <div
          className={`usage-bar__fill usage-bar__fill--${urgencyColorForPercent(window.percentUsed)}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
