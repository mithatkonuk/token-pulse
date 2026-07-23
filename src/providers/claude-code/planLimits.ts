export interface PlanLimits {
  five_hour: number
  weekly: number
}

export interface PlanLimitsConfig {
  defaultTier: string
  notes?: string
  tiers: Record<string, PlanLimits>
}

export function getLimitsForTier(config: PlanLimitsConfig, tier: string | null): PlanLimits {
  if (tier && config.tiers[tier]) {
    return config.tiers[tier]
  }
  return config.tiers[config.defaultTier]
}
