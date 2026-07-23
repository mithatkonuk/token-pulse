# token-pulse — Design

## Purpose

A cross-platform (macOS/Windows/Linux) tray/menu-bar widget that shows Claude Code token usage — 5-hour rolling limit and weekly rolling limit — without needing to open Claude Desktop or a usage web page. Built provider-agnostic so other LLM providers can be added later, but only Claude Code ships in v1.

## Non-goals (v1)

- No support for providers other than Claude Code (architecture allows it, no implementation).
- No exact/authoritative rate-limit numbers — thresholds are community-estimated and editable, not pulled from an authenticated Anthropic endpoint.
- No coverage of claude.ai/Claude Desktop chat usage — only local Claude Code usage (`~/.claude/usage.db`) is measured.
- No cloud sync / multi-machine aggregation — single-machine, local data only.

## Architecture

### Provider abstraction

```ts
interface UsageWindow {
  id: 'five_hour' | 'weekly';
  label: string;
  usedTokens: number;
  limitTokens: number;
  percentUsed: number; // 0-100+
  resetsAt: Date;
}

interface UsageProvider {
  getPlanTier(): Promise<string>;          // e.g. "claude_pro"
  getWindows(): Promise<UsageWindow[]>;     // [five_hour, weekly]
  getCurrentModel(): Promise<string | null>;
}
```

`ClaudeCodeProvider` is the only implementation in v1. Future providers (OpenAI, Gemini, etc.) implement the same interface; the Electron shell, tray, and UI never reference Claude-specific concepts directly.

### Process split (Electron)

- **Main process**: owns the polling timers, the `ClaudeCodeProvider`, tray icon rendering, and the frameless popup window lifecycle.
- **Renderer** (React + TS): pure presentation of the widget panel. Receives usage data via IPC (`usage:update` event), no direct file/DB access.

## Data layer — ClaudeCodeProvider

### Plan tier detection

Read `~/.claude.json` (Windows: `%USERPROFILE%\.claude.json`, Linux: `~/.claude.json`) → `oauthAccount.organizationType` (e.g. `"claude_pro"`, `"claude_max_5x"`, `"claude_max_20x"`). If the field is missing or the file can't be read, fall back to a configurable default tier (`claude_pro`) and surface a "plan tier unknown, using default" indicator in the UI.

### Usage aggregation

Source: `~/.claude/usage.db` (SQLite), table `turns(session_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, ...)`.

For each window (`five_hour` = trailing 5h, `weekly` = trailing 7d):
- `usedTokens` = SUM(input_tokens + output_tokens + cache_creation_tokens) for turns with `timestamp` within the window. Plain cache reads (`cache_read_tokens`) are excluded from the primary sum by default (Anthropic's real rate-limit formula weights cache reads far lower than fresh tokens) but the weighting is a named constant (`CACHE_READ_WEIGHT = 0`) in one place so it can be corrected later without redesigning the query.
- `resetsAt` = oldest in-window turn's `timestamp` + window duration (rolling-window approximation; Anthropic's actual reset semantics aren't publicly documented).
- `percentUsed` = `usedTokens / limitTokens * 100`, where `limitTokens` comes from `config/plan-limits.json` keyed by `[planTier][windowId]`.

`config/plan-limits.json` ships with best-known community-estimated thresholds per tier or windows(unknown tiers fall back to the Pro row) and is safe for the user to hand-edit after observing their own real limits.

### Current model

Model of the single most-recent row in `turns` (by `timestamp`) across all sessions. If no rows exist, show "no recent activity."

## UI / Tray behavior

### Collapsed (tray/menu-bar icon)

A small dynamically-drawn ring/bar icon reflecting the 5h window's `percentUsed`, colored green (<70%), yellow (70–90%), red (>90%). Redrawn on every 5h poll tick (see below) and set as the tray image. Weekly status is not encoded in the icon — check the expanded panel for that.

### Expanded (click to open, frameless popup anchored to the tray icon)

Modeled on the reference widget screenshot:
- Header: current model name.
- 5h usage bar with `%` label and "resets in Xh Ym".
- Weekly usage bar with `%` label and "resets in N days".
- Small settings affordance (gear icon) linking to `config/plan-limits.json`'s folder and a "start at login" toggle.

Popup auto-closes on click-away/blur, like a standard tray flyout.

### Start at login

A toggle (persisted in Electron's app settings store) that registers/unregisters the app with the OS's login-item mechanism (`app.setLoginItemSettings` on macOS/Windows; a `.desktop` autostart entry on Linux). Off by default; recommended in first-run copy since the point of the app is to never have to check manually.

## Refresh loop

- **5h window**: `setInterval` every 5s in the main process — reads `usage.db`, recomputes the `five_hour` window, updates tray icon + (if popup open) pushes IPC update.
- **Weekly window + plan tier**: `setInterval` every 6h (configurable via a constant) — recomputes `weekly` window and re-reads plan tier from `~/.claude.json`.
- Both timers write into a single in-memory `UsageState` object; the popup, when opened, always renders the latest state immediately (no wait for the next tick) and then receives live IPC updates while open.

## Repo layout

```
token-pulse/
  package.json
  electron-builder.yml
  config/
    plan-limits.json
  src/
    main/
      index.ts
      tray.ts
      trayIcon.ts
      windowManager.ts
      ipc.ts
      settingsStore.ts
    providers/
      types.ts
      claude-code/
        index.ts
        usageDb.ts
        planLimits.ts
        windowCalc.ts
    renderer/
      main.tsx
      App.tsx
      components/
        UsageBar.tsx
        WidgetPanel.tsx
    shared/
      types.ts
  tests/
    windowCalc.test.ts
    planLimits.test.ts
```

## Testing strategy

- **Unit (Vitest)**: `windowCalc.ts` (rolling-window sum + resetsAt math against fixture rows) and `planLimits.ts` (tier lookup + fallback behavior) — this is the logic with real edge cases (empty DB, all-cache-read turns, tier missing from config).
- **Manual**: run the packaged app on at least macOS (primary dev machine) and visually confirm tray icon color transitions and popup layout; Windows/Linux packaging verified via `electron-builder` build success, not full manual QA in v1 given single-developer scope.

## Packaging

`electron-builder` targets: macOS `dmg`, Windows `nsis`, Linux `AppImage` + `deb`. `better-sqlite3` (native module) requires `electron-rebuild`/`electron-builder`'s native-module handling — noted as a build-time dependency, not a runtime concern.
