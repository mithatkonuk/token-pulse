import type { AppSettings } from '../shared/types'

const FONT_FAMILIES: Array<{ value: AppSettings['fontFamily']; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'monospace', label: 'Monospace' },
  { value: 'serif', label: 'Serif' },
  { value: 'menlo', label: 'Menlo' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
]

const FONT_SIZES: Array<{ value: AppSettings['fontSize']; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

export function SettingsView({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
}) {
  return (
    <div className="settings-view">
      <div className="settings-view__row">
        <span>Theme</span>
        <div className="settings-view__theme-toggle">
          <button className={settings.theme === 'dark' ? 'is-active' : ''} onClick={() => onUpdate({ theme: 'dark' })}>
            Dark
          </button>
          <button className={settings.theme === 'light' ? 'is-active' : ''} onClick={() => onUpdate({ theme: 'light' })}>
            Light
          </button>
          <button className={settings.theme === 'system' ? 'is-active' : ''} onClick={() => onUpdate({ theme: 'system' })}>
            System
          </button>
        </div>
      </div>
      <label className="settings-view__row">
        <span>Font family</span>
        <select
          value={settings.fontFamily}
          onChange={(e) => onUpdate({ fontFamily: e.target.value as AppSettings['fontFamily'] })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-view__row">
        <span>Font size</span>
        <select value={settings.fontSize} onChange={(e) => onUpdate({ fontSize: e.target.value as AppSettings['fontSize'] })}>
          {FONT_SIZES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-view__row settings-view__checkbox-row">
        <input type="checkbox" checked={settings.startAtLogin} onChange={(e) => onUpdate({ startAtLogin: e.target.checked })} />
        Start at login
      </label>
    </div>
  )
}
