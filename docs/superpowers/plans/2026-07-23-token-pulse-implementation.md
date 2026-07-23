# token-pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform (macOS/Windows/Linux) Electron tray widget that shows Claude Code's 5-hour and weekly usage limits (auto-detected plan tier, live-updating bars, reset countdowns) so the user never has to open Claude Desktop to check usage.

**Architecture:** Electron main process owns a provider-agnostic `UsageProvider` (only `ClaudeCodeProvider` implemented) that reads `~/.claude/usage.db` and `~/.claude.json` locally — no network calls, no auth. Two independent timers (5s for the 5h window, 6h for the weekly window + plan tier) update an in-memory `UsageState`, which drives both the tray icon (drawn as a PNG bar via `pngjs`) and a frameless popup window (React) via IPC.

**Tech Stack:** Electron 43, Vite 8 + `vite-plugin-electron` 1.1, React 19, TypeScript 7, Vitest 4, `pngjs` 7, Node's built-in `node:sqlite` (no native modules — verified Node 24+ ships this unflagged, and Electron 43 bundles Node 24.18.0).

## Global Constraints

- Cross-platform targets: macOS (`dmg`), Windows (`nsis`), Linux (`AppImage` + `deb`) — from the spec's packaging section.
- Plan tier is auto-detected by reading `~/.claude.json` → `oauthAccount.organizationType`; unknown/missing falls back to `config/plan-limits.json`'s `defaultTier` (`claude_pro`).
- Usage source is `~/.claude/usage.db`, table `turns`; no authenticated Anthropic endpoint is called (per spec's non-goals).
- 5-hour window polls every 5 seconds; weekly window + plan tier poll every 6 hours — both are named constants, not hardcoded magic numbers, per the spec's refresh-loop section.
- Cache-read tokens are excluded from the usage sum by default (`CACHE_READ_WEIGHT = 0`, a named constant, not inlined) — the real Anthropic rate-limit formula weights them far lower than fresh tokens, and this is a documented approximation.
- Token thresholds live in `config/plan-limits.json` and are explicitly editable community estimates, not official numbers — never let a task remove or hide that editability.
- No native Node modules — use `node:sqlite`, not `better-sqlite3` — to avoid Electron/Node ABI rebuild issues (verified empirically: Node 26.5.0 and Electron 43.2.0's bundled Node 24.18.0 both support `node:sqlite` unflagged).
- Package manager is `npm` (already verified present and working on the dev machine).
- Repo root: `/Users/mko/realm/personal/token-pulse`, already `git init`-ed with the design spec committed at `docs/superpowers/specs/2026-07-23-token-pulse-design.md`.

---

## Task 1: Project scaffold (Electron + Vite + React + TS)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `electron-builder.json5`
- Create: `.gitignore`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`

**Interfaces:**
- Produces: a working `npm run dev` (Electron window), `npm test` (Vitest), `npm run build` (type-check + Vite build + electron-builder) pipeline that every later task builds on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "token-pulse",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build && electron-builder",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/node": "^26.0.0",
    "@types/pngjs": "^6.0.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^6.0.0",
    "electron": "^43.0.0",
    "electron-builder": "^26.0.0",
    "pngjs": "^7.0.0",
    "typescript": "^7.0.0",
    "vite": "^8.1.0",
    "vite-plugin-electron": "^1.1.0",
    "vite-plugin-electron-renderer": "^1.0.0",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "electron", "tests", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
})
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

This is intentionally separate from `vite.config.ts` — it must not load the `vite-plugin-electron` plugin, which tries to manage an Electron process and has no business running during unit tests of pure functions.

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>token-pulse</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `electron-builder.json5`**

```json5
// @see - https://www.electron.build/configuration/configuration
{
  "$schema": "https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/app-builder-lib/scheme.json",
  "appId": "dev.mithatkonuk.tokenpulse",
  "asar": true,
  "productName": "token-pulse",
  "directories": {
    "output": "release/${version}"
  },
  "files": [
    "dist",
    "dist-electron",
    "config"
  ],
  "mac": {
    "target": ["dmg"],
    "artifactName": "${productName}-Mac-${version}-Installer.${ext}"
  },
  "win": {
    "target": [{ "target": "nsis", "arch": ["x64"] }],
    "artifactName": "${productName}-Windows-${version}-Setup.${ext}"
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "deleteAppDataOnUninstall": false
  },
  "linux": {
    "target": ["AppImage", "deb"],
    "artifactName": "${productName}-Linux-${version}.${ext}"
  }
}
```

- [ ] **Step 7: Create `.gitignore`**

```
node_modules
dist
dist-electron
release
.DS_Store
```

- [ ] **Step 8: Create `electron/main.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

function createWindow(): void {
  const win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 9: Create `electron/preload.ts`**

```ts
import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...rest) => listener(event, ...rest))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})
```

- [ ] **Step 10: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 11: Create `src/App.tsx`**

```tsx
export default function App() {
  return <div>token-pulse</div>
}
```

- [ ] **Step 12: Create `src/index.css`**

```css
body {
  margin: 0;
  background: transparent;
}
```

- [ ] **Step 13: Install dependencies**

```bash
npm install
```

Expected: completes with no errors (0 vulnerabilities is typical but not required).

- [ ] **Step 14: Type-check**

```bash
npx tsc -p tsconfig.json --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 15: Verify the dev app launches**

```bash
npm run dev
```

Expected: a terminal log from Vite, and an Electron window opens showing "token-pulse". Stop it with Ctrl+C once confirmed.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "chore: scaffold Electron + Vite + React + TS project"
```

---

## Task 2: Shared types and countdown formatting

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/format.ts`
- Test: `tests/format.test.ts`

**Interfaces:**
- Produces: `UsageWindow`, `UsageState` types (consumed by every later task); `formatCountdown(resetsAtIso: string, now?: Date): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatCountdown } from '../src/shared/format'

describe('formatCountdown', () => {
  const now = new Date('2026-07-23T12:00:00.000Z')

  it('formats a sub-hour countdown in minutes', () => {
    expect(formatCountdown('2026-07-23T12:45:00.000Z', now)).toBe('resets in 45m')
  })

  it('formats an hours+minutes countdown', () => {
    expect(formatCountdown('2026-07-23T14:14:00.000Z', now)).toBe('resets in 2h 14m')
  })

  it('formats a multi-day countdown in days', () => {
    expect(formatCountdown('2026-07-26T12:00:00.000Z', now)).toBe('resets in 3d')
  })

  it('returns "resets now" when the reset time has passed', () => {
    expect(formatCountdown('2026-07-23T11:00:00.000Z', now)).toBe('resets now')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/format.test.ts
```

Expected: FAIL — `Cannot find module '../src/shared/format'`.

- [ ] **Step 3: Create `src/shared/types.ts`**

```ts
export interface UsageWindow {
  id: 'five_hour' | 'weekly'
  label: string
  usedTokens: number
  limitTokens: number
  percentUsed: number
  resetsAt: string
}

export interface UsageState {
  planTier: string
  currentModel: string | null
  windows: UsageWindow[]
  updatedAt: string
  startAtLogin: boolean
}
```

- [ ] **Step 4: Create `src/shared/format.ts`**

```ts
export function formatCountdown(resetsAtIso: string, now: Date = new Date()): string {
  const diffMs = new Date(resetsAtIso).getTime() - now.getTime()
  if (diffMs <= 0) {
    return 'resets now'
  }
  const totalMinutes = Math.round(diffMs / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  if (days >= 1) {
    return `resets in ${days}d`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours >= 1) {
    return `resets in ${hours}h ${minutes}m`
  }
  return `resets in ${minutes}m`
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/format.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/shared tests/format.test.ts
git commit -m "feat: add shared usage types and countdown formatting"
```

---

## Task 3: Rolling-window token aggregation

**Files:**
- Create: `src/providers/claude-code/windowCalc.ts`
- Test: `tests/windowCalc.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TurnRow` (consumed by Task 5's `usageDb.ts` and Task 6's provider), `CACHE_READ_WEIGHT`, `tokensForTurn(turn: TurnRow): number`, `computeWindow(turns: TurnRow[], windowMs: number, now: Date): { usedTokens: number; resetsAt: Date }` (consumed by Task 6).

- [ ] **Step 1: Write the failing test**

Create `tests/windowCalc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeWindow, tokensForTurn, type TurnRow } from '../src/providers/claude-code/windowCalc'

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000

function turn(
  timestamp: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheCreationTokens = 0
): TurnRow {
  return { timestamp, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }
}

describe('tokensForTurn', () => {
  it('sums input, output, and cache-creation tokens but not cache-read tokens', () => {
    expect(tokensForTurn(turn('2026-07-23T10:00:00.000Z', 100, 200, 5000, 10))).toBe(310)
  })
})

describe('computeWindow', () => {
  const now = new Date('2026-07-23T12:00:00.000Z')

  it('returns zero usage and resetsAt=now when there are no turns', () => {
    const result = computeWindow([], FIVE_HOURS_MS, now)
    expect(result.usedTokens).toBe(0)
    expect(result.resetsAt).toEqual(now)
  })

  it('excludes turns older than the window', () => {
    const turns = [turn('2026-07-23T06:00:00.000Z', 1000, 1000)]
    const result = computeWindow(turns, FIVE_HOURS_MS, now)
    expect(result.usedTokens).toBe(0)
  })

  it('sums turns inside the window', () => {
    const turns = [turn('2026-07-23T11:00:00.000Z', 100, 50), turn('2026-07-23T11:30:00.000Z', 200, 100)]
    const result = computeWindow(turns, FIVE_HOURS_MS, now)
    expect(result.usedTokens).toBe(450)
  })

  it('sets resetsAt to the oldest in-window turn plus the window duration', () => {
    const turns = [turn('2026-07-23T11:00:00.000Z', 100, 50), turn('2026-07-23T11:30:00.000Z', 200, 100)]
    const result = computeWindow(turns, FIVE_HOURS_MS, now)
    expect(result.resetsAt).toEqual(new Date('2026-07-23T16:00:00.000Z'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/windowCalc.test.ts
```

Expected: FAIL — `Cannot find module '../src/providers/claude-code/windowCalc'`.

- [ ] **Step 3: Create `src/providers/claude-code/windowCalc.ts`**

```ts
export interface TurnRow {
  timestamp: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export const CACHE_READ_WEIGHT = 0

export function tokensForTurn(turn: TurnRow): number {
  return turn.inputTokens + turn.outputTokens + turn.cacheCreationTokens + turn.cacheReadTokens * CACHE_READ_WEIGHT
}

export interface WindowResult {
  usedTokens: number
  resetsAt: Date
}

export function computeWindow(turns: TurnRow[], windowMs: number, now: Date): WindowResult {
  const windowStart = now.getTime() - windowMs
  const inWindow = turns.filter((t) => new Date(t.timestamp).getTime() >= windowStart)
  if (inWindow.length === 0) {
    return { usedTokens: 0, resetsAt: now }
  }
  const usedTokens = inWindow.reduce((sum, t) => sum + tokensForTurn(t), 0)
  const oldestMs = inWindow.reduce(
    (oldest, t) => Math.min(oldest, new Date(t.timestamp).getTime()),
    new Date(inWindow[0].timestamp).getTime()
  )
  return { usedTokens, resetsAt: new Date(oldestMs + windowMs) }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/windowCalc.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/providers/claude-code/windowCalc.ts tests/windowCalc.test.ts
git commit -m "feat: add rolling-window token aggregation"
```

---

## Task 4: Plan-tier limit lookup

**Files:**
- Create: `config/plan-limits.json`
- Create: `src/providers/claude-code/planLimits.ts`
- Test: `tests/planLimits.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PlanLimits`, `PlanLimitsConfig`, `getLimitsForTier(config: PlanLimitsConfig, tier: string | null): PlanLimits` (consumed by Task 6).

- [ ] **Step 1: Write the failing test**

Create `tests/planLimits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getLimitsForTier, type PlanLimitsConfig } from '../src/providers/claude-code/planLimits'

const config: PlanLimitsConfig = {
  defaultTier: 'claude_pro',
  tiers: {
    claude_pro: { five_hour: 200000, weekly: 2000000 },
    claude_max_5x: { five_hour: 1000000, weekly: 10000000 },
  },
}

describe('getLimitsForTier', () => {
  it('returns the limits for a known tier', () => {
    expect(getLimitsForTier(config, 'claude_max_5x')).toEqual({ five_hour: 1000000, weekly: 10000000 })
  })

  it('falls back to the default tier when the tier is unknown', () => {
    expect(getLimitsForTier(config, 'some_future_tier')).toEqual({ five_hour: 200000, weekly: 2000000 })
  })

  it('falls back to the default tier when the tier is null', () => {
    expect(getLimitsForTier(config, null)).toEqual({ five_hour: 200000, weekly: 2000000 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/planLimits.test.ts
```

Expected: FAIL — `Cannot find module '../src/providers/claude-code/planLimits'`.

- [ ] **Step 3: Create `src/providers/claude-code/planLimits.ts`**

```ts
export interface PlanLimits {
  five_hour: number
  weekly: number
}

export interface PlanLimitsConfig {
  defaultTier: string
  notes?: string
  tiers: Record<string, PlanLimits>
}

export function getLimitsForTier(config: PlanLimitsConfig, tier: string | null): PlanLimits {
  if (tier && config.tiers[tier]) {
    return config.tiers[tier]
  }
  return config.tiers[config.defaultTier]
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/planLimits.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Create `config/plan-limits.json`**

```json
{
  "defaultTier": "claude_pro",
  "notes": "Anthropic does not publish exact 5h/weekly token thresholds. These are rough community-estimated starting points, scaled from the Pro tier by each plan's advertised usage multiplier. Edit the numbers below once you've observed your own real limits.",
  "tiers": {
    "claude_pro": { "five_hour": 200000, "weekly": 2000000 },
    "claude_max_5x": { "five_hour": 1000000, "weekly": 10000000 },
    "claude_max_20x": { "five_hour": 4000000, "weekly": 40000000 }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add config/plan-limits.json src/providers/claude-code/planLimits.ts tests/planLimits.test.ts
git commit -m "feat: add editable plan-tier token limits"
```

---

## Task 5: Read turns from `usage.db` via `node:sqlite`

**Files:**
- Create: `src/providers/claude-code/usageDb.ts`
- Test: `tests/usageDb.test.ts`

**Interfaces:**
- Consumes: `TurnRow` from Task 3 (`src/providers/claude-code/windowCalc.ts`).
- Produces: `readTurnsSince(dbPath: string, sinceIso: string): TurnRow[]`, `readLatestModel(dbPath: string): string | null` (both consumed by Task 6).

- [ ] **Step 1: Write the failing test**

Create `tests/usageDb.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readTurnsSince, readLatestModel } from '../src/providers/claude-code/usageDb'

let dbPath: string

function createFixtureDb(path_: string): void {
  const db = new DatabaseSync(path_)
  db.exec(`
    CREATE TABLE turns (
      timestamp TEXT,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_creation_tokens INTEGER
    )
  `)
  db.exec(`INSERT INTO turns VALUES ('2026-07-23T09:00:00.000Z', 'claude-opus-4-8', 10, 20, 0, 0)`)
  db.exec(`INSERT INTO turns VALUES ('2026-07-23T11:00:00.000Z', 'claude-sonnet-5', 100, 200, 50, 5)`)
  db.close()
}

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `token-pulse-usagedb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  createFixtureDb(dbPath)
})

afterEach(() => {
  fs.rmSync(dbPath, { force: true })
})

describe('readTurnsSince', () => {
  it('returns only turns at or after the given timestamp, oldest first', () => {
    const rows = readTurnsSince(dbPath, '2026-07-23T10:00:00.000Z')
    expect(rows).toEqual([
      {
        timestamp: '2026-07-23T11:00:00.000Z',
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 50,
        cacheCreationTokens: 5,
      },
    ])
  })
})

describe('readLatestModel', () => {
  it('returns the model of the most recent turn', () => {
    expect(readLatestModel(dbPath)).toBe('claude-sonnet-5')
  })

  it('returns null when there are no turns', () => {
    fs.rmSync(dbPath, { force: true })
    const db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE turns (
        timestamp TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
        cache_read_tokens INTEGER, cache_creation_tokens INTEGER
      )
    `)
    db.close()
    expect(readLatestModel(dbPath)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/usageDb.test.ts
```

Expected: FAIL — `Cannot find module '../src/providers/claude-code/usageDb'`.

- [ ] **Step 3: Create `src/providers/claude-code/usageDb.ts`**

```ts
import { DatabaseSync } from 'node:sqlite'
import type { TurnRow } from './windowCalc'

export function readTurnsSince(dbPath: string, sinceIso: string): TurnRow[] {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return db
      .prepare(
        `SELECT timestamp,
                input_tokens as inputTokens,
                output_tokens as outputTokens,
                cache_read_tokens as cacheReadTokens,
                cache_creation_tokens as cacheCreationTokens
         FROM turns
         WHERE timestamp >= ?
         ORDER BY timestamp ASC`
      )
      .all(sinceIso) as unknown as TurnRow[]
  } finally {
    db.close()
  }
}

export function readLatestModel(dbPath: string): string | null {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const row = db.prepare(`SELECT model FROM turns ORDER BY timestamp DESC LIMIT 1`).get() as
      | { model: string }
      | undefined
    return row?.model ?? null
  } finally {
    db.close()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/usageDb.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/providers/claude-code/usageDb.ts tests/usageDb.test.ts
git commit -m "feat: read turns and latest model from usage.db via node:sqlite"
```

---

## Task 6: ClaudeCodeProvider

**Files:**
- Create: `src/providers/claude-code/index.ts`
- Test: `tests/provider.test.ts`

**Interfaces:**
- Consumes: `computeWindow` (Task 3), `readTurnsSince`/`readLatestModel` (Task 5), `getLimitsForTier`/`PlanLimitsConfig` (Task 4), `UsageWindow` (Task 2).
- Produces: `ClaudeCodeProvider` class with `getPlanTier(): string | null`, `getCurrentModel(): string | null`, `getWindow(id: 'five_hour' | 'weekly', now?: Date): UsageWindow` (all consumed by Task 11's `electron/main.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/provider.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeProvider } from '../src/providers/claude-code'
import type { PlanLimitsConfig } from '../src/providers/claude-code/planLimits'

let dir: string
let dbPath: string
let claudeJsonPath: string

const planLimitsConfig: PlanLimitsConfig = {
  defaultTier: 'claude_pro',
  tiers: {
    claude_pro: { five_hour: 1000, weekly: 10000 },
    claude_max_5x: { five_hour: 5000, weekly: 50000 },
  },
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-provider-test-'))
  dbPath = path.join(dir, 'usage.db')
  claudeJsonPath = path.join(dir, 'claude.json')

  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE turns (
      timestamp TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
      cache_read_tokens INTEGER, cache_creation_tokens INTEGER
    )
  `)
  db.exec(`INSERT INTO turns VALUES ('2026-07-23T11:00:00.000Z', 'claude-sonnet-5', 100, 100, 0, 0)`)
  db.close()

  fs.writeFileSync(claudeJsonPath, JSON.stringify({ oauthAccount: { organizationType: 'claude_max_5x' } }))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('ClaudeCodeProvider', () => {
  it('reads the plan tier from claude.json', () => {
    const provider = new ClaudeCodeProvider({ claudeJsonPath, usageDbPath: dbPath, planLimitsConfig })
    expect(provider.getPlanTier()).toBe('claude_max_5x')
  })

  it('falls back to null when claude.json is missing', () => {
    const provider = new ClaudeCodeProvider({
      claudeJsonPath: path.join(dir, 'missing.json'),
      usageDbPath: dbPath,
      planLimitsConfig,
    })
    expect(provider.getPlanTier()).toBeNull()
  })

  it('reads the most recent model from usage.db', () => {
    const provider = new ClaudeCodeProvider({ claudeJsonPath, usageDbPath: dbPath, planLimitsConfig })
    expect(provider.getCurrentModel()).toBe('claude-sonnet-5')
  })

  it('computes the five_hour window using the tier-specific limit', () => {
    const provider = new ClaudeCodeProvider({ claudeJsonPath, usageDbPath: dbPath, planLimitsConfig })
    const now = new Date('2026-07-23T12:00:00.000Z')
    const window = provider.getWindow('five_hour', now)
    expect(window.usedTokens).toBe(200)
    expect(window.limitTokens).toBe(5000)
    expect(window.percentUsed).toBe(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/provider.test.ts
```

Expected: FAIL — `Cannot find module '../src/providers/claude-code'`.

- [ ] **Step 3: Create `src/providers/claude-code/index.ts`**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { computeWindow } from './windowCalc'
import { readTurnsSince, readLatestModel } from './usageDb'
import { getLimitsForTier, type PlanLimitsConfig } from './planLimits'
import type { UsageWindow } from '../../shared/types'

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const WINDOW_DEFS: Record<'five_hour' | 'weekly', { label: string; durationMs: number }> = {
  five_hour: { label: 'Every 5 hours', durationMs: FIVE_HOURS_MS },
  weekly: { label: 'Weekly', durationMs: SEVEN_DAYS_MS },
}

export interface ClaudeCodeProviderOptions {
  claudeJsonPath?: string
  usageDbPath?: string
  planLimitsConfig: PlanLimitsConfig
}

export class ClaudeCodeProvider {
  private readonly claudeJsonPath: string
  private readonly usageDbPath: string
  private readonly planLimitsConfig: PlanLimitsConfig

  constructor(options: ClaudeCodeProviderOptions) {
    this.claudeJsonPath = options.claudeJsonPath ?? path.join(os.homedir(), '.claude.json')
    this.usageDbPath = options.usageDbPath ?? path.join(os.homedir(), '.claude', 'usage.db')
    this.planLimitsConfig = options.planLimitsConfig
  }

  getPlanTier(): string | null {
    try {
      const raw = fs.readFileSync(this.claudeJsonPath, 'utf-8')
      const parsed = JSON.parse(raw) as { oauthAccount?: { organizationType?: string } }
      return parsed.oauthAccount?.organizationType ?? null
    } catch {
      return null
    }
  }

  getCurrentModel(): string | null {
    try {
      return readLatestModel(this.usageDbPath)
    } catch {
      return null
    }
  }

  getWindow(id: 'five_hour' | 'weekly', now: Date = new Date()): UsageWindow {
    const def = WINDOW_DEFS[id]
    const limits = getLimitsForTier(this.planLimitsConfig, this.getPlanTier())
    let turns: ReturnType<typeof readTurnsSince> = []
    try {
      const since = new Date(now.getTime() - def.durationMs).toISOString()
      turns = readTurnsSince(this.usageDbPath, since)
    } catch {
      turns = []
    }
    const { usedTokens, resetsAt } = computeWindow(turns, def.durationMs, now)
    const limitTokens = id === 'five_hour' ? limits.five_hour : limits.weekly
    return {
      id,
      label: def.label,
      usedTokens,
      limitTokens,
      percentUsed: limitTokens > 0 ? (usedTokens / limitTokens) * 100 : 0,
      resetsAt: resetsAt.toISOString(),
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/provider.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/providers/claude-code/index.ts tests/provider.test.ts
git commit -m "feat: add ClaudeCodeProvider combining plan tier, model, and usage windows"
```

---

## Task 7: Urgency color mapping

**Files:**
- Create: `src/shared/urgencyColor.ts`
- Test: `tests/urgencyColor.test.ts`

**Interfaces:**
- Produces: `UrgencyColor` type, `urgencyColorForPercent(percentUsed: number): UrgencyColor` (consumed by Task 8's tray icon renderer and Task 12's renderer styling).

- [ ] **Step 1: Write the failing test**

Create `tests/urgencyColor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { urgencyColorForPercent } from '../src/shared/urgencyColor'

describe('urgencyColorForPercent', () => {
  it('returns green below 70%', () => {
    expect(urgencyColorForPercent(0)).toBe('green')
    expect(urgencyColorForPercent(69.9)).toBe('green')
  })

  it('returns yellow from 70% up to 90%', () => {
    expect(urgencyColorForPercent(70)).toBe('yellow')
    expect(urgencyColorForPercent(89.9)).toBe('yellow')
  })

  it('returns red at 90% and above, including over 100%', () => {
    expect(urgencyColorForPercent(90)).toBe('red')
    expect(urgencyColorForPercent(150)).toBe('red')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/urgencyColor.test.ts
```

Expected: FAIL — `Cannot find module '../src/shared/urgencyColor'`.

- [ ] **Step 3: Create `src/shared/urgencyColor.ts`**

```ts
export type UrgencyColor = 'green' | 'yellow' | 'red'

export function urgencyColorForPercent(percentUsed: number): UrgencyColor {
  if (percentUsed >= 90) {
    return 'red'
  }
  if (percentUsed >= 70) {
    return 'yellow'
  }
  return 'green'
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/urgencyColor.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/urgencyColor.ts tests/urgencyColor.test.ts
git commit -m "feat: add usage urgency color thresholds"
```

---

## Task 8: Tray icon bar rendering

**Files:**
- Create: `src/main/trayIcon.ts`
- Test: `tests/trayIcon.test.ts`

**Interfaces:**
- Consumes: `urgencyColorForPercent` (Task 7).
- Produces: `ICON_SIZE`, `renderUsageBarPng(percentUsed: number, size?: number): Buffer` (consumed by Task 10's `electron/tray.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/trayIcon.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import { renderUsageBarPng } from '../src/main/trayIcon'

function pixelAt(png: PNG, x: number, y: number): [number, number, number, number] {
  const idx = (png.width * y + x) << 2
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]]
}

describe('renderUsageBarPng', () => {
  it('produces a PNG of the requested size', () => {
    const png = PNG.sync.read(renderUsageBarPng(50, 10))
    expect(png.width).toBe(10)
    expect(png.height).toBe(10)
  })

  it('fills bottom rows up to the percentage and leaves the rest as track color', () => {
    const png = PNG.sync.read(renderUsageBarPng(50, 10))
    expect(pixelAt(png, 0, 9)).toEqual([52, 199, 89, 255])
    expect(pixelAt(png, 0, 0)).toEqual([128, 128, 128, 90])
  })

  it('uses red fill color at 90% or above', () => {
    const png = PNG.sync.read(renderUsageBarPng(95, 10))
    expect(pixelAt(png, 0, 9)).toEqual([255, 59, 48, 255])
  })

  it('clamps values above 100 to a fully filled bar', () => {
    const png = PNG.sync.read(renderUsageBarPng(250, 10))
    expect(pixelAt(png, 0, 0)).toEqual([255, 59, 48, 255])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/trayIcon.test.ts
```

Expected: FAIL — `Cannot find module '../src/main/trayIcon'`.

- [ ] **Step 3: Create `src/main/trayIcon.ts`**

```ts
import { PNG } from 'pngjs'
import { urgencyColorForPercent, type UrgencyColor } from '../shared/urgencyColor'

export const ICON_SIZE = 16

const FILLED_RGBA: Record<UrgencyColor, [number, number, number, number]> = {
  green: [52, 199, 89, 255],
  yellow: [255, 204, 0, 255],
  red: [255, 59, 48, 255],
}

const TRACK_RGBA: [number, number, number, number] = [128, 128, 128, 90]

export function renderUsageBarPng(percentUsed: number, size: number = ICON_SIZE): Buffer {
  const clamped = Math.max(0, Math.min(100, percentUsed))
  const filledRows = Math.round((clamped / 100) * size)
  const filledColor = FILLED_RGBA[urgencyColorForPercent(percentUsed)]
  const png = new PNG({ width: size, height: size })

  for (let y = 0; y < size; y++) {
    const rowFromBottom = size - 1 - y
    const isFilled = rowFromBottom < filledRows
    const [r, g, b, a] = isFilled ? filledColor : TRACK_RGBA
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2
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

```bash
npx vitest run tests/trayIcon.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/trayIcon.ts tests/trayIcon.test.ts
git commit -m "feat: render tray icon usage bar as a PNG buffer"
```

---

## Task 9: Settings persistence

**Files:**
- Create: `src/main/settingsStore.ts`
- Test: `tests/settingsStore.test.ts`

**Interfaces:**
- Produces: `AppSettings` (`{ startAtLogin: boolean }`), `readSettings(filePath: string): AppSettings`, `writeSettings(filePath: string, settings: AppSettings): void` (consumed by Task 13).

- [ ] **Step 1: Write the failing test**

Create `tests/settingsStore.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSettings, writeSettings } from '../src/main/settingsStore'

let filePath: string

afterEach(() => {
  fs.rmSync(filePath, { force: true })
})

describe('settingsStore', () => {
  it('returns defaults when the file does not exist', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-missing-${Date.now()}.json`)
    expect(readSettings(filePath)).toEqual({ startAtLogin: false })
  })

  it('round-trips a written value', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-roundtrip-${Date.now()}.json`)
    writeSettings(filePath, { startAtLogin: true })
    expect(readSettings(filePath)).toEqual({ startAtLogin: true })
  })

  it('merges partial file contents with defaults', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-partial-${Date.now()}.json`)
    fs.writeFileSync(filePath, JSON.stringify({}))
    expect(readSettings(filePath)).toEqual({ startAtLogin: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/settingsStore.test.ts
```

Expected: FAIL — `Cannot find module '../src/main/settingsStore'`.

- [ ] **Step 3: Create `src/main/settingsStore.ts`**

```ts
import fs from 'node:fs'

export interface AppSettings {
  startAtLogin: boolean
}

const DEFAULT_SETTINGS: AppSettings = { startAtLogin: false }

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

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/settingsStore.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/settingsStore.ts tests/settingsStore.test.ts
git commit -m "feat: add settings persistence for start-at-login"
```

---

## Task 10: Tray + popup window wiring (manual verification)

No automated tests — this task wires real Electron APIs (`Tray`, `BrowserWindow`, `Menu`) that aren't meaningfully unit-testable. Verification is manual, per the spec's testing strategy.

**Files:**
- Create: `electron/tray.ts`
- Create: `electron/windowManager.ts`
- Modify: `electron/main.ts`

**Interfaces:**
- Consumes: `renderUsageBarPng` (Task 8).
- Produces: `createTray`, `updateTrayIcon`, `getTray` (`electron/tray.ts`); `togglePopup`, `getPopupIfExists` (`electron/windowManager.ts`) — both consumed by Task 11.

- [ ] **Step 1: Create `electron/tray.ts`**

```ts
import { Tray, nativeImage, Menu, app } from 'electron'
import { renderUsageBarPng } from '../src/main/trayIcon'

let tray: Tray | null = null

export function createTray(onClick: (tray: Tray) => void): Tray {
  tray = new Tray(nativeImage.createFromBuffer(renderUsageBarPng(0)))
  tray.setToolTip('token-pulse')
  tray.on('click', () => onClick(tray as Tray))
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }]))
  return tray
}

export function updateTrayIcon(percentUsed: number): void {
  if (!tray) {
    return
  }
  tray.setImage(nativeImage.createFromBuffer(renderUsageBarPng(percentUsed)))
}

export function getTray(): Tray | null {
  return tray
}
```

- [ ] **Step 2: Create `electron/windowManager.ts`**

```ts
import { BrowserWindow, Tray, screen } from 'electron'
import path from 'node:path'

let popup: BrowserWindow | null = null

export interface PopupSource {
  devServerUrl?: string
  rendererDist?: string
}

export function getOrCreatePopup(preloadPath: string, source: PopupSource): BrowserWindow {
  if (popup) {
    return popup
  }
  popup = new BrowserWindow({
    width: 320,
    height: 220,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: { preload: preloadPath },
  })
  if (source.devServerUrl) {
    popup.loadURL(source.devServerUrl)
  } else if (source.rendererDist) {
    popup.loadFile(path.join(source.rendererDist, 'index.html'))
  }
  popup.on('blur', () => popup?.hide())
  return popup
}

export function togglePopup(tray: Tray, preloadPath: string, source: PopupSource): void {
  const win = getOrCreatePopup(preloadPath, source)
  if (win.isVisible()) {
    win.hide()
    return
  }
  const trayBounds = tray.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const windowBounds = win.getBounds()
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
  const y = process.platform === 'darwin' ? trayBounds.y + trayBounds.height : trayBounds.y - windowBounds.height
  const clampedX = Math.min(Math.max(x, display.workArea.x), display.workArea.x + display.workArea.width - windowBounds.width)
  win.setPosition(clampedX, y)
  win.show()
  win.focus()
}

export function getPopupIfExists(): BrowserWindow | null {
  return popup
}
```

- [ ] **Step 3: Replace `electron/main.ts`**

```ts
import { app } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTray, updateTrayIcon } from './tray'
import { togglePopup } from './windowManager'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs')

app.whenReady().then(() => {
  const tray = createTray((trayRef) => {
    togglePopup(trayRef, PRELOAD_PATH, { devServerUrl: VITE_DEV_SERVER_URL, rendererDist: RENDERER_DIST })
  })
  updateTrayIcon(35)
})

app.on('window-all-closed', () => {
  // Intentionally do nothing — the app lives in the tray.
})
```

- [ ] **Step 4: Manually verify**

```bash
npm run dev
```

Expected: no visible top-level window opens (the old default window is gone); a tray/menu-bar icon appears showing a partially-filled green bar (35%). Click it: a small frameless popup appears anchored near the tray icon (blank white page is fine — the real UI isn't wired yet). Click the tray icon again, or click elsewhere: the popup hides. Right-click the tray icon: a "Quit" menu item appears and quits the app when clicked.

- [ ] **Step 5: Commit**

```bash
git add electron/tray.ts electron/windowManager.ts electron/main.ts
git commit -m "feat: wire tray icon and popup window with a stub usage value"
```

---

## Task 11: Wire the real provider with dual-cadence polling

**Files:**
- Modify: `electron/main.ts`

**Interfaces:**
- Consumes: `ClaudeCodeProvider` (Task 6), `PlanLimitsConfig` (Task 4), `UsageState` (Task 2), `createTray`/`updateTrayIcon` (Task 10), `togglePopup`/`getPopupIfExists` (Task 10).
- Produces: an `usage:update` IPC channel emitting `UsageState`, pushed to the popup whenever it's visible (consumed by Task 12's `src/App.tsx`).

- [ ] **Step 1: Replace `electron/main.ts`**

```ts
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTray, updateTrayIcon } from './tray'
import { togglePopup, getPopupIfExists } from './windowManager'
import { ClaudeCodeProvider } from '../src/providers/claude-code'
import type { PlanLimitsConfig } from '../src/providers/claude-code/planLimits'
import type { UsageState } from '../src/shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs')

const FIVE_HOUR_POLL_MS = 5 * 1000
const WEEKLY_POLL_MS = 6 * 60 * 60 * 1000

const planLimitsConfig = JSON.parse(
  fs.readFileSync(path.join(process.env.APP_ROOT, 'config', 'plan-limits.json'), 'utf-8')
) as PlanLimitsConfig

const provider = new ClaudeCodeProvider({ planLimitsConfig })

let state: UsageState = {
  planTier: planLimitsConfig.defaultTier,
  currentModel: null,
  windows: [provider.getWindow('five_hour'), provider.getWindow('weekly')],
  updatedAt: new Date().toISOString(),
  startAtLogin: false,
}

function pushState(): void {
  updateTrayIcon(state.windows[0].percentUsed)
  const popup = getPopupIfExists()
  if (popup && popup.isVisible()) {
    popup.webContents.send('usage:update', state)
  }
}

function pollFiveHour(): void {
  state = { ...state, windows: [provider.getWindow('five_hour'), state.windows[1]], updatedAt: new Date().toISOString() }
  pushState()
}

function pollWeekly(): void {
  state = {
    ...state,
    planTier: provider.getPlanTier() ?? planLimitsConfig.defaultTier,
    currentModel: provider.getCurrentModel(),
    windows: [state.windows[0], provider.getWindow('weekly')],
    updatedAt: new Date().toISOString(),
  }
  pushState()
}

app.whenReady().then(() => {
  const tray = createTray((trayRef) => {
    togglePopup(trayRef, PRELOAD_PATH, { devServerUrl: VITE_DEV_SERVER_URL, rendererDist: RENDERER_DIST })
    pushState()
  })
  pollFiveHour()
  pollWeekly()
  setInterval(pollFiveHour, FIVE_HOUR_POLL_MS)
  setInterval(pollWeekly, WEEKLY_POLL_MS)
})

app.on('window-all-closed', () => {
  // Intentionally do nothing — the app lives in the tray.
})
```

- [ ] **Step 2: Temporarily add verification logging**

In `pollFiveHour`, temporarily add a log line so the terminal shows what's being computed:

```ts
function pollFiveHour(): void {
  state = { ...state, windows: [provider.getWindow('five_hour'), state.windows[1]], updatedAt: new Date().toISOString() }
  console.log('[five_hour]', JSON.stringify(state.windows[0]))
  pushState()
}
```

- [ ] **Step 3: Run and observe**

```bash
npm run dev
```

Expected: every 5 seconds, the terminal prints a `[five_hour]` line with real `usedTokens`/`percentUsed` numbers computed from your actual `~/.claude/usage.db`.

- [ ] **Step 4: Cross-check the number independently**

In a separate terminal:

```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const os = require('os');
const path = require('path');
const db = new DatabaseSync(path.join(os.homedir(), '.claude', 'usage.db'), { readOnly: true });
const since = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
const rows = db.prepare('SELECT input_tokens, output_tokens, cache_creation_tokens FROM turns WHERE timestamp >= ?').all(since);
const total = rows.reduce((sum, r) => sum + r.input_tokens + r.output_tokens + r.cache_creation_tokens, 0);
console.log('independent total:', total);
"
```

Expected: `independent total` matches the `usedTokens` value the app just logged (within a few seconds of drift, since both queries use "now").

- [ ] **Step 5: Remove the temporary log line**

Remove the `console.log('[five_hour]', ...)` line added in Step 2.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "feat: poll real usage data on dual cadence and push via IPC"
```

---

## Task 12: Renderer UI (widget panel)

**Files:**
- Create: `src/components/UsageBar.tsx`
- Create: `src/components/WidgetPanel.tsx`
- Modify: `src/App.tsx`
- Create: `src/App.css`

**Interfaces:**
- Consumes: `UsageState`/`UsageWindow` (Task 2), `formatCountdown` (Task 2), the `usage:update` IPC channel (Task 11).

- [ ] **Step 1: Create `src/components/UsageBar.tsx`**

```tsx
import type { UsageWindow } from '../shared/types'
import { formatCountdown } from '../shared/format'

export function UsageBar({ window }: { window: UsageWindow }) {
  const percent = Math.min(100, Math.max(0, window.percentUsed))
  return (
    <div className="usage-bar">
      <div className="usage-bar__header">
        <span>{window.label}</span>
        <span>{Math.round(window.percentUsed)}%</span>
      </div>
      <div className="usage-bar__track">
        <div className="usage-bar__fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="usage-bar__footer">{formatCountdown(window.resetsAt)}</div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/WidgetPanel.tsx`**

```tsx
import type { UsageState } from '../shared/types'
import { UsageBar } from './UsageBar'

export function WidgetPanel({ state }: { state: UsageState | null }) {
  if (!state) {
    return <div className="widget-panel">Loading usage…</div>
  }
  const fiveHour = state.windows.find((w) => w.id === 'five_hour')
  const weekly = state.windows.find((w) => w.id === 'weekly')
  return (
    <div className="widget-panel">
      <div className="widget-panel__header">
        <span>{state.currentModel ?? 'No recent activity'}</span>
        <span className="widget-panel__tier">{state.planTier}</span>
      </div>
      {fiveHour && <UsageBar window={fiveHour} />}
      {weekly && <UsageBar window={weekly} />}
    </div>
  )
}
```

- [ ] **Step 3: Replace `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { WidgetPanel } from './components/WidgetPanel'
import type { UsageState } from './shared/types'
import './App.css'

export default function App() {
  const [state, setState] = useState<UsageState | null>(null)

  useEffect(() => {
    const listener = (_event: unknown, next: UsageState) => setState(next)
    window.ipcRenderer.on('usage:update', listener)
    return () => {
      window.ipcRenderer.off('usage:update', listener)
    }
  }, [])

  return <WidgetPanel state={state} />
}
```

- [ ] **Step 4: Create `src/App.css`**

```css
.widget-panel {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #1c1c1e;
  color: #f5f5f7;
  border-radius: 16px;
  padding: 16px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}

.widget-panel__header {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 12px;
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
  background: #3a3a3c;
  border-radius: 6px;
  height: 8px;
  overflow: hidden;
}

.usage-bar__fill {
  background: #0a84ff;
  height: 100%;
}

.usage-bar__footer {
  font-size: 0.75em;
  opacity: 0.6;
  margin-top: 4px;
}
```

- [ ] **Step 5: Manually verify**

```bash
npm run dev
```

Expected: clicking the tray icon opens a dark rounded-card popup showing your current model name, plan tier, and two bars (5h / weekly) each with a live percentage and a "resets in …" line, matching the reference screenshot's style.

- [ ] **Step 6: Commit**

```bash
git add src/components src/App.tsx src/App.css
git commit -m "feat: build the widget panel UI showing live usage bars"
```

---

## Task 13: Start-at-login toggle

**Files:**
- Create: `src/main/autostart.ts`
- Test: `tests/autostart.test.ts`
- Create: `electron/autostart.ts`
- Modify: `electron/main.ts`
- Modify: `src/components/WidgetPanel.tsx`

**Interfaces:**
- Consumes: `readSettings`/`writeSettings` (Task 9), `UsageState.startAtLogin` (Task 2).
- Produces: `buildLinuxAutostartEntry(execPath: string): string`; a `settings:setStartAtLogin` IPC channel.

- [ ] **Step 1: Write the failing test**

Create `tests/autostart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildLinuxAutostartEntry } from '../src/main/autostart'

describe('buildLinuxAutostartEntry', () => {
  it('produces a valid .desktop entry referencing the given executable path', () => {
    const entry = buildLinuxAutostartEntry('/opt/token-pulse/token-pulse')
    expect(entry).toContain('[Desktop Entry]')
    expect(entry).toContain('Exec=/opt/token-pulse/token-pulse')
    expect(entry).toContain('Name=token-pulse')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/autostart.test.ts
```

Expected: FAIL — `Cannot find module '../src/main/autostart'`.

- [ ] **Step 3: Create `src/main/autostart.ts`**

```ts
export function buildLinuxAutostartEntry(execPath: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=token-pulse',
    `Exec=${execPath}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
  ].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/autostart.test.ts
```

Expected: 1 passed.

- [ ] **Step 5: Create `electron/autostart.ts`**

```ts
import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildLinuxAutostartEntry } from '../src/main/autostart'

const LINUX_AUTOSTART_PATH = path.join(os.homedir(), '.config', 'autostart', 'token-pulse.desktop')

export function setStartAtLogin(enabled: boolean): void {
  if (process.platform === 'linux') {
    if (enabled) {
      fs.mkdirSync(path.dirname(LINUX_AUTOSTART_PATH), { recursive: true })
      fs.writeFileSync(LINUX_AUTOSTART_PATH, buildLinuxAutostartEntry(process.execPath))
    } else {
      fs.rmSync(LINUX_AUTOSTART_PATH, { force: true })
    }
    return
  }
  app.setLoginItemSettings({ openAtLogin: enabled })
}
```

- [ ] **Step 6: Modify `electron/main.ts`**

Add these imports at the top:

```ts
import { ipcMain } from 'electron'
import { readSettings, writeSettings } from '../src/main/settingsStore'
import { setStartAtLogin } from './autostart'
```

Add this constant near the other path constants:

```ts
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')
```

Replace the initial `state` declaration with:

```ts
let state: UsageState = {
  planTier: planLimitsConfig.defaultTier,
  currentModel: null,
  windows: [provider.getWindow('five_hour'), provider.getWindow('weekly')],
  updatedAt: new Date().toISOString(),
  startAtLogin: readSettings(SETTINGS_PATH).startAtLogin,
}
```

Add this handler before `app.whenReady()`:

```ts
ipcMain.handle('settings:setStartAtLogin', (_event, enabled: boolean) => {
  writeSettings(SETTINGS_PATH, { startAtLogin: enabled })
  setStartAtLogin(enabled)
  state = { ...state, startAtLogin: enabled }
  pushState()
})
```

- [ ] **Step 7: Modify `src/components/WidgetPanel.tsx`**

Add a toggle at the bottom of the returned JSX, just before the closing `</div>`:

```tsx
      <label className="widget-panel__autostart">
        <input
          type="checkbox"
          checked={state.startAtLogin}
          onChange={(e) => window.ipcRenderer.invoke('settings:setStartAtLogin', e.target.checked)}
        />
        Start at login
      </label>
```

- [ ] **Step 8: Manually verify persistence**

```bash
npm run dev
```

Open the popup, toggle "Start at login" on. Then, in another terminal:

```bash
cat ~/Library/Application\ Support/token-pulse/settings.json
```

Expected: `{"startAtLogin": true}`. Quit the app via the tray's right-click "Quit" menu, run `npm run dev` again, open the popup: the checkbox is still checked. (Note: true OS-level login-item registration is only meaningful for the packaged app, not this dev-mode Electron binary — that's verified in Task 14.)

- [ ] **Step 9: Commit**

```bash
git add src/main/autostart.ts tests/autostart.test.ts electron/autostart.ts electron/main.ts src/components/WidgetPanel.tsx
git commit -m "feat: add start-at-login toggle with persisted settings"
```

---

## Task 14: Package and verify on macOS

**Files:**
- Modify: `electron-builder.json5` (already final from Task 1 — this task only verifies the build)

**Interfaces:**
- Consumes: the full app built by Tasks 1–13.

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: `tsc --noEmit` passes, `vite build` produces `dist/` and `dist-electron/`, then `electron-builder` produces a `release/0.1.0/` directory.

- [ ] **Step 2: List the output**

```bash
ls release/0.1.0/
```

Expected: a `.dmg` file (e.g. `token-pulse-Mac-0.1.0-Installer.dmg`) and an unpacked `.app` directory (e.g. `mac-arm64/token-pulse.app` or `mac/token-pulse.app`, depending on your Mac's architecture).

- [ ] **Step 3: Launch the packaged app**

```bash
open release/0.1.0/mac-arm64/token-pulse.app
```

(Adjust the path to match whichever `mac*` directory Step 2 actually listed.)

Expected: a tray icon appears (not a dev-mode window). Click it: the popup shows real usage data, current model, and plan tier — same as in dev mode, now running from the packaged build.

- [ ] **Step 4: Verify start-at-login registers with the real OS**

In the packaged app's popup, toggle "Start at login" on. Then run:

```bash
osascript -e 'tell application "System Events" to get the name of every login item'
```

Expected: the output list includes `token-pulse`. Toggle it off in the app and re-run the command — `token-pulse` should no longer appear.

- [ ] **Step 5: Quit and clean up**

Quit the packaged app via its tray "Quit" menu item.

- [ ] **Step 6: Commit**

```bash
git status
```

If `electron-builder.json5` or any other tracked file changed during this task, commit it:

```bash
git add electron-builder.json5
git commit -m "chore: verify packaged build on macOS"
```

If nothing changed (likely, since this task only verifies Task 1's config), skip the commit — there's nothing to commit.

---

## Self-Review Notes

- **Spec coverage:** provider abstraction (Task 6), plan-tier auto-detection (Task 6), usage aggregation with documented cache-read weighting (Task 3), editable thresholds (Task 4), tray collapsed state (Task 8/10), expanded popup with bars/model/countdowns (Task 12), start-at-login (Task 13/9), dual-cadence polling (Task 11), packaging for mac/win/linux (Task 1/14) — all covered.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `UsageWindow`/`UsageState` (Task 2) are used identically by the provider (Task 6), main process (Task 11), and renderer (Task 12); `TurnRow` (Task 3) matches the column aliases selected in `usageDb.ts` (Task 5); `PlanLimitsConfig`/`PlanLimits` (Task 4) match the shape of `config/plan-limits.json`.
- **Windows/Linux packaging** (`nsis`, `AppImage`, `deb`) is configured in Task 1/14 but only build-verified on macOS in Task 14, since that's the only OS available in this environment — cross-platform manual verification is deferred to whenever the user has access to a Windows or Linux machine.
