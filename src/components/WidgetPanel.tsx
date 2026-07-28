import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AppState, AppSettings } from '../shared/types'
import { UsageView } from './UsageView'
import { SettingsView } from './SettingsView'
import { AboutView } from './AboutView'
import { SourceSelector } from './SourceSelector'
import { BackIcon, SettingsIcon, InfoIcon } from './icons'

type PanelView = 'usage' | 'settings' | 'about'

const FONT_FAMILY_STACKS: Record<AppSettings['fontFamily'], string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  monospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  serif: "Georgia, 'Times New Roman', serif",
  menlo: 'Menlo, monospace',
  'jetbrains-mono': "'JetBrains Mono', monospace",
}

const FONT_SIZES_PX: Record<AppSettings['fontSize'], string> = {
  small: '12px',
  medium: '13px',
  large: '15px',
}

function accentStyle(settings: AppSettings): CSSProperties {
  return {
    '--accent-color': settings.accentColor,
    '--font-family': FONT_FAMILY_STACKS[settings.fontFamily],
    '--font-size': FONT_SIZES_PX[settings.fontSize],
  } as CSSProperties
}

export function WidgetPanel({ state }: { state: AppState | null }) {
  const [view, setView] = useState<PanelView>('usage')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el) {
      return
    }
    const observer = new ResizeObserver(() => {
      window.ipcRenderer.send('popup:resize', el.offsetHeight)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!state) {
    return <div ref={panelRef} className="widget-panel">Loading usage…</div>
  }

  function updateSettings(patch: Partial<AppSettings>): void {
    window.ipcRenderer
      .invoke('settings:update', patch)
      .catch((err: unknown) => console.error('Failed to update settings', err))
  }

  function selectSource(sourceId: string): void {
    window.ipcRenderer
      .invoke('source:select', sourceId)
      .catch((err: unknown) => console.error('Failed to select source', err))
  }

  const activeUsage = state.usageBySource[state.activeSourceId]
  const activeSourceLabel = state.sources.find((s) => s.id === state.activeSourceId)?.label ?? ''
  const dataTheme = state.settings.theme === 'system' ? undefined : state.settings.theme

  return (
    <div ref={panelRef} className="widget-panel" data-theme={dataTheme} style={accentStyle(state.settings)}>
      <div className="widget-panel__header">
        <SourceSelector
          sources={state.sources}
          activeSourceId={state.activeSourceId}
          activeSourceLabel={activeSourceLabel}
          currentModel={activeUsage.currentModel}
          onSelect={selectSource}
        />
        <div className="widget-panel__header-nav">
          {view !== 'usage' ? (
            <button className="widget-panel__icon-button" onClick={() => setView('usage')} aria-label="Back">
              <BackIcon />
            </button>
          ) : (
            <>
              <button className="widget-panel__icon-button" onClick={() => setView('settings')} aria-label="Settings">
                <SettingsIcon />
              </button>
              <button className="widget-panel__icon-button" onClick={() => setView('about')} aria-label="About">
                <InfoIcon />
              </button>
            </>
          )}
        </div>
      </div>
      {view === 'usage' && <UsageView state={activeUsage} />}
      {view === 'settings' && <SettingsView settings={state.settings} onUpdate={updateSettings} />}
      {view === 'about' && <AboutView appVersion={state.appVersion} />}
    </div>
  )
}
