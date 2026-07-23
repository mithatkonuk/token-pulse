export interface PlanLimits {
  five_hour: number
  weekly: number
}

export interface PlanLimitsConfig {
  defaultTier: string
  notes?: string
  tiers: Record<string, PlanLimits>
}

const SAFETY_FALLBACK: PlanLimits = { five_hour: 200000, weekly: 2000000 }

export function getLimitsForTier(config: PlanLimitsConfig, tier: string | null): PlanLimits {
  if (tier && config.tiers[tier]) {
    return config.tiers[tier]
  }
  return config.tiers[config.defaultTier] ?? SAFETY_FALLBACK
}
