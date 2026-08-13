# Unavailable-source handling (Claude CLI / Cursor not installed)

## Problem

The Cursor source is only added to `sources` when a Cursor access token is
found (`readCursorAccessToken() !== null`), so a machine without Cursor
installed or logged in never sees a broken Cursor entry — it's simply absent.

The Claude source, by contrast, is registered unconditionally. If the `claude`
CLI binary isn't on PATH at all, `refreshUsageFromCommand` just gets `null`
back from every poll forever (`execFile` ENOENT), `windows` never populates,
`consecutiveFailures` climbs with exponential backoff (capped at 1h), and the
tray sits on its initial placeholder ("0% 5h", after the prior fix) with no
indication to the user of *why*. There's no distinction today between "briefly
failing" and "not installed at all."

## Goal

Make Claude mirror Cursor's existing behavior: probe for availability once at
startup, and only register a source if it's actually usable. When that leaves
zero sources registered, show a clear, honest empty state instead of a tray
that silently never updates.

## Design

### 1. Provider interface: `isAvailable()`

Add to `UsageProvider` (`src/providers/types.ts`):

```ts
isAvailable(): boolean
```

- **`ClaudeCodeProvider.isAvailable()`**: resolve the `claude` binary against
  the same augmented PATH `usageCommand.ts` already builds
  (`buildAugmentedPath`: `/opt/homebrew/bin`, `/usr/local/bin`,
  `~/.local/bin`, then `process.env.PATH`). Implementation: split each PATH
  entry, check for an executable `claude` file in each via `fs.existsSync`
  (+ executable bit check) — no subprocess spawn, no `--version` call. This
  intentionally only proves "a file named `claude` exists and looks
  executable," not "it runs successfully" — matches the "which/command -v"
  choice: cheap, side-effect-free, and consistent with the real lookup the
  actual usage command performs.
- **`CursorProvider.isAvailable()`**: thin wrapper around the existing
  `readCursorAccessToken() !== null` check. No behavior change for Cursor —
  just exposed through the common interface.

Both checks run once at startup (`electron/main.ts`), result cached for the
process lifetime — not re-probed per poll. (If the user installs Claude CLI
mid-session, they need to restart the app to pick it up — acceptable for a
tray utility; no hot-reload requirement was requested.)

### 2. Source registration (`electron/main.ts`)

Replace the current pattern (Claude always pushed, Cursor conditionally
pushed via a one-off `cursorAvailable` local) with a uniform loop: build each
provider, call `isAvailable()`, only include it in `sources` if true. Claude
and Cursor go through identical logic — no special-casing either one.

### 3. Zero-or-more sources in state

- `AppState.activeSourceId` changes from `string` to `string | null`.
- Initial value: `sources[0]?.id ?? null` (was the literal `'claude'`).
- `pushState`, the `source:select` IPC handler, and any renderer code reading
  `state.activeSourceId` / `state.usageBySource[state.activeSourceId]` must
  handle `null` (renderer: no active usage to show; main: skip tray usage
  update, skip popup usage payload).

### 4. Tray rendering for the zero-sources case

- `updateTrayIcon` / tray setup gets an explicit "unavailable" render: neutral
  static icon (`renderUsageRingPng` at 0%, same as the existing placeholder
  render), but **no `setTitle` call at all** — no percentage, since there's
  nothing being measured. This is a distinct code path, not "leave whatever
  was there before."
- This only triggers when `sources.length === 0`. Any single-source or
  dual-source case behaves exactly as it does today (real percentage, real
  window label).
- Existing behavior where `pushState` leaves the tray untouched when a *poll*
  comes back without a `five_hour` window (bcd1e01) is unaffected — that's a
  different case (source exists, this particular poll just didn't return that
  window) from "no source is even registered."

### 5. Popup panel empty state

- When `activeSourceId === null`, the popup panel (`WidgetPanel` and
  whatever top-level component reads app state) renders a simple centered
  message instead of usage bars/percentages:

  > **No supported AI tool found**
  > Install Claude Code or Cursor to see usage here.

- No per-source "why is this one unavailable" messaging inside the source
  dropdown — because an unavailable source is never listed as an option
  (mirrors Cursor's current invisible-when-absent behavior), there's nothing
  to explain per-entry. The empty state only appears in the genuine
  all-unavailable case.
- Exact copy/links are placeholder-simple for now; can be refined without a
  design change.

## Testing

- `ClaudeCodeProvider.isAvailable()`: unit test with a fake/mocked PATH
  (found in one of the augmented dirs / found via `process.env.PATH` / found
  nowhere).
- `CursorProvider.isAvailable()`: unit test reusing existing
  `readCursorAccessToken` mocking patterns.
- `main.ts` source-registration logic: if it's extracted into a small
  testable function (e.g. `buildSources(providers): SourceRuntime[]`), unit
  test it directly; otherwise this is covered indirectly via the modules it
  composes (`usageCommandScheduler.test.ts`-style coverage).
- `tray.ts`: new test case for the zero-sources "unavailable" render (no
  `setTitle` call, neutral icon).
- Popup/`WidgetPanel`-level component test (Vitest + Testing Library,
  matching existing `src/components` test conventions): empty-state message
  renders when `activeSourceId` is `null`; usage bars render otherwise.
- No E2E/Playwright coverage needed — matches this project's existing test
  depth (Vitest unit tests only).

## Out of scope

- Hot-reloading availability mid-session (requires restart to pick up a
  freshly-installed CLI).
- Any UI for a source that's *installed but currently failing* (auth expired,
  command erroring) — that's the existing `consecutiveFailures`/backoff path,
  unchanged by this design. This design is specifically about "not installed
  at all."
