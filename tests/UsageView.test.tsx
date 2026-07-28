/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { UsageView } from '../src/components/UsageView'
import type { SourceUsage } from '../src/shared/types'

afterEach(() => {
  cleanup()
})

function baseState(overrides: Partial<SourceUsage> = {}): SourceUsage {
  return {
    planTier: null,
    currentModel: null,
    windows: [],
    contextWindow: null,
    contributing: null,
    cost: null,
    recentActivity: null,
    updatedAt: new Date().toISOString(),
    cacheUpdatedAt: null,
    ...overrides,
  }
}

describe('UsageView', () => {
  it('renders every window generically, not just five_hour/weekly', () => {
    render(
      <UsageView
        state={baseState({
          windows: [{ id: 'billing_cycle', label: 'Monthly billing cycle', percentUsed: 31.8, resetsText: 'resets Aug 6' }],
        })}
      />
    )
    expect(screen.getByText('Monthly billing cycle')).toBeInTheDocument()
    expect(screen.getByText('resets Aug 6')).toBeInTheDocument()
  })

  it('shows a cost line when cost data is present', () => {
    render(<UsageView state={baseState({ cost: { spentCents: 636, limitCents: 2000 } })} />)
    expect(screen.getByText('$6.36 / $20.00')).toBeInTheDocument()
  })

  it('renders nothing extra when cost is null', () => {
    render(<UsageView state={baseState()} />)
    expect(screen.queryByText(/spent this period/i)).not.toBeInTheDocument()
  })

  it('shows a recent-activity table when activity events are present', () => {
    render(
      <UsageView
        state={baseState({
          recentActivity: [{ timestamp: '2026-07-27T18:52:00.000Z', model: 'auto', tokens: 23400, costCents: null }],
        })}
      />
    )
    expect(screen.getByText('auto')).toBeInTheDocument()
    expect(screen.getByText('23.4k tok')).toBeInTheDocument()
  })
})
