# Unavailable-Source Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Claude source behave like Cursor already does — probed for availability once at startup, only registered if usable — and add an explicit, honest empty state (tray + popup) for the case where no supported AI tool is found at all.

**Architecture:** Add `isAvailable(): boolean` to the `UsageProvider` interface. `ClaudeCodeProvider` implements it via a cheap PATH probe (no subprocess spawn); `CursorProvider` implements it via the existing access-token check. `electron/main.ts` builds its `sources` array uniformly from both providers' `isAvailable()` results instead of special-casing Cursor. `AppState.activeSourceId` becomes `string | null` to represent "no source registered," threaded through the tray (neutral icon, no percentage) and the popup panel (a dedicated empty-state message instead of usage bars).

**Tech Stack:** TypeScript, Electron (main process), React (renderer), Vitest + Testing Library.

## Global Constraints

- Spec doc: `docs/superpowers/specs/2026-08-13-unavailable-source-handling-design.md` — this plan implements it verbatim; refer back to it for rationale.
- Availability is probed once at startup and cached for the process lifetime — no hot-reload / re-probing mid-session (explicitly out of scope per spec).
- Claude and Cursor go through **identical** registration logic in `main.ts` — no special-casing either one.
- The zero-sources empty state only ever triggers when `sources.length === 0` at startup. Any single- or dual-source case is unaffected — behaves exactly as today.
- No E2E/Playwright coverage — matches this project's existing test depth (Vitest unit tests only).
- Follow existing code conventions: comments only where the *why* isn't obvious from the code (see e.g. the existing comment style in `electron/main.ts` and `electron/tray.ts`).

---

### Task 1: Claude CLI PATH-probe helper

**Files:**
- Modify: `src/providers/claude-code/usageCommand.ts`
- Test: `tests/usageCommand.test.ts`

**Interfaces:**
- Produces: `resolveExecutableOnPath(name: string, pathString: string): string | null` — exported, pure, no side effects beyond `fs.accessSync` reads.
- Produces: `isClaudeCliAvailable(): boolean` — exported, calls `resolveExecutableOnPath('claude', buildAugmentedPath())` internally (`buildAugmentedPath` already exists in this file, unexported).

- [ ] **Step 1: Write the failing tests**

Add to `tests/usageCommand.test.ts` (it already imports `fs`, `os`, `path` at the top — reuse them; add `resolveExecutableOnPath, isClaudeCliAvailable` to the existing `import { parseUsageOutput, runUsageCommand } from '../src/providers/claude-code/usageCommand'` line):

```ts
describe('resolveExecutableOnPath', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-path-test-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('finds an executable file in one of the path directories', () => {
    const binPath = path.join(dir, 'claude')
    fs.writeFileSync(binPath, '#!/bin/sh\n')
    fs.chmodSync(binPath, 0o755)
    const pathString = ['/definitely-not-a-real-dir', dir].join(path.delimiter)
    expect(resolveExecutableOnPath('claude', pathString)).toBe(binPath)
  })

  it('returns null when the executable is not found in any directory', () => {
    const pathString = ['/definitely-not-a-real-dir', dir].join(path.delimiter)
    expect(resolveExecutableOnPath('claude', pathString)).toBeNull()
  })

  it('returns null when a matching file exists but is not executable', () => {
    const binPath = path.join(dir, 'claude')
    fs.writeFileSync(binPath, '#!/bin/sh\n')
    fs.chmodSync(binPath, 0o644)
    expect(resolveExecutableOnPath('claude', dir)).toBeNull()
  })

  it('skips empty PATH segments', () => {
    const binPath = path.join(dir, 'claude')
    fs.writeFileSync(binPath, '#!/bin/sh\n')
    fs.chmodSync(binPath, 0o755)
    const pathString = ['', dir, ''].join(path.delimiter)
    expect(resolveExecutableOnPath('claude', pathString)).toBe(binPath)
  })
})

describe('isClaudeCliAvailable', () => {
  const originalPath = process.env.PATH

  afterEach(() => {
    process.env.PATH = originalPath
  })

  it('returns true when claude is found on PATH', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-claude-cli-test-'))
    const binPath = path.join(dir, 'claude')
    fs.writeFileSync(binPath, '#!/bin/sh\n')
    fs.chmodSync(binPath, 0o755)
    process.env.PATH = dir
    expect(isClaudeCliAvailable()).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns false when claude is not found anywhere on PATH', () => {
    process.env.PATH = '/definitely-not-a-real-dir'
    expect(isClaudeCliAvailable()).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/usageCommand.test.ts`
Expected: FAIL — `resolveExecutableOnPath` and `isClaudeCliAvailable` are not exported yet (import error / undefined).

- [ ] **Step 3: Implement the helper functions**

In `src/providers/claude-code/usageCommand.ts`, add after `buildAugmentedPath` (which already exists — do not duplicate it):

```ts
export function resolveExecutableOnPath(name: string, pathString: string): string | null {
  for (const dir of pathString.split(path.delimiter)) {
    if (!dir) {
      continue
    }
    const candidate = path.join(dir, name)
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      // Not here — keep looking.
    }
  }
  return null
}

export function isClaudeCliAvailable(): boolean {
  return resolveExecutableOnPath('claude', buildAugmentedPath()) !== null
}
```

`fs` and `path` are already imported at the top of this file — no new imports needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/usageCommand.test.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Commit**

```bash
cd /Users/mko/realm/personal/token-pulse
git add src/providers/claude-code/usageCommand.ts tests/usageCommand.test.ts
git commit -m "feat: add Claude CLI PATH-probe helper (isClaudeCliAvailable)"
```

---

### Task 2: `isAvailable()` on `UsageProvider`, `ClaudeCodeProvider`, `CursorProvider`

**Files:**
- Modify: `src/providers/types.ts`
- Modify: `src/providers/claude-code/index.ts`
- Modify: `src/providers/cursor/index.ts`
- Create: `tests/claudeCodeProvider.test.ts`
- Modify: `tests/cursorProvider.test.ts`

**Interfaces:**
- Consumes: `isClaudeCliAvailable` from `../providers/claude-code/usageCommand` (Task 1).
- Produces: `UsageProvider.isAvailable(): boolean` (interface method, both providers implement it).
- Produces: `ClaudeCodeProviderOptions.isAvailableFn?: () => boolean` (new injectable option, defaults to `isClaudeCliAvailable`).

- [ ] **Step 1: Write the failing tests**

Create `tests/claudeCodeProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ClaudeCodeProvider } from '../src/providers/claude-code'

describe('ClaudeCodeProvider.isAvailable', () => {
  it('returns true when the injected availability check returns true', () => {
    const provider = new ClaudeCodeProvider({ isAvailableFn: () => true })
    expect(provider.isAvailable()).toBe(true)
  })

  it('returns false when the injected availability check returns false', () => {
    const provider = new ClaudeCodeProvider({ isAvailableFn: () => false })
    expect(provider.isAvailable()).toBe(false)
  })
})
```

Add to `tests/cursorProvider.test.ts` (append a new `describe` block at the end of the file, after the existing ones):

```ts
describe('CursorProvider.isAvailable', () => {
  it('returns true when an access token is present', () => {
    const provider = new CursorProvider({ readAccessTokenFn: () => 'fake-token' })
    expect(provider.isAvailable()).toBe(true)
  })

  it('returns false when there is no access token', () => {
    const provider = new CursorProvider({ readAccessTokenFn: () => null })
    expect(provider.isAvailable()).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/claudeCodeProvider.test.ts tests/cursorProvider.test.ts`
Expected: FAIL — `isAvailable` doesn't exist on either provider yet, and `ClaudeCodeProviderOptions` doesn't accept `isAvailableFn` (TypeScript error / runtime `is not a function`).

- [ ] **Step 3: Implement `isAvailable()` on both providers**

In `src/providers/types.ts`, add to the `UsageProvider` interface:

```ts
export interface UsageProvider {
  isAvailable(): boolean
  getWatchedPaths(): string[]
  getPlanTier(): string | null
  getCachedUsage(): CachedUsage
  getUsageFromCommand(cwd: string): Promise<CommandUsageResult | null>
}
```

In `src/providers/claude-code/index.ts`:
- Change the import line to include the new helper:
  ```ts
  import { parseUsageOutput, runUsageCommand, isClaudeCliAvailable } from './usageCommand'
  ```
- Add `isAvailableFn?: () => boolean` to `ClaudeCodeProviderOptions`.
- Add a `private readonly isAvailableFn: () => boolean` field, set in the constructor: `this.isAvailableFn = options.isAvailableFn ?? isClaudeCliAvailable`.
- Add the method (anywhere among the other public methods, e.g. right before `getWatchedPaths`):
  ```ts
  isAvailable(): boolean {
    return this.isAvailableFn()
  }
  ```

In `src/providers/cursor/index.ts`, add the method (e.g. right before `getWatchedPaths`):

```ts
isAvailable(): boolean {
  return this.readAccessTokenFn() !== null
}
```

No new option needed for Cursor — it reuses the existing injectable `readAccessTokenFn`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/claudeCodeProvider.test.ts tests/cursorProvider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mko/realm/personal/token-pulse
git add src/providers/types.ts src/providers/claude-code/index.ts src/providers/cursor/index.ts tests/claudeCodeProvider.test.ts tests/cursorProvider.test.ts
git commit -m "feat: add isAvailable() to UsageProvider, ClaudeCodeProvider, CursorProvider"
```

---

### Task 3: `trayTitleFor` pure helper (null-percent → blank title)

**Files:**
- Modify: `src/main/trayTitle.ts`
- Test: `tests/trayTitle.test.ts`

**Interfaces:**
- Consumes: `formatTrayTitle`, `TrayWindowLabel` (already in this file).
- Produces: `trayTitleFor(percentUsed: number | null, windowLabel?: TrayWindowLabel): string` — exported.

- [ ] **Step 1: Write the failing test**

Add to `tests/trayTitle.test.ts` (append after the existing `describe('trayWindowLabelForWindowId', ...)` block; add `trayTitleFor` to the existing import line):

```ts
describe('trayTitleFor', () => {
  it('returns an empty string when percentUsed is null (no source available)', () => {
    expect(trayTitleFor(null)).toBe('')
  })

  it('delegates to formatTrayTitle when percentUsed is a number', () => {
    expect(trayTitleFor(63, 'five_hour')).toBe(' 63% 5h')
  })

  it('delegates to formatTrayTitle with no label when none is given', () => {
    expect(trayTitleFor(0)).toBe(' 0%')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/trayTitle.test.ts`
Expected: FAIL — `trayTitleFor` is not exported yet.

- [ ] **Step 3: Implement `trayTitleFor`**

In `src/main/trayTitle.ts`, add at the end of the file:

```ts
export function trayTitleFor(percentUsed: number | null, windowLabel: TrayWindowLabel = null): string {
  return percentUsed === null ? '' : formatTrayTitle(percentUsed, windowLabel)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/trayTitle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mko/realm/personal/token-pulse
git add src/main/trayTitle.ts tests/trayTitle.test.ts
git commit -m "feat: add trayTitleFor helper for the no-source tray state"
```

---

### Task 4: `tray.ts` — nullable percent in `updateTrayIcon`, `hasAvailableSource` in `createTray`

**Files:**
- Modify: `electron/tray.ts`

**Interfaces:**
- Consumes: `trayTitleFor` from `../src/main/trayTitle` (Task 3).
- Produces: `updateTrayIcon(percentUsed: number | null, isDarkMode: boolean, windowLabel?: TrayWindowLabel): void` — signature widened from `number` to `number | null`. Existing callers passing a plain `number` remain valid (no breaking change at call sites).
- Produces: `createTray(onClick, onShowView, isDarkMode: boolean, hasAvailableSource: boolean): Tray` — new 4th required parameter.

This task has no dedicated unit test of its own — `createTray`/`updateTrayIcon` require a real Electron `Tray`, which isn't unit-testable in this codebase (no existing tests do so either; the pure decision logic they depend on, `trayTitleFor`, is already covered by Task 3). Verify via the full test suite (Step 3 below) and TypeScript compilation, consistent with how `electron/main.ts` and `electron/tray.ts` are treated elsewhere in this codebase.

- [ ] **Step 1: Update the import**

In `electron/tray.ts`, replace:

```ts
import { formatTrayTitle, type TrayWindowLabel } from '../src/main/trayTitle'
```

with:

```ts
import { trayTitleFor, type TrayWindowLabel } from '../src/main/trayTitle'
```

- [ ] **Step 2: Update `createTray` and `updateTrayIcon`**

Replace the body of `createTray` from `tray.setToolTip('token-pulse')` through the `setTitle` block:

```ts
export function createTray(
  onClick: (tray: Tray) => void,
  onShowView: (tray: Tray, view: TrayPanelView) => void,
  isDarkMode: boolean,
  hasAvailableSource: boolean
): Tray {
  tray = new Tray(nativeImage.createFromBuffer(renderUsageRingPng(0, ICON_SIZE, isDarkMode)))
  tray.setToolTip('token-pulse')
  // Placeholder shown before the first real usage-command poll resolves. When at least one
  // source is registered, the tray's primary metric is always the five-hour window, so label
  // it as such from the start; when no source is available at all, leave the title blank
  // instead of showing a misleading 0%.
  updateTrayIcon(hasAvailableSource ? 0 : null, isDarkMode, hasAvailableSource ? 'five_hour' : null)
  const menu = Menu.buildFromTemplate([
```

(keep the rest of the `Menu.buildFromTemplate(...)` call and everything after it in `createTray` unchanged).

Replace `updateTrayIcon`:

```ts
export function updateTrayIcon(percentUsed: number | null, isDarkMode: boolean, windowLabel: TrayWindowLabel = null): void {
  // A watcher/interval callback can still be in flight when quit tears down the native Tray —
  // the module-level reference stays non-null, so `isDestroyed()` is the only real guard.
  if (!tray || tray.isDestroyed()) {
    return
  }
  tray.setImage(nativeImage.createFromBuffer(renderUsageRingPng(percentUsed ?? 0, ICON_SIZE, isDarkMode)))
  if (process.platform === 'darwin') {
    tray.setTitle(trayTitleFor(percentUsed, windowLabel))
  }
}
```

- [ ] **Step 3: Run the full test suite and TypeScript check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: `electron/main.ts` will now fail to compile — its `createTray(...)` call is missing the new 4th argument, and `updateTrayIcon(primaryWindow.percentUsed, ...)` still typechecks fine (a `number` is a valid `number | null`). The `createTray` call site error is expected here and gets fixed in Task 7 — confirm the *only* new compile error is that missing-argument error at the `createTray` call site in `electron/main.ts`, nothing else.

- [ ] **Step 4: Commit**

```bash
cd /Users/mko/realm/personal/token-pulse
git add electron/tray.ts
git commit -m "feat: support a nullable percent in updateTrayIcon for the no-source tray state"
```

---

### Task 5: `AppState.activeSourceId` becomes nullable; `SourceSelector` accepts it

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/components/SourceSelector.tsx`
- Modify: `tests/SourceSelector.test.tsx`

**Interfaces:**
- Produces: `AppState.activeSourceId: string | null` (was `string`).
- Produces: `SourceSelector` prop `activeSourceId: string | null` (was `string`).

- [ ] **Step 1: Write the failing test**

Add to `tests/SourceSelector.test.tsx` (append at the end, inside the `describe('SourceSelector', ...)` block):

```ts
  it('renders the plain-text empty state when there are no sources at all', () => {
    render(
      <SourceSelector sources={[]} activeSourceId={null} activeSourceLabel="" currentModel={null} onSelect={() => {}} />
    )
    expect(screen.getByText('No recent activity')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/SourceSelector.test.tsx`
Expected: FAIL — TypeScript error, `activeSourceId={null}` not assignable to the current `string` prop type.

- [ ] **Step 3: Widen the types**

In `src/shared/types.ts`, change:

```ts
export interface AppState {
  sources: SourceDescriptor[]
  activeSourceId: string
  usageBySource: Record<string, SourceUsage>
  settings: AppSettings
  appVersion: string
}
```

to:

```ts
export interface AppState {
  sources: SourceDescriptor[]
  activeSourceId: string | null
  usageBySource: Record<string, SourceUsage>
  settings: AppSettings
  appVersion: string
}
```

In `src/components/SourceSelector.tsx`, change the `activeSourceId` prop type from `string` to `string | null` (in the destructured props type annotation).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/SourceSelector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mko/realm/personal/token-pulse
git add src/shared/types.ts src/components/SourceSelector.tsx tests/SourceSelector.test.tsx
git commit -m "feat: widen AppState.activeSourceId to string | null"
```

---

### Task 6: `NoSourceAvailable` empty state in `WidgetPanel`

**Files:**
- Create: `src/components/NoSourceAvailable.tsx`
- Modify: `src/components/WidgetPanel.tsx`
- Modify: `tests/WidgetPanel.test.tsx`

**Interfaces:**
- Consumes: `AppState.activeSourceId: string | null` (Task 5).
- Produces: `NoSourceAvailable` React component (no props).

- [ ] **Step 1: Write the failing test**

Add to `tests/WidgetPanel.test.tsx` (append inside the `describe('WidgetPanel', ...)` block):

```ts
  it('shows the no-source empty state when activeSourceId is null', () => {
    const state = baseState()
    state.sources = []
    state.activeSourceId = null
    state.usageBySource = {}
    render(<WidgetPanel state={state} />)
    expect(screen.getByText(/No supported AI tool found/)).toBeInTheDocument()
  })

  it('shows the usage view (not the empty state) when a source is active', () => {
    render(<WidgetPanel state={baseState()} />)
    expect(screen.queryByText(/No supported AI tool found/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/WidgetPanel.test.tsx`
Expected: FAIL — first test fails with a TypeScript error on `state.activeSourceId = null` if Task 5 wasn't done first (it was), or with "No supported AI tool found" text not found (component doesn't exist / isn't wired in yet), and a runtime crash reading `.currentModel` off `undefined` `activeUsage`.

- [ ] **Step 3: Create the empty-state component**

Create `src/components/NoSourceAvailable.tsx`:

```tsx
export function NoSourceAvailable() {
  return (
    <div className="widget-panel__empty">No supported AI tool found. Install Claude Code or Cursor to see usage here.</div>
  )
}
```

(Reuses the existing `.widget-panel__empty` CSS class already defined in `src/App.css` and used the same way in `UsageView.tsx` — no new CSS needed.)

- [ ] **Step 4: Wire it into `WidgetPanel`**

In `src/components/WidgetPanel.tsx`:
- Add the import: `import { NoSourceAvailable } from './NoSourceAvailable'`
- Replace:
  ```ts
  const activeUsage = state.usageBySource[state.activeSourceId]
  const activeSourceLabel = state.sources.find((s) => s.id === state.activeSourceId)?.label ?? ''
  ```
  with:
  ```ts
  const activeUsage = state.activeSourceId ? state.usageBySource[state.activeSourceId] : undefined
  const activeSourceLabel = state.activeSourceId
    ? (state.sources.find((s) => s.id === state.activeSourceId)?.label ?? '')
    : ''
  ```
- Replace the `currentModel={activeUsage.currentModel}` prop on `<SourceSelector>` with `currentModel={activeUsage?.currentModel ?? null}`.
- Replace `{view === 'usage' && <UsageView state={activeUsage} />}` with:
  ```tsx
  {view === 'usage' && (activeUsage ? <UsageView state={activeUsage} /> : <NoSourceAvailable />)}
  ```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/WidgetPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/mko/realm/personal/token-pulse
git add src/components/NoSourceAvailable.tsx src/components/WidgetPanel.tsx tests/WidgetPanel.test.tsx
git commit -m "feat: show a no-source empty state in the popup panel"
```

---

### Task 7: Wire it all up in `electron/main.ts`

**Files:**
- Modify: `electron/main.ts`

**Interfaces:**
- Consumes: `UsageProvider.isAvailable()` (Task 2), `updateTrayIcon(percentUsed: number | null, ...)` and `createTray(..., hasAvailableSource: boolean)` (Task 4), `AppState.activeSourceId: string | null` (Task 5).

This task has no dedicated unit test — `main.ts` is the Electron entry point and isn't unit-tested directly in this codebase (existing coverage comes from the modules it composes, all already tested in Tasks 1–6). Verify via full test suite + TypeScript compilation (Step 5), which also confirms the Task 4 compile error is now resolved.

- [ ] **Step 1: Remove the Cursor-specific availability check and unify source registration**

Remove the import (no longer used directly in this file):

```ts
import { readCursorAccessToken } from '../src/providers/cursor/cursorAuth'
```

Replace:

```ts
// Cursor is only registered if a token is actually present, so a machine without Cursor
// installed/logged in still shows the single-source (no dropdown) experience unchanged.
const cursorAvailable = readCursorAccessToken() !== null

const sources: SourceRuntime[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    provider: new ClaudeCodeProvider(),
    lastActivityAt: Date.now(),
    lastRefreshAt: 0,
    consecutiveFailures: 0,
    refreshInFlight: false,
    resetRefreshTimer: null,
  },
  ...(cursorAvailable
    ? [
        {
          id: 'cursor',
          label: 'Cursor',
          provider: new CursorProvider(),
          activeIntervalMs: CURSOR_ACTIVE_INTERVAL_MS,
          lastActivityAt: Date.now(),
          lastRefreshAt: 0,
          consecutiveFailures: 0,
          refreshInFlight: false,
          resetRefreshTimer: null,
        },
      ]
    : []),
]
```

with:

```ts
interface SourceConfig {
  id: string
  label: string
  provider: UsageProvider
  activeIntervalMs?: number
}

// Both providers are probed for availability the same way — no special-casing either one.
// A provider not being available (Claude CLI missing, Cursor not installed/logged in) means
// it's simply never registered, exactly like Cursor already behaved before this change.
const sourceConfigs: SourceConfig[] = [
  { id: 'claude', label: 'Claude Code', provider: new ClaudeCodeProvider() },
  { id: 'cursor', label: 'Cursor', provider: new CursorProvider(), activeIntervalMs: CURSOR_ACTIVE_INTERVAL_MS },
]

const sources: SourceRuntime[] = sourceConfigs
  .filter((config) => config.provider.isAvailable())
  .map((config) => ({
    id: config.id,
    label: config.label,
    provider: config.provider,
    activeIntervalMs: config.activeIntervalMs,
    lastActivityAt: Date.now(),
    lastRefreshAt: 0,
    consecutiveFailures: 0,
    refreshInFlight: false,
    resetRefreshTimer: null,
  }))
```

- [ ] **Step 2: Make `activeSourceId` nullable in the initial state**

Replace:

```ts
let state: AppState = {
  sources: sources.map((s) => ({ id: s.id, label: s.label })),
  activeSourceId: 'claude',
  usageBySource: Object.fromEntries(sources.map((s) => [s.id, emptySourceUsage()])),
  settings: readSettings(SETTINGS_PATH),
  appVersion: app.getVersion(),
}
```

with:

```ts
let state: AppState = {
  sources: sources.map((s) => ({ id: s.id, label: s.label })),
  activeSourceId: sources[0]?.id ?? null,
  usageBySource: Object.fromEntries(sources.map((s) => [s.id, emptySourceUsage()])),
  settings: readSettings(SETTINGS_PATH),
  appVersion: app.getVersion(),
}
```

- [ ] **Step 3: Update `pushState` to handle the no-source case**

Replace:

```ts
function pushState(): void {
  const activeUsage = state.usageBySource[state.activeSourceId]
  // The tray is a 5h-at-a-glance indicator — weekly (and any other window) is only ever shown
  // inside the popup panel, never as a tray fallback. If a poll doesn't have a five_hour window
  // (Claude) this round, leave the tray showing whatever it last displayed rather than swapping
  // to weekly; non-Claude sources (e.g. Cursor's billing_cycle) still get their own window shown.
  const primaryWindow =
    activeUsage.windows.find((w) => w.id === 'five_hour') ?? activeUsage.windows.find((w) => w.id !== 'weekly')
  if (primaryWindow) {
    const windowLabel = trayWindowLabelForWindowId(primaryWindow.id)
    updateTrayIcon(primaryWindow.percentUsed, nativeTheme.shouldUseDarkColors, windowLabel)
  }
  const popup = getPopupIfExists()
  if (popup && !popup.isDestroyed() && popup.isVisible()) {
    popup.webContents.send('usage:update', state)
  }
}
```

with:

```ts
function pushState(): void {
  if (state.activeSourceId === null) {
    // No provider was available at startup — show the neutral no-source tray state rather
    // than leaving whatever the tray happened to be showing before.
    updateTrayIcon(null, nativeTheme.shouldUseDarkColors)
  } else {
    const activeUsage = state.usageBySource[state.activeSourceId]
    // The tray is a 5h-at-a-glance indicator — weekly (and any other window) is only ever shown
    // inside the popup panel, never as a tray fallback. If a poll doesn't have a five_hour window
    // (Claude) this round, leave the tray showing whatever it last displayed rather than swapping
    // to weekly; non-Claude sources (e.g. Cursor's billing_cycle) still get their own window shown.
    const primaryWindow =
      activeUsage.windows.find((w) => w.id === 'five_hour') ?? activeUsage.windows.find((w) => w.id !== 'weekly')
    if (primaryWindow) {
      const windowLabel = trayWindowLabelForWindowId(primaryWindow.id)
      updateTrayIcon(primaryWindow.percentUsed, nativeTheme.shouldUseDarkColors, windowLabel)
    }
  }
  const popup = getPopupIfExists()
  if (popup && !popup.isDestroyed() && popup.isVisible()) {
    popup.webContents.send('usage:update', state)
  }
}
```

- [ ] **Step 4: Pass `hasAvailableSource` to `createTray`**

Replace the `createTray` call's closing line:

```ts
  }, nativeTheme.shouldUseDarkColors)
```

with:

```ts
  }, nativeTheme.shouldUseDarkColors, sources.length > 0)
```

(This is the line right after the second callback's closing `}` — the one immediately following `win.webContents.send('popup:show-view', view) } }` — do not confuse it with any other closing brace in that block.)

- [ ] **Step 5: Run the full test suite and TypeScript check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS with zero errors — this resolves the expected Task 4 compile error and introduces no new ones.

- [ ] **Step 6: Commit**

```bash
cd /Users/mko/realm/personal/token-pulse
git add electron/main.ts
git commit -m "feat: register sources via isAvailable() and handle the no-source state end-to-end"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing ~159 plus the new ones added in Tasks 1–6).

- [ ] **Step 2: Run TypeScript strict compilation**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: Zero errors.

- [ ] **Step 4: Manual smoke test — normal case unaffected**

Run: `npm run dev` (or the project's usual dev-launch command) with Claude CLI actually installed and on PATH. Confirm:
- Tray shows a real percentage with "5h" suffix, same as before this change.
- Popup panel shows usage bars, same as before this change.

- [ ] **Step 5: Manual smoke test — Claude unavailable**

Temporarily rename or shadow the `claude` binary so it's off PATH (e.g. `PATH=/usr/bin:/bin npm run dev`, assuming `claude` isn't in those two dirs — adjust if it is), launch the app, and confirm:
- If Cursor is also unavailable on this machine: tray shows a plain icon with no percentage title; clicking it opens the popup, which shows "No supported AI tool found. Install Claude Code or Cursor to see usage here."
- If Cursor *is* available on this machine: the app behaves as a Cursor-only, single-source app (same as Claude-only used to look before this change, mirrored) — no Claude entry anywhere, no broken/stuck tray state.

- [ ] **Step 6: Report results**

Summarize pass/fail for each step above in the final response to the user — do not claim completion without having actually run Steps 1–3 and observed their output.
