import { describe, it, expect } from 'vitest'
import { getLimitsForTier, type PlanLimitsConfig } from '../src/providers/claude-code/planLimits'

const config: PlanLimitsConfig = {
  defaultTier: 'claude_pro',
  tiers: {
    claude_pro: { five_hour: 200000, weekly: 2000000 },
    claude_max_5x: { five_hour: 1000000, weekly: 10000000 },
  },
}

describe('getLimitsForTier', () => {
  it('returns the limits for a known tier', () => {
    expect(getLimitsForTier(config, 'claude_max_5x')).toEqual({ five_hour: 1000000, weekly: 10000000 })
  })

  it('falls back to the default tier when the tier is unknown', () => {
    expect(getLimitsForTier(config, 'some_future_tier')).toEqual({ five_hour: 200000, weekly: 2000000 })
  })

  it('falls back to the default tier when the tier is null', () => {
    expect(getLimitsForTier(config, null)).toEqual({ five_hour: 200000, weekly: 2000000 })
  })
})
