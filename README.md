<div align="center">

# token-pulse

**Your Claude usage, always one glance away.**

A lightweight tray/menu-bar widget for macOS, Windows, and Linux that shows your Claude 5-hour and weekly rate-limit usage — without ever opening Claude Desktop.

![platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-informational)
![node](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)
![electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)

<p>
  <img src="docs/screenshots/usage-dark.png" width="320" alt="token-pulse popup — dark theme">
  <img src="docs/screenshots/usage-light.png" width="320" alt="token-pulse popup — light theme">
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
- **What's using your limits** — a 24h/7d breakdown of top skills, subagents, plugins, and MCP servers, straight from `/usage`
- **Context window usage** — current conversation's token usage against the model's context window, when available
- **Live urgency color** on the tray icon and usage bars — blue under 80%, yellow/dark yellow from 80%, red/dark red from 90%
- **OS-aware tray icon** — the normal-state ring color follows your system's light/dark menu-bar appearance automatically
- **Runs in the background** — no Dock icon, no entry in the app switcher; lives entirely in the tray
- **Settings** — dark/light/system in-app theme, font family & size, and a working "Start at login" toggle
- **About panel** — version info and a contact link, one click away
- No credentials handled or stored — everything runs through your existing `claude` CLI session

## How it gets its numbers

**Usage bars and the limits breakdown** come from shelling out to `claude -p "/usage"` — the same slash command you'd run yourself in a terminal. It's a real subprocess call (~1-2s), and it's the only network-touching part of the app: `/usage` itself is a pure local command (no model/API-turn cost), but it does ask Claude's account-status endpoint for your real percentages. This call happens once at startup and then every 3 minutes — deliberately not tied to file-watching or popup-open, since each call has real latency and a real side effect (see below), not something worth paying on every UI interaction.

Every `-p` invocation starts a brand-new session, which writes a transcript file under `~/.claude/projects/<project-hash>/`. token-pulse pins the session ID itself (`--session-id`) and always runs from a dedicated scratch directory (`<userData>/usage-check-cwd`, never a real project), then deletes that exact transcript file right after reading the output — so this doesn't leave any of the usual per-session clutter behind, and it never gets attributed to whatever project you're actually working in.

The current **model name** is read from the newest entry in `~/.claude/projects/**/*.jsonl` (session transcripts, written by both the CLI and Desktop), since the statusline hook cache never updates outside a CLI session; it falls back to that cache (`~/.claude/token-pulse-cache.json`, populated by `~/.claude/statusline-command.sh`) if no transcript is found. **Context window usage** still comes from the statusline cache. **Plan tier** comes from `~/.claude.json`'s `oauthAccount.organizationType`. These three are driven by a file watcher (with a 60s fallback poll in case a watch event is missed) — no process spawns, no extra latency.

**Freshness for the usage bars depends on the last successful `/usage` call, not on file activity.** The popup's "Data as of Xm ago" line reflects that 3-minute cadence — the account-level percentages don't change fast enough to need finer granularity than that.

## Settings

Click the ⚙ icon in the popup header to open Settings:

<p>
  <img src="docs/screenshots/settings-dark.png" width="320" alt="Settings view — dark theme">
  <img src="docs/screenshots/settings-light.png" width="320" alt="Settings view — light theme">
</p>

| Control | Options |
|---|---|
| Theme | Dark / Light / System (follows the OS appearance) |
| Font family | System / Monospace / Serif / Menlo / JetBrains Mono |
| Font size | Small / Medium / Large |
| Start at login | On / Off |

Settings persist to disk and survive restarts. Click ⓘ for the About panel; click ← from either view to return to the usage screen.

## Requirements

- Node.js 22+ and npm, for the dev/build tooling (Vite, Electron, TypeScript)
- The `claude` CLI installed and on `PATH`, logged in (usage bars run it directly)
- `jq` installed, if you also want the model-name statusline block active (almost certainly already on your machine if you have a statusline configured)

## Running a dev instance

```bash
npm install
npm run dev
```

This starts Vite (renderer) and launches Electron with hot-reload for both the popup UI and the main process. A tray/menu-bar icon appears (a colored ring) — click it to open the popup. Right-click the tray icon for a "Quit" option; the app has no other way to exit, since it's designed to live in the background (`window-all-closed` is intentionally a no-op, and the app has no Dock icon on macOS).

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

## Project layout

```
electron/                  Main-process entry, tray icon wiring, popup window, autostart (not unit-tested — Electron runtime APIs)
src/
  providers/claude-code/    Runs `claude -p "/usage"` for the bars + limits breakdown; reads statusline cache + ~/.claude.json for model/context/plan (ClaudeCodeProvider)
  main/                     Pure logic used by the main process (tray icon PNG rendering, settings persistence, Linux autostart entry)
  shared/                   Types and formatting helpers shared between main and renderer
  components/               Popup UI (React) — WidgetPanel (nav shell), UsageView, SettingsView, AboutView
tests/                      Vitest unit tests for everything above except electron/*
docs/superpowers/           Design specs and implementation plans this project was built from
```

## Known limitations

- Usage bars are only as fresh as the last successful `/usage` call (every 3 minutes) — there's no push/webhook, so between calls the numbers can lag reality by up to that interval.
- Each `/usage` call is a real subprocess spawn (~1-2s); this is deliberately not run on every popup open or file-watch event, to keep that cost bounded.
- The current model name still depends on the Claude Code statusline hook cache or session transcripts; usage percentages do not.
- The "This session" cost/lines-changed/per-model breakdown you see in Claude Code's own interactive `/cost` or `/stats` views isn't available here — that data lives only in a live interactive session's in-memory state and can't be retrieved by a separate background process, no matter how it's invoked.
- Windows and Linux packaging is configured but not build-or-run verified (this project was built and tested on macOS only).
- No automated tests exist for the Electron main-process glue (`electron/*.ts`) or for React component rendering — both are verified manually rather than via unit tests.
