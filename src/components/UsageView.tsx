import { useState } from 'react'
import type { ContributingStats, TopEntry, SourceUsage } from '../shared/types'
import { formatCompactNumber, formatPlanTier, formatRelativeTime } from '../shared/format'
import { UsageBar } from './UsageBar'

function TopEntriesRow({ label, entries }: { label: string; entries: TopEntry[] }) {
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="contributing__category">
      <div className="contributing__category-label">{label}</div>
      {entries.map((entry) => (
        <div key={entry.name} className="contributing__entry">
          <span className="contributing__entry-name">{entry.name}</span>
          <span className="contributing__entry-percent">{entry.percent}%</span>
        </div>
      ))}
    </div>
  )
}

function ContributingStatsSection({ contributing }: { contributing: SourceUsage['contributing'] }) {
  const [range, setRange] = useState<'last24h' | 'last7d'>('last24h')
  if (!contributing || (!contributing.last24h && !contributing.last7d)) {
    return null
  }
  const stats: ContributingStats | null = contributing[range]
  return (
    <>
      <hr className="widget-panel__separator" />
      <div className="contributing__header">
        <span className="widget-panel__section-label">What&apos;s using your limits?</span>
        <div className="settings-view__theme-toggle">
          <button className={range === 'last24h' ? 'is-active' : ''} onClick={() => setRange('last24h')}>
            24h
          </button>
          <button className={range === 'last7d' ? 'is-active' : ''} onClick={() => setRange('last7d')}>
            7d
          </button>
        </div>
      </div>
      {stats ? (
        <div className="contributing__body">
          <div className="contributing__category">
            <div className="contributing__meta">
              {stats.requests} requests · {stats.sessions} sessions
            </div>
            {stats.aboveContextPercent !== null && (
              <div className="contributing__row">{stats.aboveContextPercent}% ran above 150k context</div>
            )}
          </div>
          <TopEntriesRow label="Skills" entries={stats.topSkills} />
          <TopEntriesRow label="Subagents" entries={stats.topSubagents} />
          <TopEntriesRow label="Plugins" entries={stats.topPlugins} />
          <TopEntriesRow label="MCP servers" entries={stats.topMcpServers} />
        </div>
      ) : (
        <div className="widget-panel__empty">No data for this range.</div>
      )}
    </>
  )
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function CostSection({ cost }: { cost: SourceUsage['cost'] }) {
  if (!cost) {
    return null
  }
  return (
    <>
      <hr className="widget-panel__separator" />
      <div className="usage-cost">
        <span>Spent this period</span>
        <span>
          {formatCents(cost.spentCents)}
          {cost.limitCents !== null && ` / ${formatCents(cost.limitCents)}`}
        </span>
      </div>
    </>
  )
}

function ActivitySection({ recentActivity }: { recentActivity: SourceUsage['recentActivity'] }) {
  if (!recentActivity || recentActivity.length === 0) {
    return null
  }
  return (
    <>
      <hr className="widget-panel__separator" />
      <div className="widget-panel__section-label">Recent activity</div>
      <div className="usage-activity">
        {recentActivity.map((event, index) => (
          <div className="usage-activity__row" key={`${event.timestamp}-${index}`}>
            <span className="usage-activity__model">{event.model}</span>
            <span className="usage-activity__tokens">{formatCompactNumber(event.tokens)} tok</span>
            <span className="usage-activity__cost">{event.costCents !== null ? formatCents(event.costCents) : '—'}</span>
          </div>
        ))}
      </div>
    </>
  )
}

export function UsageView({ state }: { state: SourceUsage }) {
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
      {state.windows.length > 0 && (
        <div className="widget-panel__section-label">Plan usage limits · {formatPlanTier(state.planTier)}</div>
      )}
      {state.windows.map((window) => (
        <UsageBar key={window.id} window={window} />
      ))}
      {state.windows.length === 0 && <div className="widget-panel__empty">No usage data yet.</div>}
      <CostSection cost={state.cost} />
      <ContributingStatsSection contributing={state.contributing} />
      <ActivitySection recentActivity={state.recentActivity} />
      {state.accountEmail && (
        <>
          <hr className="widget-panel__separator" />
          <div className="usage-account">
            <span>Signed in as</span>
            <span className="usage-account__email" title={state.accountEmail}>
              {state.accountEmail}
            </span>
          </div>
        </>
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
