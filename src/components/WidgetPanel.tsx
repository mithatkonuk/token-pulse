import { useState, type CSSProperties } from 'react'
import type { UsageState, AppSettings } from '../shared/types'
import { UsageView } from './UsageView'
import { SettingsView } from './SettingsView'
import { AboutView } from './AboutView'

type PanelView = 'usage' | 'settings' | 'about'

const FONT_FAMILY_STACKS: Record<AppSettings['fontFamily'], string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  monospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  serif: "Georgia, 'Times New Roman', serif",
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

export function WidgetPanel({ state }: { state: UsageState | null }) {
  const [view, setView] = useState<PanelView>('usage')

  if (!state) {
    return <div className="widget-panel">Loading usage…</div>
  }

  function updateSettings(patch: Partial<AppSettings>): void {
    window.ipcRenderer
      .invoke('settings:update', patch)
      .catch((err: unknown) => console.error('Failed to update settings', err))
  }

  return (
    <div className="widget-panel" data-theme={state.settings.theme} style={accentStyle(state.settings)}>
      <div className="widget-panel__header">
        <div className="widget-panel__header-info">
          <span>{state.currentModel ?? 'No recent activity'}</span>
          <span className="widget-panel__tier">{state.planTier ?? 'plan unknown'}</span>
        </div>
        <div className="widget-panel__header-nav">
          {view !== 'usage' ? (
            <button className="widget-panel__icon-button" onClick={() => setView('usage')} aria-label="Back">
              ←
            </button>
          ) : (
            <>
              <button className="widget-panel__icon-button" onClick={() => setView('settings')} aria-label="Settings">
                ⚙
              </button>
              <button className="widget-panel__icon-button" onClick={() => setView('about')} aria-label="About">
                ⓘ
              </button>
            </>
          )}
        </div>
      </div>
      {view === 'usage' && <UsageView state={state} />}
      {view === 'settings' && <SettingsView settings={state.settings} onUpdate={updateSettings} />}
      {view === 'about' && <AboutView appVersion={state.appVersion} />}
    </div>
  )
}
