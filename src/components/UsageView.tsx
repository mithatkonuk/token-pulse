import type { UsageState } from '../shared/types'
import { formatCompactNumber, formatPlanTier, formatRelativeTime } from '../shared/format'
import { UsageBar } from './UsageBar'

export function UsageView({ state }: { state: UsageState }) {
  const fiveHour = state.windows.find((w) => w.id === 'five_hour')
  const weekly = state.windows.find((w) => w.id === 'weekly')
  const contextWindow = state.contextWindow
  return (
    <>
      {contextWindow && (
        <>
          <div className="usage-bar">
            <div className="usage-bar__header">
              <span>Context window</span>
              <span>
                {formatCompactNumber(contextWindow.totalInputTokens)} / {formatCompactNumber(contextWindow.contextWindowSize)} (
                {Math.round(contextWindow.usedPercentage)}%)
              </span>
            </div>
            <div className="usage-bar__track">
              <div
                className="usage-bar__fill"
                style={{ width: `${Math.min(100, Math.max(0, contextWindow.usedPercentage))}%` }}
              />
            </div>
          </div>
          <hr className="widget-panel__separator" />
        </>
      )}
      {(fiveHour || weekly) && (
        <div className="widget-panel__section-label">Plan usage limits · {formatPlanTier(state.planTier)}</div>
      )}
      {fiveHour && <UsageBar window={fiveHour} />}
      {weekly && <UsageBar window={weekly} />}
      {state.windows.length === 0 && (
        <div className="widget-panel__empty">No usage data yet — open a Claude Code session to populate this.</div>
      )}
      {state.cacheUpdatedAt && (
        <>
          <hr className="widget-panel__separator" />
          <div className="widget-panel__freshness">Data as of {formatRelativeTime(state.cacheUpdatedAt)}</div>
        </>
      )}
    </>
  )
}
