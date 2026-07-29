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
  ;(window as unknown as { __emit: (channel: string, ...args: unknown[]) => void }).__emit = (
    channel: string,
    ...args: unknown[]
  ) => {
    listeners.get(channel)?.forEach((listener) => listener(null, ...args))
  }
})

function emit(channel: string, ...args: unknown[]): void {
  ;(window as unknown as { __emit: (channel: string, ...args: unknown[]) => void }).__emit(channel, ...args)
}

describe('WidgetPanel', () => {
  it('shows the usage view by default, with no Settings or Info buttons in the header', () => {
    render(<WidgetPanel state={baseState()} />)
    expect(screen.queryByText('Version 0.2.1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Settings')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('About')).not.toBeInTheDocument()
  })

  it('switches to the About view when the main process sends popup:show-view("about")', () => {
    render(<WidgetPanel state={baseState()} />)
    act(() => emit('popup:show-view', 'about'))
    expect(screen.getByText('Version 0.2.1')).toBeInTheDocument()
  })

  it('switches to the Settings view when the main process sends popup:show-view("settings")', () => {
    render(<WidgetPanel state={baseState()} />)
    act(() => emit('popup:show-view', 'settings'))
    expect(screen.getByLabelText('Back')).toBeInTheDocument()
  })

  it('ignores an unknown view name', () => {
    render(<WidgetPanel state={baseState()} />)
    act(() => emit('popup:show-view', 'not-a-real-view'))
    expect(screen.queryByLabelText('Back')).not.toBeInTheDocument()
  })
})
