import { describe, it, expect } from 'vitest'
import { buildAvailableSources, type SourceConfig } from '../src/main/buildSources'

function config(id: string, isAvailable: boolean): SourceConfig {
  return {
    id,
    label: id,
    provider: { isAvailable: () => isAvailable } as SourceConfig['provider'],
  }
}

describe('buildAvailableSources', () => {
  it('keeps both configs when both providers are available', () => {
    const configs = [config('claude', true), config('cursor', true)]
    expect(buildAvailableSources(configs).map((c) => c.id)).toEqual(['claude', 'cursor'])
  })

  it('drops a config whose provider is unavailable, keeping order', () => {
    const configs = [config('claude', false), config('cursor', true)]
    expect(buildAvailableSources(configs).map((c) => c.id)).toEqual(['cursor'])
  })

  it('returns an empty array when no provider is available', () => {
    const configs = [config('claude', false), config('cursor', false)]
    expect(buildAvailableSources(configs)).toEqual([])
  })
})
