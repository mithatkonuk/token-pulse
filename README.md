# token-pulse

A tray/menu-bar widget for macOS, Windows, and Linux that shows your Claude Code usage — the 5-hour and 7-day (weekly) rate limits, your plan tier, and the model you're currently using — without opening Claude Desktop.

## How it gets its numbers

Claude Code's own **statusline hook** (`~/.claude/statusline-command.sh`) receives real, authoritative rate-limit percentages from Anthropic on every render — the same numbers Claude Desktop's usage panel shows you. token-pulse doesn't call any API itself; it piggybacks on that hook.

Setup added one small, additive block near the top of `~/.claude/statusline-command.sh` that writes a JSON snapshot to `~/.claude/token-pulse-cache.json` every time the statusline fires:

```json
{
  "five_hour": { "used_percentage": 15.0, "resets_at": 1784850000 },
  "seven_day": { "used_percentage": 52.0, "resets_at": 1784950000 },
  "model_display_name": "Sonnet 5",
  "updated_at": "2026-07-23T20:10:08Z"
}
```

token-pulse polls this file every 5 seconds (`src/providers/claude-code/index.ts`) and reads your plan tier straight from `~/.claude.json` (`oauthAccount.organizationType`). Everything is local — no network calls, no credentials.

**This means the numbers only refresh while a Claude Code session is actively running** (whenever its statusline re-renders). Between sessions, the popup shows a "data as of Xm/Xh/Xd ago" line so you always know how fresh it is — a few hours old is normal if you haven't used Claude Code recently, and it catches up the moment you start a new session.

An earlier version approximated usage by counting tokens in `~/.claude/usage.db` against guessed thresholds. That approach was replaced entirely because the local DB isn't guaranteed to stay indexed (it silently went stale on the dev machine for weeks) — the statusline hook gives real numbers instead of a guess.

## Requirements

- Node.js 22+ and npm, for the dev/build tooling (Vite, Electron, TypeScript)
- `jq` installed (used by the statusline script's caching block — almost certainly already on your machine if you have a statusline configured)

## Running a dev instance

```bash
npm install
npm run dev
```

This starts Vite (renderer) and launches Electron with hot-reload for both the popup UI and the main process. You'll see a tray/menu-bar icon appear (a colored ring, green/yellow/red by usage) — click it to open the popup. Right-click the tray icon for a "Quit" option; the app has no other way to exit, since it's designed to live in the background (`window-all-closed` is intentionally a no-op).

To see real numbers immediately, run a Claude Code session in another terminal — its statusline render will populate `~/.claude/token-pulse-cache.json`, and token-pulse will pick it up on its next 5-second poll.

### Tests and type-checking

```bash
npm test              # vitest — pure logic (format helpers, tray icon pixels, provider, settings, autostart) is unit-tested; Electron glue (tray.ts, windowManager.ts, main.ts) is not, since those APIs aren't meaningfully unit-testable
npx tsc -p tsconfig.json --noEmit   # strict type-check
```

## Building an installer

```bash
npm run build
```

This runs `tsc --noEmit && vite build && electron-builder`, producing installers under `release/<version>/` for whichever platform you build on:

| Platform | Output | Notes |
|---|---|---|
| macOS | `token-pulse-Mac-<version>-Installer.dmg` + an unpacked `<arch>/token-pulse.app` | Unsigned by default (no Apple Developer ID configured) — macOS Gatekeeper will warn on first launch; right-click → Open, or codesign it yourself if you have a certificate. |
| Windows | `token-pulse-Windows-<version>-Setup.exe` (NSIS installer) | Must be built on Windows, or on macOS/Linux with `wine` installed (electron-builder's standard cross-build requirement). Not build-verified on this machine. |
| Linux | `token-pulse-Linux-<version>.AppImage` and a `.deb` | Must be built on Linux (or with electron-builder's Docker-based cross-build image). Not build-verified on this machine. |

electron-builder only cross-builds some targets from macOS without extra tooling — building the Windows/Linux installers for real is easiest done on (or in a container for) that target OS. The config for all three lives in `electron-builder.json5` and doesn't need changes to add a platform's build — just run `npm run build` on that OS.

To launch the packaged macOS app directly instead of via the dmg:

```bash
open release/<version>/mac-arm64/token-pulse.app   # or mac-x64 / mac, depending on your Mac's architecture — check `ls release/<version>/`
```

## Project layout

```
electron/                  Main-process entry, tray, popup window, autostart wiring (not unit-tested — Electron runtime APIs)
src/
  providers/claude-code/    Reads the statusline cache + ~/.claude.json (ClaudeCodeProvider)
  main/                     Pure logic used by the main process (tray icon PNG rendering, settings persistence, Linux autostart entry)
  shared/                   Types and formatting helpers shared between main and renderer
  components/               Popup UI (React)
tests/                      Vitest unit tests for everything above except electron/*
docs/superpowers/           Design spec and implementation plan this project was built from
```

## Known limitations

- Rate-limit data is only as fresh as your last active Claude Code session on this machine — there's no way to pull live numbers on demand outside of that.
- Windows and Linux packaging is configured but not build-or-run verified (this project was built and tested on macOS only).
- No automated tests exist for the Electron main-process glue (`electron/*.ts`) — those were verified manually (`npm run dev`, checking the packaged app launches) rather than via unit tests, since Tray/BrowserWindow aren't meaningfully mockable.
