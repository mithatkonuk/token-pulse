/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { WidgetPanel } from '../src/components/WidgetPanel'
import type { AppState, SourceUsage } from '../src/shared/types'

afterEach(() => {
  cleanup()
})

function baseUsage(): SourceUsage {
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
  }
}

function baseState(): AppState {
  return {
    sources: [{ id: 'claude', label: 'Claude Code' }],
    activeSourceId: 'claude',
    usageBySource: { claude: baseUsage() },
    settings: { startAtLogin: false, theme: 'dark', accentColor: '#0a84ff', fontFamily: 'system', fontSize: 'medium' },
    appVersion: '0.2.1',
  }
}

type Listener = (event: unknown, ...args: unknown[]) => void

beforeEach(() => {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  const listeners = new Map<string, Set<Listener>>()
  window.ipcRenderer = {
    on: (channel: string, listener: Listener) => {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set())
      }
      listeners.get(channel)!.add(listener)
    },
    off: (channel: string, listener: Listener) => {
      listeners.get(channel)?.delete(listener)
    },
    send: vi.fn(),
    invoke: vi.fn().mockResolvedValue(undefined),
  }
  ;(window as unknown as { __emit: (channel: string) => void }).__emit = (channel: string) => {
    listeners.get(channel)?.forEach((listener) => listener(null))
  }
})

describe('WidgetPanel', () => {
  it('shows the usage view by default', () => {
    render(<WidgetPanel state={baseState()} />)
    expect(screen.queryByText('Version 0.2.1')).not.toBeInTheDocument()
  })

  it('switches to the About view when the main process sends popup:show-about', () => {
    render(<WidgetPanel state={baseState()} />)
    act(() => {
      ;(window as unknown as { __emit: (channel: string) => void }).__emit('popup:show-about')
    })
    expect(screen.getByText('Version 0.2.1')).toBeInTheDocument()
  })
})
