# About + Settings sections — design

## Goal

Add an "About" view (app name, version, contact email `mithatkonuk@gmail.com`) and a
"Settings" view (theme, accent color, font family/size, start-at-login) to the
token-pulse tray popup, which today is a single fixed panel with no navigation.
Also: make the tray icon's normal-state fill color adapt to the OS light/dark
appearance for legibility against the menu bar.

## 1. Navigation

The header gains two small icon buttons (⚙ settings, ⓘ about) next to the existing
model/tier text. Clicking one swaps the panel body from the Usage view to the
Settings or About view; clicking it again (or a ← back control) returns to Usage.
Only one view is shown at a time — no tabs, no scrolling — the popup stays a small,
fixed-size window.

## 2. Settings data model & persistence

`AppSettings` (`src/main/settingsStore.ts`) grows from `{ startAtLogin }` to:

```ts
interface AppSettings {
  startAtLogin: boolean
  theme: 'dark' | 'light'
  accentColor: string        // hex, e.g. '#0a84ff'
  fontFamily: 'system' | 'monospace' | 'serif'
  fontSize: 'small' | 'medium' | 'large'
}
```

Defaults match today's look exactly (`dark`, `#0a84ff`, `system`, `medium`) — installing
the update changes nothing visually until the user opens Settings. All fields persist
to the same `settings.json` file `startAtLogin` already uses.

`UsageState` (`src/shared/types.ts`) gains:
- `settings: AppSettings`
- `appVersion: string` (from `app.getVersion()`, read once at startup)

so the renderer gets everything it needs for both new views from the existing
`usage:get` / `usage:update` payload — no extra IPC round-trip.

A single new IPC handler `settings:update` replaces the narrower
`settings:setStartAtLogin` and accepts a `Partial<AppSettings>` patch, so one handler
covers the checkbox, theme toggle, color picker, and both font dropdowns.

## 3. Applying settings to the UI

`App.css` moves from hardcoded values to CSS custom properties (`--accent-color`,
`--font-family`, `--font-size`) plus a `[data-theme="light"]` override block for the
light palette (background/text/track colors). `WidgetPanel` sets `data-theme` and the
inline CSS-variable overrides on its root element from `state.settings`. Plain CSS
custom properties — no theming library.

Font family maps to real stacks: `system` → current `-apple-system, ...` stack,
`monospace` → `ui-monospace, SFMono-Regular, ...`, `serif` → `Georgia, 'Times New
Roman', serif`. Font size maps to three px values (12/13/15).

The tray *icon* (16px canvas, rendered via `renderUsageRingPng`) is explicitly **not**
affected by this accent-color setting — see §5. It's a different rendering path
(pixel buffer, not styled text) and keeping it fixed avoids coupling the OS menu-bar
legibility logic to a user-chosen accent color.

## 4. About view

Static content: app name ("token-pulse"), version (from the new `appVersion` state
field), a one-line description, and the contact email `mithatkonuk@gmail.com` as a
`mailto:` link. No GitHub/repo link — `package.json` has no `repository` field.

## 5. Settings view controls

- Theme: two-option toggle (Dark / Light) — affects the popup panel only.
- Accent color: native `<input type="color">` (no extra dependency).
- Font family: `<select>` with the three presets.
- Font size: `<select>` with the three presets.
- Start at login: existing checkbox, moved here verbatim, now wired to
  `settings:update` instead of the old dedicated `settings:setStartAtLogin` handler.

Each control fires `settings:update` with just its own changed field.

## 6. Tray icon reacts to OS light/dark appearance

Separate from the app's own `theme` setting above — this is about the tray icon
staying legible against the actual menu bar. Only the "normal" (below-80%, currently
dark navy `[0,0,139,255]`) fill color changes:

- **White** `[255,255,255,255]` when the OS is in dark mode
- **Dark blue** `[0,0,139,255]` (unchanged) when the OS is in light mode

Yellow (80%+) and red (90%+) urgency colors are unchanged — those need to stay
attention-grabbing regardless of OS theme, not blend in.

`renderUsageRingPng(percentUsed, size, isSystemDarkMode)` takes a new boolean param
and picks the "blue" RGBA accordingly; the function stays pure/Electron-free (no
`nativeTheme` import inside `src/main/trayIcon.ts`) so it's still unit-testable without
the Electron runtime. `electron/tray.ts` reads `nativeTheme.shouldUseDarkColors` and
passes it in on every `updateTrayIcon` call — which already happens on every ~5s poll
cycle, so an OS theme switch is picked up within one poll with no extra listener.

## 7. Testing

- `settingsStore.test.ts`: new/updated coverage for the expanded `AppSettings`
  defaults and merge behavior (old settings.json files missing the new fields still
  load with correct defaults).
- `trayIcon.test.ts`: updated/new cases for `isSystemDarkMode` true/false producing
  white vs. dark-blue "normal" fill, with yellow/red unaffected.
- Renderer: view-switching test (Usage ↔ Settings ↔ About) and a test confirming a
  settings control calls `ipcRenderer.invoke('settings:update', <patch>)` with the
  correct partial payload.
- `urgencyColor.test.ts`: unchanged (out of scope — thresholds/colors for the *usage
  bar* urgency mapping aren't touched by this work).
- `autostart.ts`: remains untested per existing project convention (Electron-runtime
  glue not meaningfully testable without the Electron runtime).

## Out of scope

- GitHub/repo link in About (no repository configured).
- Live OS-theme-change listener for the tray icon (poll cadence is fast enough).
- Accent color or theme affecting the tray icon itself.
- Adjustable urgency thresholds (80%/90%) — explicitly deferred by the user during
  design.
