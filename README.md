<div align="center">

# token-pulse

**Your Claude (and Cursor) usage, always one glance away.**

A lightweight tray/menu-bar widget for macOS, Windows, and Linux that shows your Claude 5-hour and weekly rate-limit usage — without ever running `/usage` yourself. If Cursor is installed and logged in, its billing-cycle usage, cost, and recent activity are one click away too.

![platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-informational)
![node](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)
![electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)

<p>
  <img src="docs/screenshots/usage-limits-7d.png" width="320" alt="token-pulse popup — usage limits with 7-day breakdown">
  <img src="docs/screenshots/usage-limits-24h.png" width="320" alt="token-pulse popup — usage limits with 24-hour breakdown">
</p>

</div>

---

## Contents

- [Features](#features)
- [How it gets its numbers](#how-it-gets-its-numbers)
- [Settings](#settings)
- [Requirements](#requirements)
- [Running a dev instance](#running-a-dev-instance)
- [Building an installer](#building-an-installer)
- [Project layout](#project-layout)
- [Known limitations](#known-limitations)

## Features

- **Two usage bars** — 5-hour and weekly rate-limit percentage, with the plain-language reset time Claude Code itself reports
- **Tray title tells you which window you're looking at** — the menu-bar percentage is suffixed with `5h`, `Wk`, or (for Cursor) `Mo`, so it's never ambiguous which limit is closest to being hit
- **What's using your limits** — a 24h/7d breakdown of top skills, subagents, plugins, and MCP servers, straight from `/usage`
- **Context window usage** — current conversation's token usage against the model's context window, when available
- **Cursor as a second source** — when Cursor is installed and logged in, the header becomes a clickable selector to switch between "Claude Code" and "Cursor"; Cursor's view shows its monthly billing-cycle % and reset date, cost spent vs. plan limit, and a recent-activity list (model, tokens, cost) for your last few requests. If no Cursor session is found, the header looks exactly as it always has — no dropdown, no visual change.
- **Live urgency color** on the tray icon and usage bars — blue under 80%, yellow/dark yellow from 80%, red/dark red from 90%
- **OS-aware tray icon** — the normal-state ring color follows your system's light/dark menu-bar appearance automatically
- **Runs in the background** — no Dock icon, no entry in the app switcher; lives entirely in the tray
- **Settings** — dark/light/system in-app theme, font family & size, and a working "Start at login" toggle
- **About panel** — version info and a contact link, one click away
- No credentials handled or stored — everything runs through your existing `claude` CLI session (Claude) or a token already saved locally by the Cursor desktop app (Cursor), read-only

## How it gets its numbers

### Claude Code

<p>
  <img src="docs/screenshots/claude-with-selector.png" width="320" alt="Claude Code view — header is now a clickable source selector when Cursor is also detected">
</p>

**Usage bars and the limits breakdown** come from shelling out to `claude -p "/usage" --mcp-config '{"mcpServers":{}}' --strict-mcp-config` — the same slash command you'd run yourself in a terminal, with MCP servers explicitly disabled for that one-off call (this is a background polling call, not an interactive session — it has no use for whatever MCP servers happen to be configured, and loading them anyway was previously an unnecessary side effect, including spinning up unrelated local connections). It's a real subprocess call (~1-2s), and it's the only network-touching part of the app: `/usage` itself is a pure local command (no model/API-turn cost), but it does ask Claude's account-status endpoint for your real percentages. This call happens once at startup, then every 3 minutes while Claude is actively being used — deliberately not tied to popup-open, since each call has real latency and a real side effect (see below), not something worth paying on every UI interaction. If no watched session/cache file has changed for 15 minutes, the cadence backs off to every 20 minutes instead of polling on a fixed timer forever; the moment activity resumes, it snaps back to every 3 minutes on the next check.

Every `-p` invocation starts a brand-new session, which writes a transcript file under `~/.claude/projects/<project-hash>/`. token-pulse pins the session ID itself (`--session-id`) and always runs from a dedicated scratch directory (`<userData>/usage-check-cwd`, never a real project), then deletes that exact transcript file right after reading the output — so this doesn't leave any of the usual per-session clutter behind, and it never gets attributed to whatever project you're actually working in.

The current **model name** and **context window usage** are both read fresh from the newest entry in `~/.claude/projects/**/*.jsonl` (session transcripts, written by both the CLI and Desktop) every time — the model directly, and the context-window token count computed from the transcript's raw usage numbers (`input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`, the same fields Claude Code's own statusline hook uses). The context window's *denominator* (`context_window_size`) can't be derived from a transcript, so it's looked up by the transcript's own model id in a small static table (`src/providers/claude-code/modelContextWindows.ts`, sourced from [Anthropic's models overview](https://platform.claude.com/docs/en/about-claude/models/overview) and hand-maintained — current models split between 1M- and 200k-token windows, so a single flat constant would be wrong for some of them). There's no free way to query this live: `claude -p /usage --output-format json` never populates `modelUsage` (it's a zero-cost command that doesn't invoke a model turn), and getting the real value any other way means spending an actual, rate-limit-consuming API call just to read a constant — not something a background poller should do.

Optionally, if `~/.claude/statusline-command.sh` exists — **this is not something token-pulse installs or ships**; it's an example of a personal Claude Code statusline customization, written to also cache its JSON payload at `~/.claude/token-pulse-cache.json` — both model name and context window fall back to reading that cache if a transcript isn't available or names no model. **Plan tier** comes from `~/.claude.json`'s `oauthAccount.organizationType`. These are driven by a file watcher (with a 60s fallback poll in case a watch event is missed) — no process spawns, no extra latency.

(Earlier versions of this app used that cache as the *only* source for context-window usage. Since the cache only updates while a terminal `claude` session renders a statusline — never true for Desktop-hosted sessions — that number could go stale indefinitely for anyone who mostly uses Claude Desktop. Reading it from the transcript directly fixes that for everyone, custom statusline or not.)

**Freshness for the usage bars depends on the last successful `/usage` call, not on file activity.** The popup's "Data as of Xm ago" line reflects that 3-minute cadence — the account-level percentages don't change fast enough to need finer granularity than that.

### Cursor

<p>
  <img src="docs/screenshots/cursor-usage.png" width="320" alt="Cursor view — billing-cycle usage, cost, and recent activity">
</p>

If Cursor's desktop app is installed and you're logged in, token-pulse reads the access token it already stores locally (`~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`, a plain SQLite key-value table — no separate login, nothing typed anywhere) and calls Cursor's own dashboard backend (`api2.cursor.sh`, the same Connect-RPC/protobuf API the Cursor desktop app itself uses) directly with it. Two calls: `GetCurrentPeriodUsage` for the billing-cycle % and cost, `GetFilteredUsageEvents` for the 5 most recent individual requests. Both are unofficial, undocumented endpoints — no published schema, no published rate limit — so Cursor's polling interval is deliberately more conservative than Claude's (5 minutes active vs. 3), with its own backoff-on-failure (doubling up to 1 hour) that Claude's provider doesn't need, since Claude's `/usage` is a supported, stable CLI command and Cursor's isn't.

The token/cost field mapping for `GetFilteredUsageEvents` was reverse-engineered from a live response rather than a published schema — timestamp and model name are unambiguous, but the token-count and cost fields are a plausible, internally-consistent reading that hasn't been independently cross-checked against a second reference UI (unlike `GetCurrentPeriodUsage`'s fields, which were verified against the exact wording Cursor's own dashboard displays). If Cursor changes this API, these numbers are the most likely to drift first.

If no Cursor token is found, none of this runs — the header shows the exact same plain text it always has, with no dropdown.

## Settings and Info

The menu-bar percentage always tells you which window it's from — `5h` (five-hour), `Wk` (weekly), or `Mo` (Cursor's monthly billing cycle):

<p>
  <img src="docs/screenshots/tray-title.png" height="40" alt="Tray icon showing 9% 5h">
</p>

Both Settings and the About panel live behind a right-click, not in the popup header — right-click the tray icon for the app menu: **Toggle** opens/closes the popup, same as a left-click; **Preferences** and **Info** open the popup straight to that view; then **Quit**:

<p>
  <img src="docs/screenshots/tray-menu.png" width="360" alt="Right-click tray menu with Toggle, Preferences, Info, and Quit">
</p>

<p>
  <img src="docs/screenshots/settings-dark.png" width="320" alt="Settings view — dark theme">
  <img src="docs/screenshots/settings-light.png" width="320" alt="Settings view — light theme">
  <img src="docs/screenshots/about-view.png" width="280" alt="About panel opened from the tray menu's Info item">
</p>

| Setting | Options |
|---|---|
| Theme | Dark / Light / System (follows the OS appearance) |
| Font family | System / Monospace / Serif / Menlo / JetBrains Mono |
| Font size | Small / Medium / Large |
| Start at login | On / Off |

Settings persist to disk and survive restarts. Click ← from either view to return to the usage screen.

## Requirements

- Node.js 22+ and npm, for the dev/build tooling (Vite, Electron, TypeScript)
- The `claude` CLI installed and on `PATH`, logged in (usage bars run it directly)
- Nothing else — model name, context window, and plan tier all work out of the box from session transcripts and `~/.claude.json`. A custom statusline script that populates `~/.claude/token-pulse-cache.json` (like the maintainer's own — see "How it gets its numbers" above) is entirely optional and only used as a fallback if a transcript is ever unavailable
- Cursor is entirely optional — if it's not installed or you're not logged in, the app behaves exactly as it did before Cursor support existed

## Running a dev instance

```bash
npm install
npm run dev
```

This starts Vite (renderer) and launches Electron with hot-reload for both the popup UI and the main process. A tray/menu-bar icon appears (a colored ring) — click it to open the popup. Right-click the tray icon for the app menu — Toggle, Preferences, Info, then Quit; the app has no other way to exit, since it's designed to live in the background (`window-all-closed` is intentionally a no-op, and the app has no Dock icon on macOS).

### Tests and type-checking

```bash
npm test                            # vitest — pure logic (format helpers, tray icon pixels, provider, settings, autostart) is unit-tested
npx tsc -p tsconfig.json --noEmit   # strict type-check
```

Electron-runtime glue (`electron/*.ts`) has no unit tests, since `Tray`/`BrowserWindow`/`app` APIs aren't meaningfully mockable — that layer is verified manually via `npm run dev` and the packaged app.

## Building an installer

```bash
npm run build
```

This runs `tsc --noEmit && vite build && electron-builder`, producing installers under `release/<version>/`:

| Platform | Output | Notes |
|---|---|---|
| macOS | `token-pulse-Mac-<version>-Installer.dmg` + an unpacked `<arch>/token-pulse.app` | Unsigned by default (no Apple Developer ID configured) — macOS Gatekeeper will warn on first launch; right-click → Open, or codesign it yourself if you have a certificate. |
| Windows | `token-pulse-Windows-<version>-Setup.exe` (NSIS installer) | Must be built on Windows, or on macOS/Linux with `wine` installed. Not build-verified on this machine. |
| Linux | `token-pulse-Linux-<version>.AppImage` and a `.deb` | Must be built on Linux (or with electron-builder's Docker-based cross-build image). Not build-verified on this machine. |

electron-builder only cross-builds some targets from macOS without extra tooling — building the Windows/Linux installers for real is easiest done on (or in a container for) that target OS. The config for all three lives in `electron-builder.json5` and doesn't need changes to add a platform's build — just run `npm run build` on that OS.

To launch the packaged macOS app directly instead of via the dmg:

```bash
open release/<version>/mac-arm64/token-pulse.app   # or mac-x64 / mac, depending on your Mac's architecture — check `ls release/<version>/`
```

### Automated releases

Pushing a `v*` tag (e.g. `v0.2.0`, matching `package.json`'s `version`) triggers `.github/workflows/release.yml`: it builds installers for all three platforms in parallel (macOS both arches, Windows, Linux), then publishes a GitHub Release with the `.dmg`/`.exe`/`.AppImage`/`.deb` attached and the tag's annotated message as release notes.

```bash
npm version minor -m "chore: release v%s"   # bumps package.json, commits, tags
git push origin main --follow-tags
```

## Project layout

```
electron/                  Main-process entry, tray icon wiring, popup window, autostart (not unit-tested — Electron runtime APIs)
src/
  providers/claude-code/    Runs `claude -p "/usage"` for the bars + limits breakdown; reads session transcripts for model/context (falling back to an optional statusline cache) + ~/.claude.json for plan tier (ClaudeCodeProvider)
  providers/cursor/         Reads Cursor's local auth token, calls its Connect-RPC dashboard backend, hand-decodes the protobuf responses (CursorProvider, dashboardClient, protobuf, cursorAuth)
  main/                     Pure logic used by the main process (tray icon PNG rendering, settings persistence, Linux autostart entry, Cursor's failure backoff)
  shared/                   Types and formatting helpers shared between main and renderer
  components/               Popup UI (React) — WidgetPanel (nav shell), SourceSelector, UsageView, SettingsView, AboutView
tests/                      Vitest unit tests for everything above except electron/*
docs/superpowers/           Design specs and implementation plans this project was built from
```

## Known limitations

- Usage bars are only as fresh as the last successful `/usage` call (every 3 minutes while active, backing off to every 20 minutes after 15 minutes of inactivity) — there's no push/webhook, so between calls the numbers can lag reality by up to that interval.
- Each `/usage` call is a real subprocess spawn (~1-2s); this is deliberately not run on every popup open or file-watch event, to keep that cost bounded.
- The model name in the header is labelled **"last active"** for a reason: it's read from whichever session transcript was most recently written to, anywhere on this machine. It's the model that last actually *produced output* — so it won't reflect a model you selected but haven't sent a message on yet, and with several sessions open on different models it shows whichever one replied most recently. There's no `/model`, `/status`, or `/usage` output that reports the active model non-interactively (all three are unavailable or model-free under `claude -p`), and `settings.json`'s `model` field is only a static default, not the live selection. Usage percentages don't depend on any of this.
- The "This session" cost/lines-changed/per-model breakdown you see in Claude Code's own interactive `/cost` or `/stats` views isn't available here — that data lives only in a live interactive session's in-memory state and can't be retrieved by a separate background process, no matter how it's invoked.
- The context window's denominator (`context_window_size`) comes from a small hand-maintained table keyed by model id (see "How it gets its numbers" above), not a live API call — it'll be wrong for any model released after the table was last updated, until the table is updated to match.
- Windows and Linux packaging is configured but not build-or-run verified (this project was built and tested on macOS only).
- Electron main-process glue (`electron/*.ts`) has no automated tests — verified manually rather than via unit tests. React component rendering (`SourceSelector`, `UsageView`, etc.) does have jsdom/React Testing Library coverage.
- Cursor support relies on an unofficial, undocumented API (`api2.cursor.sh`) — it can change or be rate-limited without notice, and the token/cost fields on the recent-activity list are a reverse-engineered best guess (see "How it gets its numbers" above), not verified against a second reference UI the way the billing-cycle % and cost total are.
- The "$ spent" and per-request activity numbers are approximate — they reflect our own reading of Cursor's response, not an official reconciliation against your actual bill.
