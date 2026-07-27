# Multi-source selector — design

## Goal

Make the popup's header model name (currently a static "Sonnet 5 · last active" text)
a clickable selector that can show a dropdown menu of available usage *sources* (e.g.
Claude, and later Cursor), switching the whole panel's displayed usage data to the
selected source. If only one source is available — true today, since only Claude is
wired up — no menu appears at all; the header renders exactly as it does now.

**Explicitly out of scope for this work:** building a real Cursor usage provider. See
"Why Cursor is deferred" below.

## Why Cursor is deferred

Investigated whether Cursor usage/quota data is available locally, the same way Claude's
`~/.claude/usage.db` and `claude -p "/usage"` back the existing Claude provider:

- `cursor-agent -p "/usage"` (the print-mode analog of Claude's `/usage` command) replies
  *"I can't access your Cursor account usage or billing data here. Check Cursor Dashboard
  → Usage."* — unlike Claude, `/usage` is not a CLI-intercepted command backed by real
  data; it's just the agent model saying it has no access.
- `cursor-agent status --format json` / `cursor-agent about --format json` return only
  auth/account/model metadata (email, team, subscription tier, CLI version) — no usage
  percentages or token counts.
- `~/.cursor/ai-tracking/ai-code-tracking.db` exists locally but holds commit-level
  AI-vs-human line-attribution data, not usage/quota data.
- `~/.cursor/statusline.sh` is not something Cursor's CLI runs standalone — it's a script
  the Cursor IDE invokes and pipes JSON into on every render (`model.display_name`,
  `workspace.current_dir`, `context_window.used_percentage`). That JSON has per-session
  context-window %, comparable to what token-pulse already tracks for Claude's context
  bar — but nothing about plan/quota spend (the 5-hour/weekly-style numbers the tray ring
  needs).

Conclusion: Cursor's account-usage percentage is not exposed locally today, only on its
web dashboard. Building a real second provider needs its own future spec once/if that
changes. This design instead builds the generic selector mechanism now, so plugging in a
second provider later is additive, not a rearchitecture.

## 1. Data model

Today's `UsageState` (`src/shared/types.ts`) mixes per-source data (model, windows,
context window, contributing stats) with app-wide data (settings, appVersion). Split it:

```ts
export interface SourceUsage {
  planTier: string | null
  currentModel: string | null
  windows: UsageWindow[]
  contextWindow: ContextWindow | null
  contributing: Contributing | null
  updatedAt: string
  cacheUpdatedAt: string | null
}

export interface SourceDescriptor {
  id: string
  label: string
}

export interface AppState {
  sources: SourceDescriptor[]
  activeSourceId: string
  usageBySource: Record<string, SourceUsage>
  settings: AppSettings
  appVersion: string
}
```

`UsageState` is removed; its old fields become `SourceUsage`. `electron/main.ts` keeps
its existing per-source computation unchanged — just written into `usageBySource.claude`
instead of the flat `state` — and registers `sources = [{ id: 'claude', label: 'Claude
Code' }]` as a plain array literal (no registry module needed for one hardcoded entry). A
new IPC handler, `source:select`, sets `activeSourceId` and re-broadcasts `usage:update`
with the full `AppState`, same delivery path as today. `App.tsx` and `WidgetPanel` are
retyped from `UsageState | null` to `AppState | null`; `WidgetPanel` derives
`const activeUsage = state.usageBySource[state.activeSourceId]` and passes that (typed
`SourceUsage`) into `UsageView`, whose internals don't change — only the prop type name.

Switching sources is instant, no loading state: `usageBySource` already holds every
registered source's data, so selecting just flips which key `WidgetPanel` reads.

## 2. UI behavior

A new `SourceSelector` component (`src/components/SourceSelector.tsx`) replaces the
current static header `<span>` in `WidgetPanel.tsx`.

Props: `sources: SourceDescriptor[]`, `activeSourceId: string`, `currentModel: string |
null`, `onSelect: (id: string) => void`.

- **`sources.length <= 1`** (true today): renders exactly what's there now — plain text
  `currentModel ?? 'No recent activity'` plus the existing "last active" qualifier badge.
  No button semantics, no click handler, no visual change.
- **`sources.length > 1`** (true once a second source is registered later): the text
  becomes a `<button>` with a small chevron. Clicking it opens a popover menu anchored
  below, listing each source's `label`. Clicking an entry calls `onSelect(id)`, closes the
  popover, and triggers `source:select` over IPC. Click-outside and `Escape` both close
  the popover without selecting.
- Styling matches the existing theme system (`--accent-color`, `--font-family`,
  `data-theme`) — a small absolutely-positioned menu consistent with the popup's current
  dark/light look, no new design language or dependency.

Since only one source is registered right now, this ships with **zero visible or
behavioral change** to the running app. The `>1` branch only activates once a second
source exists.

## 3. Testing

- New `tests/SourceSelector.test.tsx` (Vitest + jsdom, matching existing renderer test
  setup):
  - 1 source → no button/menu role present, just text (proves the no-op path).
  - 2+ mock sources → button exists; clicking opens a menu with all labels; clicking a
    label calls `onSelect` with the right id and closes the menu; clicking outside the
    menu closes it; `Escape` closes it.
  These tests are what exercise the `>1`-source branch, since no second real source
  ships in this change.
- Type migration (`UsageState` → `SourceUsage`/`AppState`) is a rename with no behavior
  change for the Claude path; `tsc --noEmit` strict check is the gate that catches any
  missed reference. Existing tests touching `UsageView`, `App.tsx`, and `main.ts`'s
  state-building should keep passing once types/imports are updated.
- Manual check: run the dev app, confirm the header still shows "Sonnet 5 · last active"
  exactly as before — proving the 1-source path is a no-op change, since a second real
  source can't be click-tested live yet.
- No changes needed to `usageCommandScheduler.ts`, tray icon rendering, or urgency-color
  logic — none of them touch source selection.

## Out of scope

- A real Cursor (or any second) usage provider — see "Why Cursor is deferred" above.
- Any dev-only toggle to preview the `>1`-source UI live in the running app — covered by
  unit tests instead, per YAGNI (no shipped debug-only code path).
- Persisting the selected source across restarts — with only one source ever
  registered, `activeSourceId` always resolves to `'claude'` on startup; revisit once a
  second source exists.
