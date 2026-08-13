import type { UsageProvider } from '../providers/types'

export interface SourceConfig {
  id: string
  label: string
  provider: UsageProvider
  activeIntervalMs?: number
}

export function buildAvailableSources(configs: SourceConfig[]): SourceConfig[] {
  return configs.filter((config) => config.provider.isAvailable())
}
