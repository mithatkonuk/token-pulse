# About + Settings Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an About view (app name/version/contact email) and a Settings view (theme, accent color, font family/size, start-at-login) to the token-pulse tray popup, plus make the tray icon's normal-state color adapt to OS light/dark appearance.

**Architecture:** The popup gains a `view` state (`'usage' | 'settings' | 'about'`) in `WidgetPanel`, switched via two new header icon buttons. `AppSettings` moves from a main-process-only type into the shared IPC contract (`UsageState.settings`), with a single generic `settings:update` IPC handler replacing the narrower `settings:setStartAtLogin`. The popup applies theme/accent/font via CSS custom properties. The tray icon (separate rendering path, `src/main/trayIcon.ts`) reads OS dark-mode state independently and is unaffected by the in-app theme setting.

**Tech Stack:** Electron 43, React 19, TypeScript, Vite, Vitest, pngjs (existing — no new dependencies).

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-07-24-about-settings-design.md`.
- No new npm dependencies — native `<input type="color">`/`<select>`, plain CSS custom properties.
- `src/main/trayIcon.ts` stays Electron-free (no `nativeTheme` import) so it remains unit-testable without the Electron runtime — the OS dark-mode value is a parameter, read by `electron/tray.ts`.
- Contact email is exactly `mithatkonuk@gmail.com`.
- Tray icon's yellow (80%+)/red (90%+) urgency colors are unchanged by this work — only the normal/below-80% color varies with OS theme.
- This codebase has no React component test setup (no jsdom/@testing-library) — `WidgetPanel`/`UsageBar` are currently untested at the component level, and this plan does not introduce that tooling. Renderer changes are verified by `tsc` + manual check in the dev server (Task 9), per existing project convention.
- Because `AppSettings`/`UsageState` are shared types touched across main.ts/settingsStore.ts/WidgetPanel.tsx, **whole-project `tsc --noEmit` is only expected to pass starting at Task 9** — earlier tasks verify only the files they touch (targeted `vitest run <file>`), since `WidgetPanel.tsx` isn't migrated to the new shape until Task 8.

---

### Task 1: Expand settings data model

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/settingsStore.ts`
- Test: `tests/settingsStore.test.ts`

**Interfaces:**
- Produces: `AppSettings` (moved here from settingsStore.ts) — `{ startAtLogin: boolean; theme: 'dark' | 'light'; accentColor: string; fontFamily: 'system' | 'monospace' | 'serif'; fontSize: 'small' | 'medium' | 'large' }`
- Produces: `UsageState.settings: AppSettings`, `UsageState.appVersion: string` (replaces the old top-level `UsageState.startAtLogin: boolean`, which is removed)
- Produces: `readSettings(filePath: string): AppSettings`, `writeSettings(filePath: string, settings: AppSettings): void` (same signatures, new default shape)

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `tests/settingsStore.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSettings, writeSettings } from '../src/main/settingsStore'
import type { AppSettings } from '../src/shared/types'

let filePath: string

const DEFAULTS: AppSettings = {
  startAtLogin: false,
  theme: 'dark',
  accentColor: '#0a84ff',
  fontFamily: 'system',
  fontSize: 'medium',
}

afterEach(() => {
  fs.rmSync(filePath, { force: true })
})

describe('settingsStore', () => {
  it('returns defaults when the file does not exist', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-missing-${Date.now()}.json`)
    expect(readSettings(filePath)).toEqual(DEFAULTS)
  })

  it('round-trips a written value', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-roundtrip-${Date.now()}.json`)
    const custom: AppSettings = {
      startAtLogin: true,
      theme: 'light',
      accentColor: '#ff0000',
      fontFamily: 'monospace',
      fontSize: 'large',
    }
    writeSettings(filePath, custom)
    expect(readSettings(filePath)).toEqual(custom)
  })

  it('merges partial file contents with defaults', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-partial-${Date.now()}.json`)
    fs.writeFileSync(filePath, JSON.stringify({ startAtLogin: true }))
    expect(readSettings(filePath)).toEqual({ ...DEFAULTS, startAtLogin: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settingsStore.test.ts`
Expected: FAIL — `src/shared/types.ts` has no exported `AppSettings`, and current defaults are `{ startAtLogin: false }` only.

- [ ] **Step 3: Update `src/shared/types.ts`**

Replace the full file contents:

```ts
export interface UsageWindow {
  id: 'five_hour' | 'weekly'
  label: string
  percentUsed: number
  resetsAt: string | null
}

export interface AppSettings {
  startAtLogin: boolean
  theme: 'dark' | 'light'
  accentColor: string
  fontFamily: 'system' | 'monospace' | 'serif'
  fontSize: 'small' | 'medium' | 'large'
}

export interface UsageState {
  planTier: string | null
  currentModel: string | null
  windows: UsageWindow[]
  updatedAt: string
  cacheUpdatedAt: string | null
  settings: AppSettings
  appVersion: string
}
```

- [ ] **Step 4: Update `src/main/settingsStore.ts`**

Replace the full file contents:

```ts
import fs from 'node:fs'
import type { AppSettings } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  startAtLogin: false,
  theme: 'dark',
  accentColor: '#0a84ff',
  fontFamily: 'system',
  fontSize: 'medium',
}

export function readSettings(filePath: string): AppSettings {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function writeSettings(filePath: string, settings: AppSettings): void {
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/settingsStore.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/settingsStore.ts tests/settingsStore.test.ts
git commit -m "feat: expand AppSettings with theme/accentColor/font, move to shared types"
```

---

### Task 2: Tray icon adapts to OS light/dark appearance

**Files:**
- Modify: `src/main/trayIcon.ts`
- Modify: `electron/tray.ts`
- Test: `tests/trayIcon.test.ts`

**Interfaces:**
- Consumes: none from Task 1.
- Produces: `renderUsageRingPng(percentUsed: number, size?: number, isSystemDarkMode?: boolean): Buffer` — new optional third param, default `false` (preserves existing dark-blue-by-default test expectations).

- [ ] **Step 1: Write the failing tests**

Append to `tests/trayIcon.test.ts` (inside the existing `describe('renderUsageRingPng', ...)` block, after the last `it`):

```ts
  it('renders white as the normal-state fill when isSystemDarkMode is true', () => {
    const png = PNG.sync.read(renderUsageRingPng(50, 20, true))
    expect(pixelAt(png, 10, 1)).toEqual([255, 255, 255, 255])
  })

  it('keeps the red fill at 90%+ regardless of isSystemDarkMode', () => {
    const png = PNG.sync.read(renderUsageRingPng(95, 20, true))
    expect(pixelAt(png, 10, 1)).toEqual([139, 0, 0, 255])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/trayIcon.test.ts`
Expected: FAIL — `renderUsageRingPng` doesn't accept a third argument yet (the white-fill test observes dark blue instead of white).

- [ ] **Step 3: Update `src/main/trayIcon.ts`**

Replace the full file contents:

```ts
import { PNG } from 'pngjs'
import { urgencyColorForPercent, type UrgencyColor } from '../shared/urgencyColor'

export const ICON_SIZE = 16

const DARK_BLUE: [number, number, number, number] = [0, 0, 139, 255]
const WHITE: [number, number, number, number] = [255, 255, 255, 255]
const DARK_YELLOW: [number, number, number, number] = [184, 134, 11, 255]
const DARK_RED: [number, number, number, number] = [139, 0, 0, 255]

const TRACK_RGBA: [number, number, number, number] = [128, 128, 128, 90]

function filledRgbaFor(color: UrgencyColor, isSystemDarkMode: boolean): [number, number, number, number] {
  switch (color) {
    case 'blue':
      return isSystemDarkMode ? WHITE : DARK_BLUE
    case 'yellow':
      return DARK_YELLOW
    case 'red':
      return DARK_RED
  }
}

export function renderUsageRingPng(percentUsed: number, size: number = ICON_SIZE, isSystemDarkMode = false): Buffer {
  const clamped = Math.max(0, Math.min(100, percentUsed))
  const filledAngle = (clamped / 100) * 360
  const filledColor = filledRgbaFor(urgencyColorForPercent(percentUsed), isSystemDarkMode)
  const png = new PNG({ width: size, height: size })
  const center = (size - 1) / 2
  const outerRadius = size / 2
  const thickness = Math.max(2, size / 6)
  const innerRadius = outerRadius - thickness

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center
      const dy = y - center
      const dist = Math.sqrt(dx * dx + dy * dy)
      const idx = (size * y + x) << 2
      if (dist > outerRadius || dist < innerRadius) {
        png.data[idx + 3] = 0
        continue
      }
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI
      if (angle < 0) {
        angle += 360
      }
      const isFilled = angle < filledAngle
      const [r, g, b, a] = isFilled ? filledColor : TRACK_RGBA
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = a
    }
  }

  return PNG.sync.write(png)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/trayIcon.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Update `electron/tray.ts` to pass the live OS theme**

Replace the full file contents:

```ts
import { Tray, nativeImage, Menu, app, nativeTheme } from 'electron'
import { renderUsageRingPng, ICON_SIZE } from '../src/main/trayIcon'

let tray: Tray | null = null

function formatTitle(percentUsed: number): string {
  return ` ${Math.round(percentUsed)}%`
}

export function createTray(onClick: (tray: Tray) => void): Tray {
  tray = new Tray(nativeImage.createFromBuffer(renderUsageRingPng(0, ICON_SIZE, nativeTheme.shouldUseDarkColors)))
  tray.setToolTip('token-pulse')
  if (process.platform === 'darwin') {
    tray.setTitle(formatTitle(0))
  }
  const menu = Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }])
  tray.on('click', () => onClick(tray as Tray))
  tray.on('right-click', () => tray?.popUpContextMenu(menu))
  return tray
}

export function updateTrayIcon(percentUsed: number): void {
  if (!tray) {
    return
  }
  tray.setImage(nativeImage.createFromBuffer(renderUsageRingPng(percentUsed, ICON_SIZE, nativeTheme.shouldUseDarkColors)))
  if (process.platform === 'darwin') {
    tray.setTitle(formatTitle(percentUsed))
  }
}

export function getTray(): Tray | null {
  return tray
}
```

`electron/tray.ts` has no test file (Electron-runtime glue, same convention as `autostart.ts`'s `app`-dependent branch) — verified via the dev-server check in Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/main/trayIcon.ts electron/tray.ts tests/trayIcon.test.ts
git commit -m "feat: tray icon normal-state color follows OS light/dark appearance"
```

---

### Task 3: Wire main process settings IPC + app version

**Files:**
- Modify: `electron/main.ts`

**Interfaces:**
- Consumes: `AppSettings` (Task 1, `../src/shared/types`), `readSettings`/`writeSettings` (Task 1), `setStartAtLogin`/`getStartAtLogin` (existing, `./autostart`).
- Produces: IPC handler `settings:update` (accepts `Partial<AppSettings>`, returns nothing — pushes updated state instead), replacing `settings:setStartAtLogin`. `state.settings: AppSettings` and `state.appVersion: string` populated.

No test file — this task is Electron-runtime glue (`app`, `ipcMain`) with no unit test target, same as the rest of `main.ts` today. Verified by Task 9's dev-server check.

- [ ] **Step 1: Update `electron/main.ts`**

Replace the full file contents:

```ts
import { app, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTray, updateTrayIcon } from './tray'
import { togglePopup, getPopupIfExists } from './windowManager'
import { setStartAtLogin, getStartAtLogin } from './autostart'
import { ClaudeCodeProvider } from '../src/providers/claude-code'
import type { UsageState, AppSettings } from '../src/shared/types'
import { readSettings, writeSettings } from '../src/main/settingsStore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs')
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

const POLL_MS = 5 * 1000

const provider = new ClaudeCodeProvider()

let state: UsageState = {
  planTier: provider.getPlanTier(),
  currentModel: null,
  windows: [],
  updatedAt: new Date().toISOString(),
  cacheUpdatedAt: null,
  settings: readSettings(SETTINGS_PATH),
  appVersion: app.getVersion(),
}

function pushState(): void {
  const fiveHour = state.windows.find((w) => w.id === 'five_hour')
  updateTrayIcon(fiveHour?.percentUsed ?? 0)
  const popup = getPopupIfExists()
  if (popup && popup.isVisible()) {
    popup.webContents.send('usage:update', state)
  }
}

function poll(): void {
  const cached = provider.getCachedUsage()
  state = {
    ...state,
    planTier: provider.getPlanTier(),
    currentModel: cached?.currentModel ?? null,
    windows: cached?.windows ?? [],
    updatedAt: new Date().toISOString(),
    cacheUpdatedAt: cached?.cacheUpdatedAt ?? null,
  }
  pushState()
}

ipcMain.handle('usage:get', () => state)

ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
  const next: AppSettings = { ...state.settings, ...patch }
  if (patch.startAtLogin !== undefined) {
    next.startAtLogin = setStartAtLogin(patch.startAtLogin)
  }
  writeSettings(SETTINGS_PATH, next)
  state = { ...state, settings: next }
  pushState()
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }
  const actualSettings: AppSettings = { ...state.settings, startAtLogin: getStartAtLogin() }
  writeSettings(SETTINGS_PATH, actualSettings)
  state = { ...state, settings: actualSettings }
  createTray((trayRef) => {
    togglePopup(trayRef, PRELOAD_PATH, { devServerUrl: VITE_DEV_SERVER_URL, rendererDist: RENDERER_DIST })
    pushState()
  })
  poll()
  setInterval(poll, POLL_MS)
})

app.on('window-all-closed', () => {
  // Intentionally do nothing — the app lives in the tray.
})
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat: generic settings:update IPC handler, expose appVersion in state"
```

---

### Task 4: Theming CSS foundation

**Files:**
- Modify: `src/App.css`

**Interfaces:**
- Produces: CSS custom properties `--accent-color`, `--font-family`, `--font-size`, `--bg-color`, `--text-color`, `--track-bg`, set with defaults on `.widget-panel` and overridden either by `.widget-panel[data-theme='light']` (theme) or inline styles set by React (accent/font — wired in Task 8). New classes for later tasks: `.widget-panel__header-info`, `.widget-panel__header-nav`, `.widget-panel__icon-button`, `.settings-view__row`, `.settings-view__checkbox-row`, `.settings-view__theme-toggle`, `.about-view__name`, `.about-view__version`, `.about-view__description`, `.about-view__contact`.

No test file — CSS has no test target in this project. Verified visually in Task 9.

- [ ] **Step 1: Replace `src/App.css`**

```css
.widget-panel {
  --accent-color: #0a84ff;
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-size: 13px;
  --bg-color: #1c1c1e;
  --text-color: #f5f5f7;
  --track-bg: #3a3a3c;

  font-family: var(--font-family);
  font-size: var(--font-size);
  background: var(--bg-color);
  color: var(--text-color);
  border-radius: 16px;
  padding: 16px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}

.widget-panel[data-theme='light'] {
  --bg-color: #f5f5f7;
  --text-color: #1c1c1e;
  --track-bg: #d1d1d6;
}

.widget-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  margin-bottom: 12px;
}

.widget-panel__header-info {
  display: flex;
  flex-direction: column;
}

.widget-panel__header-nav {
  display: flex;
  gap: 4px;
}

.widget-panel__icon-button {
  background: none;
  border: none;
  color: inherit;
  font-size: 1em;
  cursor: pointer;
  opacity: 0.7;
  padding: 2px 4px;
}

.widget-panel__icon-button:hover {
  opacity: 1;
}

.widget-panel__tier {
  opacity: 0.6;
  font-weight: 400;
  font-size: 0.85em;
}

.usage-bar {
  margin-bottom: 12px;
}

.usage-bar__header {
  display: flex;
  justify-content: space-between;
  font-size: 0.85em;
  margin-bottom: 4px;
}

.usage-bar__track {
  background: var(--track-bg);
  border-radius: 6px;
  height: 8px;
  overflow: hidden;
}

.usage-bar__fill {
  background: var(--accent-color);
  height: 100%;
}

.usage-bar__footer {
  font-size: 0.75em;
  opacity: 0.6;
  margin-top: 4px;
}

.widget-panel__empty {
  font-size: 0.85em;
  opacity: 0.7;
  margin-bottom: 12px;
}

.widget-panel__freshness {
  font-size: 0.75em;
  opacity: 0.5;
  margin-top: 8px;
}

.settings-view__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 0.9em;
}

.settings-view__checkbox-row {
  justify-content: flex-start;
  gap: 6px;
}

.settings-view__theme-toggle button {
  background: var(--track-bg);
  border: none;
  color: inherit;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.7;
}

.settings-view__theme-toggle button.is-active {
  opacity: 1;
  background: var(--accent-color);
}

.about-view__name {
  font-weight: 600;
  margin-bottom: 4px;
}

.about-view__version {
  opacity: 0.6;
  font-size: 0.85em;
  margin-bottom: 12px;
}

.about-view__description {
  font-size: 0.9em;
  margin-bottom: 12px;
}

.about-view__contact {
  color: var(--accent-color);
  text-decoration: none;
  font-size: 0.9em;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.css
git commit -m "feat: CSS custom properties for theme/accent/font, new view classes"
```

---

### Task 5: Extract UsageView component

**Files:**
- Create: `src/components/UsageView.tsx`

**Interfaces:**
- Consumes: `UsageState` (Task 1), `formatRelativeTime` (existing, `../shared/format`), `UsageBar` (existing, `./UsageBar`).
- Produces: `UsageView({ state }: { state: UsageState }): JSX.Element` — the usage-bars body, extracted from the current `WidgetPanel`, minus the autostart checkbox (moved to `SettingsView` in Task 6).

Not wired into `WidgetPanel` yet (that's Task 8) — this task just creates the file. No test file (matches existing convention: `UsageBar.tsx` has no test either).

- [ ] **Step 1: Create `src/components/UsageView.tsx`**

```tsx
import type { UsageState } from '../shared/types'
import { formatRelativeTime } from '../shared/format'
import { UsageBar } from './UsageBar'

export function UsageView({ state }: { state: UsageState }) {
  const fiveHour = state.windows.find((w) => w.id === 'five_hour')
  const weekly = state.windows.find((w) => w.id === 'weekly')
  return (
    <>
      {fiveHour && <UsageBar window={fiveHour} />}
      {weekly && <UsageBar window={weekly} />}
      {state.windows.length === 0 && (
        <div className="widget-panel__empty">No usage data yet — open a Claude Code session to populate this.</div>
      )}
      {state.cacheUpdatedAt && (
        <div className="widget-panel__freshness">Data as of {formatRelativeTime(state.cacheUpdatedAt)}</div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify it compiles standalone**

Run: `npx tsc -p tsconfig.json --noEmit 2>&1 | grep UsageView.tsx`
Expected: no output (this file alone has no type errors; unrelated pre-existing errors in other not-yet-migrated files are expected and ignored per the Global Constraints note)

- [ ] **Step 3: Commit**

```bash
git add src/components/UsageView.tsx
git commit -m "feat: extract UsageView component from WidgetPanel"
```

---

### Task 6: Build SettingsView component

**Files:**
- Create: `src/components/SettingsView.tsx`

**Interfaces:**
- Consumes: `AppSettings` (Task 1).
- Produces: `SettingsView({ settings, onUpdate }: { settings: AppSettings; onUpdate: (patch: Partial<AppSettings>) => void }): JSX.Element`.

Not wired into `WidgetPanel` yet (Task 8). No test file (no component-render test setup — see Global Constraints).

- [ ] **Step 1: Create `src/components/SettingsView.tsx`**

```tsx
import type { AppSettings } from '../shared/types'

const FONT_FAMILIES: Array<{ value: AppSettings['fontFamily']; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'monospace', label: 'Monospace' },
  { value: 'serif', label: 'Serif' },
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
        </div>
      </div>
      <label className="settings-view__row">
        <span>Accent color</span>
        <input type="color" value={settings.accentColor} onChange={(e) => onUpdate({ accentColor: e.target.value })} />
      </label>
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
```

- [ ] **Step 2: Verify it compiles standalone**

Run: `npx tsc -p tsconfig.json --noEmit 2>&1 | grep SettingsView.tsx`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsView.tsx
git commit -m "feat: add SettingsView component (theme, accent color, font, start-at-login)"
```

---

### Task 7: Build AboutView component

**Files:**
- Create: `src/components/AboutView.tsx`

**Interfaces:**
- Consumes: nothing beyond a plain string prop.
- Produces: `AboutView({ appVersion }: { appVersion: string }): JSX.Element`.

Not wired into `WidgetPanel` yet (Task 8). No test file (see Global Constraints).

- [ ] **Step 1: Create `src/components/AboutView.tsx`**

```tsx
export function AboutView({ appVersion }: { appVersion: string }) {
  return (
    <div className="about-view">
      <div className="about-view__name">token-pulse</div>
      <div className="about-view__version">Version {appVersion}</div>
      <p className="about-view__description">Shows your Claude usage limits from the menu bar.</p>
      <a className="about-view__contact" href="mailto:mithatkonuk@gmail.com">
        mithatkonuk@gmail.com
      </a>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles standalone**

Run: `npx tsc -p tsconfig.json --noEmit 2>&1 | grep AboutView.tsx`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/components/AboutView.tsx
git commit -m "feat: add AboutView component (app name, version, contact email)"
```

---

### Task 8: Wire WidgetPanel container (navigation + theme application)

**Files:**
- Modify: `src/components/WidgetPanel.tsx`

**Interfaces:**
- Consumes: `UsageState`, `AppSettings` (Task 1); `UsageView` (Task 5), `SettingsView` (Task 6), `AboutView` (Task 7).
- Produces: `WidgetPanel({ state }: { state: UsageState | null }): JSX.Element` — same external signature as before (no callers change), now internally holding `view` state and applying `data-theme` + accent/font CSS variables to its root element.

This is the task where the project should return to a fully compiling state — see Step 3.

- [ ] **Step 1: Replace `src/components/WidgetPanel.tsx`**

```tsx
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
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all test files — `settingsStore`, `trayIcon`, `urgencyColor`, `format`, `provider`, `autostart`)

- [ ] **Step 3: Run whole-project type check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS with no errors (this is the point where the whole project should compile cleanly again — every file touched by Tasks 1–8 is now consistent)

- [ ] **Step 4: Commit**

```bash
git add src/components/WidgetPanel.tsx
git commit -m "feat: wire About/Settings navigation into WidgetPanel"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: PASS, all test files green

- [ ] **Step 2: Run full type check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS, no errors

- [ ] **Step 3: Manual visual check in the dev server**

Run: `npm run dev`, open the tray popup, and confirm:
- Clicking ⚙ shows Settings with Dark/Light toggle, accent-color picker, font family/size selects, and the Start at login checkbox (now removed from the Usage view).
- Changing theme/accent/font visibly updates the panel; changing font size changes text size; switching to Light shows a light background/text.
- Clicking ⓘ shows "token-pulse", the version number, and `mithatkonuk@gmail.com` as a clickable mail link.
- The ← control returns to the Usage view from both Settings and About, and the usage bars/freshness note still render correctly there.
- Quit the app and relaunch `npm run dev` — the chosen theme/accent/font/start-at-login persist (confirms `settings.json` round-trip).

If running on macOS: toggle System Settings → Appearance between Light and Dark while the app is running, wait up to ~5s (one poll cycle), and confirm the tray icon's normal-state ring color swaps between white (dark menu bar) and dark blue (light menu bar) — independent of whatever theme is chosen inside the popup's own Settings view.

- [ ] **Step 4: Report results**

Summarize to the user: test suite pass/fail counts, tsc result, and the outcome of each manual check above (or note if the sandbox has no display and this step needs the user to verify locally, consistent with prior sessions' handling of visual-only checks for this Electron app).
