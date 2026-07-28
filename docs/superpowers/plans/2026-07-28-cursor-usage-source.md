# Cursor Usage Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cursor as a real second usage source in token-pulse, activating the multi-source selector in the popup so it can switch between Claude and Cursor, including a cost-in-$ line for Cursor.

**Architecture:** A new `CursorProvider` (mirroring the existing `ClaudeCodeProvider`) reads Cursor's locally-stored OAuth token from its SQLite state file and calls Cursor's own internal Connect-RPC backend (`api2.cursor.sh`) with a minimal hand-rolled protobuf decoder — no protobuf library, no published schema, just the ~6 fields actually needed, verified against real captured response bytes. `electron/main.ts` polls both providers independently (each with its own activity-detection and refresh schedule) into a new `AppState.usageBySource` map; the renderer's header becomes a clickable `SourceSelector` that flips which source's data is shown, but only when more than one source is actually available.

**Tech Stack:** TypeScript, Electron (main process, Node `fetch`/`node:sqlite`), React 19, Vitest (+ `@testing-library/react`/jsdom for the one new component test file), `chokidar`.

## Global Constraints

- Cursor's access token lives at `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`, table `ItemTable`, key `cursorAuth/accessToken`, value is a **raw string** (not JSON-encoded) — never call `JSON.parse` on it.
- **Never log, print, or write the token value anywhere** (not to console, not to a file, not into a test assertion) — only its presence/absence and length are ever safe to reference.
- Dashboard RPC base URL: `https://api2.cursor.sh/aiserver.v1.DashboardService`. Auth via `Authorization: Bearer <token>` header, unary Connect protocol (`Content-Type: application/proto`, `Connect-Protocol-Version: 1`), empty request body for `GetCurrentPeriodUsage`.
- No protobuf codegen or third-party protobuf library — hand-decode only the fields listed in Task 4.
- Cursor polling must be more conservative than Claude's: active-interval baseline `5 * 60 * 1000` ms (vs. Claude's 3 min), same idle backoff shape, plus a new failure-backoff (doubling per consecutive failure, capped at `60 * 60 * 1000` ms) that Claude's provider does not need.
- The percent-used figure must be computed as `(totalSpendCents / limitCents) * 100` — this matches Cursor's own displayed "You've used X%" message exactly (verified); the response's own `totalPercentUsed` field does **not** match that message and must not be used.
- `node:sqlite`'s `DatabaseSync` must be opened with `{ readOnly: true }` — Cursor may have this file open itself.
- Cursor is only registered as a source at startup if a token is actually found — this is what makes the single-source (Claude-only) case render with no dropdown, matching current behavior exactly for machines without Cursor.
- Date formatting for Cursor's reset date must force `timeZone: 'UTC'` — never rely on the host machine's local timezone in a way that makes a test non-deterministic across machines.

---

### Task 1: Component-testing infrastructure

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/componentTestSetup.test.tsx`

**Interfaces:**
- Produces: a working jsdom + React Testing Library harness, scoped per-file via the `@vitest-environment jsdom` pragma (the global `vitest.config.ts` environment stays `'node'` for every other test file).

- [ ] **Step 1: Install the new dev dependencies**

```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add a setup file that registers jest-dom's matchers**

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Wire the setup file into Vitest**

Modify `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
})
```

- [ ] **Step 4: Write a smoke test proving jsdom + RTL work end to end**

Create `tests/componentTestSetup.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

describe('component test harness', () => {
  it('renders a component and queries it via testing-library', () => {
    render(<div>hello from jsdom</div>)
    expect(screen.getByText('hello from jsdom')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run it**

Run: `npx vitest run tests/componentTestSetup.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 6: Run the full suite to confirm nothing else broke**

Run: `npx vitest run`
Expected: all existing tests still PASS (the global environment is still `'node'` for them)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts tests/componentTestSetup.test.tsx
git commit -m "test: add jsdom + React Testing Library harness for component tests"
```

---

### Task 2: Cursor auth token reader

**Files:**
- Create: `src/providers/cursor/cursorAuth.ts`
- Test: `tests/cursorAuth.test.ts`

**Interfaces:**
- Produces: `readCursorAccessToken(dbPath?: string): string | null`, `defaultCursorStateDbPath(): string`

- [ ] **Step 1: Write the failing test**

Create `tests/cursorAuth.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readCursorAccessToken } from '../src/providers/cursor/cursorAuth'

let dir: string
let dbPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-cursor-auth-test-'))
  dbPath = path.join(dir, 'state.vscdb')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function createStateDb(rows: Record<string, string>): void {
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)')
  const insert = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(rows)) {
    insert.run(key, value)
  }
  db.close()
}

describe('readCursorAccessToken', () => {
  it('reads the raw token string from the ItemTable', () => {
    createStateDb({ 'cursorAuth/accessToken': 'fake-token-value' })
    expect(readCursorAccessToken(dbPath)).toBe('fake-token-value')
  })

  it('returns null when the key is missing', () => {
    createStateDb({ 'some/other/key': 'x' })
    expect(readCursorAccessToken(dbPath)).toBeNull()
  })

  it('returns null when the database file does not exist', () => {
    expect(readCursorAccessToken(path.join(dir, 'missing.vscdb'))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cursorAuth.test.ts`
Expected: FAIL with "Cannot find module '../src/providers/cursor/cursorAuth'"

- [ ] **Step 3: Write the implementation**

Create `src/providers/cursor/cursorAuth.ts`:

```ts
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function defaultCursorStateDbPath(): string {
  return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
}

// The value column stores a raw string for this key (not JSON-encoded) —
// never JSON.parse it, and never log/print the returned value.
export function readCursorAccessToken(dbPath: string = defaultCursorStateDbPath()): string | null {
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('cursorAuth/accessToken') as
        | { value: string }
        | undefined
      return row?.value ?? null
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cursorAuth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/cursorAuth.ts tests/cursorAuth.test.ts
git commit -m "feat: read Cursor's access token from its local state.vscdb"
```

---

### Task 3: Minimal protobuf field decoder

**Files:**
- Create: `src/providers/cursor/protobuf.ts`
- Test: `tests/protobuf.test.ts`

**Interfaces:**
- Produces: `decodeProtoFields(buf: Buffer, start?: number, end?: number): ProtoFields`, `getVarintNumber(fields: ProtoFields, fieldNumber: number): number | null`, `getDouble(fields: ProtoFields, fieldNumber: number): number | null`, `getString(fields: ProtoFields, fieldNumber: number): string | null`, `getSubmessage(fields: ProtoFields, fieldNumber: number): ProtoFields | null`, and the `ProtoFields`/`ProtoFieldValue` types.

- [ ] **Step 1: Write the failing test**

Create `tests/protobuf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decodeProtoFields, getVarintNumber, getString, getSubmessage } from '../src/providers/cursor/protobuf'

describe('decodeProtoFields', () => {
  it('decodes a varint field and a string field', () => {
    // field 1 (varint) = 150, field 2 (string) = "hi"
    const buf = Buffer.from([0x08, 0x96, 0x01, 0x12, 0x02, 0x68, 0x69])
    const fields = decodeProtoFields(buf)
    expect(getVarintNumber(fields, 1)).toBe(150)
    expect(getString(fields, 2)).toBe('hi')
  })

  it('returns null for a field that was not present', () => {
    const buf = Buffer.from([0x08, 0x01])
    const fields = decodeProtoFields(buf)
    expect(getVarintNumber(fields, 5)).toBeNull()
    expect(getString(fields, 5)).toBeNull()
    expect(getSubmessage(fields, 5)).toBeNull()
  })

  it('decodes a length-delimited submessage recursively', () => {
    // field 3 (submessage) containing: field 1 (varint) = 42
    const buf = Buffer.from([0x1a, 0x02, 0x08, 0x2a])
    const fields = decodeProtoFields(buf)
    const sub = getSubmessage(fields, 3)
    expect(sub).not.toBeNull()
    expect(getVarintNumber(sub!, 1)).toBe(42)
  })

  it('decodes a multi-byte varint correctly', () => {
    // field 1 (varint) = 1786014291000
    const buf = Buffer.from([0x08, 0xb8, 0xa8, 0xfd, 0xb5, 0xfd, 0x33])
    const fields = decodeProtoFields(buf)
    expect(getVarintNumber(fields, 1)).toBe(1786014291000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/protobuf.test.ts`
Expected: FAIL with "Cannot find module '../src/providers/cursor/protobuf'"

- [ ] **Step 3: Write the implementation**

Create `src/providers/cursor/protobuf.ts`:

```ts
export type ProtoFieldValue =
  | { wireType: 0; varint: bigint }
  | { wireType: 1; bytes: Buffer }
  | { wireType: 2; bytes: Buffer }
  | { wireType: 5; bytes: Buffer }

export type ProtoFields = Map<number, ProtoFieldValue[]>

function readVarint(buf: Buffer, offset: number): [bigint, number] {
  let result = 0n
  let shift = 0n
  let pos = offset
  while (true) {
    const byte = buf[pos]
    result |= BigInt(byte & 0x7f) << shift
    pos++
    if ((byte & 0x80) === 0) {
      break
    }
    shift += 7n
  }
  return [result, pos]
}

export function decodeProtoFields(buf: Buffer, start = 0, end: number = buf.length): ProtoFields {
  const fields: ProtoFields = new Map()
  let pos = start
  while (pos < end) {
    const [tag, afterTag] = readVarint(buf, pos)
    pos = afterTag
    const fieldNumber = Number(tag >> 3n)
    const wireType = Number(tag & 7n)

    let value: ProtoFieldValue
    if (wireType === 0) {
      const [v, afterV] = readVarint(buf, pos)
      value = { wireType: 0, varint: v }
      pos = afterV
    } else if (wireType === 1) {
      value = { wireType: 1, bytes: buf.subarray(pos, pos + 8) }
      pos += 8
    } else if (wireType === 2) {
      const [len, afterLen] = readVarint(buf, pos)
      const lenNum = Number(len)
      value = { wireType: 2, bytes: buf.subarray(afterLen, afterLen + lenNum) }
      pos = afterLen + lenNum
    } else if (wireType === 5) {
      value = { wireType: 5, bytes: buf.subarray(pos, pos + 4) }
      pos += 4
    } else {
      throw new Error(`unsupported protobuf wire type ${wireType}`)
    }

    const existing = fields.get(fieldNumber)
    if (existing) {
      existing.push(value)
    } else {
      fields.set(fieldNumber, [value])
    }
  }
  return fields
}

export function getVarintNumber(fields: ProtoFields, fieldNumber: number): number | null {
  const values = fields.get(fieldNumber)
  if (!values || values[0].wireType !== 0) {
    return null
  }
  return Number(values[0].varint)
}

export function getDouble(fields: ProtoFields, fieldNumber: number): number | null {
  const values = fields.get(fieldNumber)
  if (!values || values[0].wireType !== 1) {
    return null
  }
  return values[0].bytes.readDoubleLE(0)
}

export function getString(fields: ProtoFields, fieldNumber: number): string | null {
  const values = fields.get(fieldNumber)
  if (!values || values[0].wireType !== 2) {
    return null
  }
  return values[0].bytes.toString('utf-8')
}

export function getSubmessage(fields: ProtoFields, fieldNumber: number): ProtoFields | null {
  const values = fields.get(fieldNumber)
  if (!values || values[0].wireType !== 2) {
    return null
  }
  return decodeProtoFields(values[0].bytes)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/protobuf.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/protobuf.ts tests/protobuf.test.ts
git commit -m "feat: add minimal protobuf field decoder for Cursor's Connect-RPC responses"
```

---

### Task 4: Cursor dashboard client

**Files:**
- Create: `src/providers/cursor/dashboardClient.ts`
- Test: `tests/dashboardClient.test.ts`

**Interfaces:**
- Consumes: `decodeProtoFields`, `getVarintNumber`, `getString`, `getSubmessage` from `../providers/cursor/protobuf` (Task 3)
- Produces: `interface CursorPeriodUsage { billingCycleEndMs: number; totalSpendCents: number; limitCents: number; limitType: string | null }`, `decodeGetCurrentPeriodUsageResponse(buf: Buffer): CursorPeriodUsage`, `fetchCurrentPeriodUsage(accessToken: string, fetchFn?: typeof fetch): Promise<CursorPeriodUsage | null>`

- [ ] **Step 1: Write the failing test**

Create `tests/dashboardClient.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decodeGetCurrentPeriodUsageResponse, fetchCurrentPeriodUsage } from '../src/providers/cursor/dashboardClient'

// Real bytes captured from a live GetCurrentPeriodUsage response (Connect+proto,
// application/proto unary), base64-encoded. See docs/superpowers/specs/2026-07-28-cursor-usage-source-design.md
// for how this was captured and cross-verified against the equivalent JSON API response.
const FIXTURE_BASE64 =
  'CLjg6LjzMxC4qP21/TMajgEI/AQQ/AQg1Aoo0A8wADpjV2Ugd29yayB3aXRoIG1vZGVsIHByb3ZpZGVycyB0byBnaXZlIHlvdSBmcmVlIHVzYWdlIGJleW9uZCB3aGF0IHlvdSd2ZSBwdXJjaGFzZWQuIEFtb3VudHMgbWF5IHZhcnkuYc3MzMzMzA5AaWdmZmZmZgNAcUVERERERAxAIhUI878DEID0AxjzvwMgjTRCBHRlYW0oyAEwATomWW91J3ZlIHVzZWQgMzIlIG9mIHlvdXIgaW5jbHVkZWQgdXNhZ2VaK1lvdSd2ZSB1c2VkIDQlIG9mIHlvdXIgaW5jbHVkZWQgdG90YWwgdXNhZ2ViKVlvdSd2ZSB1c2VkIDIlIG9mIHlvdXIgaW5jbHVkZWQgQVBJIHVzYWdlagdkZWZhdWx0agxjb21wb3Nlci0xLjVqCmNvbXBvc2VyLTJqD2NvbXBvc2VyLTItZmFzdGoMY29tcG9zZXItMi41ahFjb21wb3Nlci0yLjUtZmFzdGoEdmVnYWoLdmVnYS1tZWRpdW1qCXZlZ2EtaGlnaGoKdmVnYS14aGlnaGoQdmVnYS1mYXN0LW1lZGl1bWoOdmVnYS1mYXN0LWhpZ2hqD3ZlZ2EtZmFzdC14aGlnaGoIZ3Jvay00LjVqE2N1cnNvci1ncm9rLTQuNS1sb3dqGGN1cnNvci1ncm9rLTQuNS1sb3ctZmFzdGoWY3Vyc29yLWdyb2stNC41LW1lZGl1bWobY3Vyc29yLWdyb2stNC41LW1lZGl1bS1mYXN0ahRjdXJzb3ItZ3Jvay00LjUtaGlnaGoZY3Vyc29yLWdyb2stNC41LWhpZ2gtZmFzdGoPZ3Jvay00LjUtbWVkaXVtahRncm9rLTQuNS1mYXN0LW1lZGl1bWoNZ3Jvay00LjUtaGlnaGoSZ3Jvay00LjUtZmFzdC1oaWdoag5ncm9rLTQuNS14aGlnaGoTZ3Jvay00LjUtZmFzdC14aGlnaGoKY29tcG9zZXItMQ=='

describe('decodeGetCurrentPeriodUsageResponse', () => {
  it('decodes real captured response bytes into the known usage values', () => {
    const buf = Buffer.from(FIXTURE_BASE64, 'base64')
    expect(decodeGetCurrentPeriodUsageResponse(buf)).toEqual({
      billingCycleEndMs: 1786014291000,
      totalSpendCents: 636,
      limitCents: 2000,
      limitType: 'team',
    })
  })
})

describe('fetchCurrentPeriodUsage', () => {
  it('sends the access token as a Bearer header and decodes a successful response', async () => {
    const buf = Buffer.from(FIXTURE_BASE64, 'base64')
    let receivedUrl = ''
    let receivedHeaders: Record<string, string> = {}
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      receivedUrl = url
      receivedHeaders = init?.headers as Record<string, string>
      return new Response(buf, { status: 200 })
    }) as typeof fetch

    const result = await fetchCurrentPeriodUsage('fake-token', fakeFetch)

    expect(receivedUrl).toBe('https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage')
    expect(receivedHeaders.Authorization).toBe('Bearer fake-token')
    expect(receivedHeaders['Content-Type']).toBe('application/proto')
    expect(result).toEqual({
      billingCycleEndMs: 1786014291000,
      totalSpendCents: 636,
      limitCents: 2000,
      limitType: 'team',
    })
  })

  it('returns null when the response is not ok', async () => {
    const fakeFetch = (async () => new Response('', { status: 401 })) as typeof fetch
    expect(await fetchCurrentPeriodUsage('fake-token', fakeFetch)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboardClient.test.ts`
Expected: FAIL with "Cannot find module '../src/providers/cursor/dashboardClient'"

- [ ] **Step 3: Write the implementation**

Create `src/providers/cursor/dashboardClient.ts`:

```ts
import { decodeProtoFields, getVarintNumber, getString, getSubmessage } from './protobuf'

export interface CursorPeriodUsage {
  billingCycleEndMs: number
  totalSpendCents: number
  limitCents: number
  limitType: string | null
}

const DASHBOARD_BASE_URL = 'https://api2.cursor.sh/aiserver.v1.DashboardService'

// Field mapping verified against a live response cross-checked with the equivalent
// JSON API response — see docs/superpowers/specs/2026-07-28-cursor-usage-source-design.md.
// Top-level: field 2 = billingCycleEnd (ms), field 3 = planUsage submessage,
// field 4 = spendLimitUsage submessage.
// planUsage: field 1 = totalSpend (cents), field 5 = limit (cents).
// spendLimitUsage: field 8 = limitType ("team", etc).
export function decodeGetCurrentPeriodUsageResponse(buf: Buffer): CursorPeriodUsage {
  const top = decodeProtoFields(buf)
  const planUsage = getSubmessage(top, 3)
  const spendLimitUsage = getSubmessage(top, 4)
  return {
    billingCycleEndMs: getVarintNumber(top, 2) ?? 0,
    totalSpendCents: planUsage ? getVarintNumber(planUsage, 1) ?? 0 : 0,
    limitCents: planUsage ? getVarintNumber(planUsage, 5) ?? 0 : 0,
    limitType: spendLimitUsage ? getString(spendLimitUsage, 8) : null,
  }
}

export async function fetchCurrentPeriodUsage(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<CursorPeriodUsage | null> {
  const res = await fetchFn(`${DASHBOARD_BASE_URL}/GetCurrentPeriodUsage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/proto',
      'Connect-Protocol-Version': '1',
    },
  })
  if (!res.ok) {
    return null
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return decodeGetCurrentPeriodUsageResponse(buf)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dashboardClient.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/dashboardClient.ts tests/dashboardClient.test.ts
git commit -m "feat: add Cursor dashboard client for GetCurrentPeriodUsage"
```

---

### Task 5: Backoff helper

**Files:**
- Create: `src/main/cursorBackoff.ts`
- Test: `tests/cursorBackoff.test.ts`

**Interfaces:**
- Produces: `MAX_BACKOFF_MS`, `computeBackoffIntervalMs(baseIntervalMs: number, consecutiveFailures: number): number`

- [ ] **Step 1: Write the failing test**

Create `tests/cursorBackoff.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeBackoffIntervalMs, MAX_BACKOFF_MS } from '../src/main/cursorBackoff'

describe('computeBackoffIntervalMs', () => {
  it('returns the base interval when there have been no failures', () => {
    expect(computeBackoffIntervalMs(5 * 60 * 1000, 0)).toBe(5 * 60 * 1000)
  })

  it('doubles the interval per consecutive failure', () => {
    const base = 5 * 60 * 1000
    expect(computeBackoffIntervalMs(base, 1)).toBe(base * 2)
    expect(computeBackoffIntervalMs(base, 2)).toBe(base * 4)
  })

  it('caps the backoff at one hour', () => {
    expect(computeBackoffIntervalMs(5 * 60 * 1000, 10)).toBe(MAX_BACKOFF_MS)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cursorBackoff.test.ts`
Expected: FAIL with "Cannot find module '../src/main/cursorBackoff'"

- [ ] **Step 3: Write the implementation**

Create `src/main/cursorBackoff.ts`:

```ts
export const MAX_BACKOFF_MS = 60 * 60 * 1000

export function computeBackoffIntervalMs(baseIntervalMs: number, consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return baseIntervalMs
  }
  return Math.min(MAX_BACKOFF_MS, baseIntervalMs * 2 ** consecutiveFailures)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cursorBackoff.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/cursorBackoff.ts tests/cursorBackoff.test.ts
git commit -m "feat: add failure-backoff helper for Cursor's unsupported API"
```

---

### Task 6: CursorProvider

**Files:**
- Create: `src/providers/cursor/index.ts`
- Test: `tests/cursorProvider.test.ts`

**Interfaces:**
- Consumes: `readCursorAccessToken` (Task 2), `fetchCurrentPeriodUsage`, `CursorPeriodUsage` (Task 4)
- Produces: `class CursorProvider` with `getWatchedPaths(): string[]`, `getPlanTier(): string | null`, `getCachedUsage(): { currentModel: string | null; contextWindow: null }`, `getUsageFromCommand(): Promise<{ windows, contributing: null, cost, recentActivity: null, fetchedAt } | null>` — this exact return shape becomes `CommandUsageResult` in Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/cursorProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CursorProvider } from '../src/providers/cursor'
import type { CursorPeriodUsage } from '../src/providers/cursor/dashboardClient'

function fakeUsage(overrides: Partial<CursorPeriodUsage> = {}): CursorPeriodUsage {
  return {
    billingCycleEndMs: 1786014291000,
    totalSpendCents: 636,
    limitCents: 2000,
    limitType: 'team',
    ...overrides,
  }
}

describe('CursorProvider', () => {
  it('returns null when there is no access token', async () => {
    const provider = new CursorProvider({ readAccessTokenFn: () => null })
    expect(await provider.getUsageFromCommand()).toBeNull()
  })

  it('returns null when the dashboard fetch fails', async () => {
    const provider = new CursorProvider({
      readAccessTokenFn: () => 'fake-token',
      fetchCurrentPeriodUsageFn: async () => null,
    })
    expect(await provider.getUsageFromCommand()).toBeNull()
  })

  it('maps a successful fetch into a billing_cycle window with cost, and caches the plan tier', async () => {
    const provider = new CursorProvider({
      readAccessTokenFn: () => 'fake-token',
      fetchCurrentPeriodUsageFn: async () => fakeUsage(),
    })
    const result = await provider.getUsageFromCommand()
    expect(result).not.toBeNull()
    expect(result!.windows).toEqual([
      { id: 'billing_cycle', label: 'Monthly billing cycle', percentUsed: 31.8, resetsText: 'resets Aug 6' },
    ])
    expect(result!.cost).toEqual({ spentCents: 636, limitCents: 2000 })
    expect(result!.recentActivity).toBeNull()
    expect(result!.contributing).toBeNull()
    expect(provider.getPlanTier()).toBe('team')
  })

  it('exposes the cursor chats directory as the watched path', () => {
    const provider = new CursorProvider({ chatsDir: '/fake/chats' })
    expect(provider.getWatchedPaths()).toEqual(['/fake/chats'])
  })

  it('returns null current model and context window from the cached-usage path', () => {
    const provider = new CursorProvider()
    expect(provider.getCachedUsage()).toEqual({ currentModel: null, contextWindow: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cursorProvider.test.ts`
Expected: FAIL with "Cannot find module '../src/providers/cursor'"

- [ ] **Step 3: Write the implementation**

Create `src/providers/cursor/index.ts`:

```ts
import os from 'node:os'
import path from 'node:path'
import { readCursorAccessToken } from './cursorAuth'
import { fetchCurrentPeriodUsage, type CursorPeriodUsage } from './dashboardClient'

export interface CursorProviderOptions {
  chatsDir?: string
  readAccessTokenFn?: () => string | null
  fetchCurrentPeriodUsageFn?: (accessToken: string) => Promise<CursorPeriodUsage | null>
}

function formatResetDate(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) {
    return 'reset time unknown'
  }
  const formatted = new Date(epochMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return `resets ${formatted}`
}

export class CursorProvider {
  private readonly chatsDir: string
  private readonly readAccessTokenFn: () => string | null
  private readonly fetchCurrentPeriodUsageFn: (accessToken: string) => Promise<CursorPeriodUsage | null>
  private lastPlanTier: string | null = null

  constructor(options: CursorProviderOptions = {}) {
    this.chatsDir = options.chatsDir ?? path.join(os.homedir(), '.cursor', 'chats')
    this.readAccessTokenFn = options.readAccessTokenFn ?? readCursorAccessToken
    this.fetchCurrentPeriodUsageFn = options.fetchCurrentPeriodUsageFn ?? ((token) => fetchCurrentPeriodUsage(token))
  }

  getWatchedPaths(): string[] {
    return [this.chatsDir]
  }

  getPlanTier(): string | null {
    return this.lastPlanTier
  }

  getCachedUsage(): { currentModel: string | null; contextWindow: null } {
    return { currentModel: null, contextWindow: null }
  }

  async getUsageFromCommand(): Promise<{
    windows: Array<{ id: string; label: string; percentUsed: number; resetsText: string | null }>
    contributing: null
    cost: { spentCents: number; limitCents: number | null }
    recentActivity: null
    fetchedAt: string
  } | null> {
    const token = this.readAccessTokenFn()
    if (token === null) {
      return null
    }
    const usage = await this.fetchCurrentPeriodUsageFn(token)
    if (usage === null) {
      return null
    }
    this.lastPlanTier = usage.limitType
    const percentUsed = usage.limitCents > 0 ? (usage.totalSpendCents / usage.limitCents) * 100 : 0
    return {
      windows: [
        {
          id: 'billing_cycle',
          label: 'Monthly billing cycle',
          percentUsed,
          resetsText: formatResetDate(usage.billingCycleEndMs),
        },
      ],
      contributing: null,
      cost: { spentCents: usage.totalSpendCents, limitCents: usage.limitCents },
      recentActivity: null,
      fetchedAt: new Date().toISOString(),
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cursorProvider.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/providers/cursor/index.ts tests/cursorProvider.test.ts
git commit -m "feat: add CursorProvider mapping dashboard usage into a billing-cycle window"
```

---

### Task 7: Shared `UsageProvider` interface, adopted by both providers

**Files:**
- Create: `src/providers/types.ts`
- Modify: `src/providers/claude-code/index.ts`
- Modify: `src/providers/cursor/index.ts`
- Test: `tests/provider.test.ts` (existing — verify unchanged, see Step 4)

**Interfaces:**
- Consumes: `UsageWindow`, `Contributing`, `ContextWindow`, `CostSummary`, `UsageEvent` from `../shared/types` (these are extended/added in Task 8 — this task only needs `UsageWindow`/`Contributing`/`ContextWindow`, which already exist; `CostSummary`/`UsageEvent` do not exist yet, so this task defines its own minimal inline shapes for `cost`/`recentActivity` and Task 8 will re-point them at the shared types once those exist)
- Produces: `interface UsageProvider`, `interface CachedUsage`, `interface CommandUsageResult`, all exported from `src/providers/types.ts` — every later task that touches a provider imports from here.

- [ ] **Step 1: Create the shared interface file**

Create `src/providers/types.ts`:

```ts
import type { ContextWindow, Contributing, UsageWindow } from '../shared/types'

export interface CachedUsage {
  currentModel: string | null
  contextWindow: ContextWindow | null
}

export interface CommandUsageResult {
  windows: UsageWindow[]
  contributing: Contributing | null
  cost: { spentCents: number; limitCents: number | null } | null
  recentActivity: Array<{ timestamp: string; model: string; tokens: number; costCents: number | null }> | null
  fetchedAt: string
}

export interface UsageProvider {
  getWatchedPaths(): string[]
  getPlanTier(): string | null
  getCachedUsage(): CachedUsage
  getUsageFromCommand(cwd: string): Promise<CommandUsageResult | null>
}
```

- [ ] **Step 2: Make `ClaudeCodeProvider` implement it explicitly**

Modify `src/providers/claude-code/index.ts` — replace the local `CachedUsage`/`CommandUsage` interfaces and the class declaration:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ContextWindow } from '../../shared/types'
import type { CachedUsage, CommandUsageResult, UsageProvider } from '../types'
import { findNewestTranscript, formatModelDisplayName, readLastModelId } from './transcript'
import { parseUsageOutput, runUsageCommand } from './usageCommand'

interface StatuslineCache {
  model_display_name?: unknown
  context_window?: {
    used_percentage?: unknown
    total_input_tokens?: unknown
    context_window_size?: unknown
  }
}

export interface ClaudeCodeProviderOptions {
  claudeJsonPath?: string
  statuslineCachePath?: string
  projectsDir?: string
  runUsageCommandFn?: (cwd: string) => Promise<string | null>
}

export class ClaudeCodeProvider implements UsageProvider {
  private readonly claudeJsonPath: string
  private readonly statuslineCachePath: string
  private readonly projectsDir: string
  private readonly runUsageCommandFn: (cwd: string) => Promise<string | null>

  constructor(options: ClaudeCodeProviderOptions = {}) {
    const home = os.homedir()
    this.claudeJsonPath = options.claudeJsonPath ?? path.join(home, '.claude.json')
    this.statuslineCachePath = options.statuslineCachePath ?? path.join(home, '.claude', 'token-pulse-cache.json')
    this.projectsDir = options.projectsDir ?? path.join(home, '.claude', 'projects')
    this.runUsageCommandFn = options.runUsageCommandFn ?? ((cwd) => runUsageCommand(cwd, this.projectsDir))
  }

  getWatchedPaths(): string[] {
    return [this.statuslineCachePath, this.claudeJsonPath, this.projectsDir]
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

  private getModelFromTranscript(): string | null {
    const transcript = findNewestTranscript(this.projectsDir)
    if (transcript === null) {
      return null
    }
    const modelId = readLastModelId(transcript)
    return modelId !== null ? formatModelDisplayName(modelId) : null
  }

  private getModelFromStatuslineCache(): string | null {
    try {
      const raw = fs.readFileSync(this.statuslineCachePath, 'utf-8')
      const parsed = JSON.parse(raw) as StatuslineCache
      return typeof parsed.model_display_name === 'string' ? parsed.model_display_name : null
    } catch {
      return null
    }
  }

  private getContextWindowFromStatuslineCache(): ContextWindow | null {
    try {
      const raw = fs.readFileSync(this.statuslineCachePath, 'utf-8')
      const parsed = JSON.parse(raw) as StatuslineCache
      const ctx = parsed.context_window
      if (
        typeof ctx?.used_percentage !== 'number' ||
        typeof ctx?.total_input_tokens !== 'number' ||
        typeof ctx?.context_window_size !== 'number'
      ) {
        return null
      }
      return {
        usedPercentage: ctx.used_percentage,
        totalInputTokens: ctx.total_input_tokens,
        contextWindowSize: ctx.context_window_size,
      }
    } catch {
      return null
    }
  }

  getCachedUsage(): CachedUsage {
    return {
      currentModel: this.getModelFromTranscript() ?? this.getModelFromStatuslineCache(),
      contextWindow: this.getContextWindowFromStatuslineCache(),
    }
  }

  async getUsageFromCommand(cwd: string): Promise<CommandUsageResult | null> {
    const stdout = await this.runUsageCommandFn(cwd)
    if (stdout === null) {
      return null
    }
    const parsed = parseUsageOutput(stdout)

    const windows: CommandUsageResult['windows'] = []
    if (parsed.fiveHour) {
      windows.push({ id: 'five_hour', label: 'Every 5 hours', percentUsed: parsed.fiveHour.percentUsed, resetsText: parsed.fiveHour.resetsText })
    }
    if (parsed.weekly) {
      windows.push({ id: 'weekly', label: 'Weekly', percentUsed: parsed.weekly.percentUsed, resetsText: parsed.weekly.resetsText })
    }

    return {
      windows,
      contributing: { last24h: parsed.last24h, last7d: parsed.last7d },
      cost: null,
      recentActivity: null,
      fetchedAt: new Date().toISOString(),
    }
  }
}
```

- [ ] **Step 3: Make `CursorProvider` implement it explicitly**

Modify `src/providers/cursor/index.ts` — change the import line and class declaration, and drop the inline return-type literal in favor of the shared one:

```ts
import os from 'node:os'
import path from 'node:path'
import type { CachedUsage, CommandUsageResult, UsageProvider } from '../types'
import { readCursorAccessToken } from './cursorAuth'
import { fetchCurrentPeriodUsage, type CursorPeriodUsage } from './dashboardClient'
```

Change `export class CursorProvider {` to `export class CursorProvider implements UsageProvider {`.

Change the `getCachedUsage` return type from the inline literal to `CachedUsage`.

Change `getUsageFromCommand`'s return type from the inline literal to `Promise<CommandUsageResult | null>`.

- [ ] **Step 4: Run both providers' test suites to confirm nothing broke**

Run: `npx vitest run tests/provider.test.ts tests/cursorProvider.test.ts`
Expected: PASS (all existing + new tests, unchanged assertions — the added `cost`/`recentActivity` fields aren't checked by `provider.test.ts`'s existing assertions, so they can't break it)

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: clean, no errors

- [ ] **Step 6: Commit**

```bash
git add src/providers/types.ts src/providers/claude-code/index.ts src/providers/cursor/index.ts
git commit -m "refactor: extract shared UsageProvider interface for both providers"
```

---

### Task 8: `usageCommandScheduler` accepts per-source config

**Files:**
- Modify: `src/main/usageCommandScheduler.ts`
- Test: `tests/usageCommandScheduler.test.ts` (existing — add new cases, keep existing ones)

**Interfaces:**
- Produces: `shouldRefreshUsageCommand(state: UsageCommandScheduleState, config?: UsageCommandScheduleConfig): boolean` — the second parameter is new and optional; all existing call sites keep working unchanged.

- [ ] **Step 1: Add the new failing test cases (append to the existing file, do not remove the existing ones)**

Modify `tests/usageCommandScheduler.test.ts` — add this `describe` block after the existing one:

```ts
describe('shouldRefreshUsageCommand with a custom config', () => {
  it('uses the overridden active interval instead of the default', () => {
    const lastActivityAt = 0
    const lastRefreshAt = 0
    const customActiveMs = 5 * 60 * 1000
    expect(
      shouldRefreshUsageCommand(
        { now: customActiveMs - 1, lastActivityAt, lastRefreshAt },
        { activeIntervalMs: customActiveMs }
      )
    ).toBe(false)
    expect(
      shouldRefreshUsageCommand(
        { now: customActiveMs, lastActivityAt, lastRefreshAt },
        { activeIntervalMs: customActiveMs }
      )
    ).toBe(true)
  })

  it('falls back to the module defaults for any field left unspecified', () => {
    expect(
      shouldRefreshUsageCommand({ now: ACTIVE_INTERVAL_MS, lastActivityAt: 0, lastRefreshAt: 0 }, {})
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `npx vitest run tests/usageCommandScheduler.test.ts`
Expected: FAIL on the two new cases (existing cases still pass) — `shouldRefreshUsageCommand` doesn't accept a second argument yet

- [ ] **Step 3: Write the implementation**

Modify `src/main/usageCommandScheduler.ts`:

```ts
// `claude -p "/usage"` is a real subprocess spawn that hits Anthropic's account-status
// endpoint — worth polling briskly while Claude is actually being used, but wasteful to
// keep firing every few minutes when nothing has touched a Claude session in a while.
export const ACTIVE_INTERVAL_MS = 3 * 60 * 1000
export const IDLE_INTERVAL_MS = 20 * 60 * 1000
export const IDLE_THRESHOLD_MS = 15 * 60 * 1000

export interface UsageCommandScheduleState {
  now: number
  lastActivityAt: number
  lastRefreshAt: number
}

export interface UsageCommandScheduleConfig {
  activeIntervalMs?: number
  idleIntervalMs?: number
  idleThresholdMs?: number
}

export function shouldRefreshUsageCommand(
  { now, lastActivityAt, lastRefreshAt }: UsageCommandScheduleState,
  config: UsageCommandScheduleConfig = {}
): boolean {
  const activeIntervalMs = config.activeIntervalMs ?? ACTIVE_INTERVAL_MS
  const idleIntervalMs = config.idleIntervalMs ?? IDLE_INTERVAL_MS
  const idleThresholdMs = config.idleThresholdMs ?? IDLE_THRESHOLD_MS
  const isIdle = now - lastActivityAt >= idleThresholdMs
  const interval = isIdle ? idleIntervalMs : activeIntervalMs
  return now - lastRefreshAt >= interval
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/usageCommandScheduler.test.ts`
Expected: PASS (5 tests: 3 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add src/main/usageCommandScheduler.ts tests/usageCommandScheduler.test.ts
git commit -m "feat: let shouldRefreshUsageCommand take a per-call schedule override"
```

---

### Task 9: Data model extension and multi-source wiring in the main process

This is the integration task: it changes `shared/types.ts` to support multiple sources, and rewrites `electron/main.ts` to poll both providers into the new shape. Because both files are consumed by the renderer, `src/App.tsx` gets its one-line type rename in this same task so the app keeps compiling — the renderer's *visible* behavior does not change yet (that's Tasks 10–12); this task's deliverable is "the app still shows Claude exactly as before, but the backend now tracks two sources internally."

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/providers/types.ts`
- Modify: `electron/main.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `UsageProvider`, `CommandUsageResult`, `CachedUsage` (Task 7), `computeBackoffIntervalMs` (Task 5), `readCursorAccessToken` (Task 2), `CursorProvider` (Task 6)
- Produces: `AppState`, `SourceUsage`, `SourceDescriptor`, `UsageEvent`, `CostSummary` types in `shared/types.ts` — every later task imports these. The `AppState` shape sent over `usage:update`/`usage:get` IPC: `{ sources: SourceDescriptor[]; activeSourceId: string; usageBySource: Record<string, SourceUsage>; settings: AppSettings; appVersion: string }`. New IPC handler `source:select` (accepts a source id string, no return value needed by callers).

- [ ] **Step 1: Rewrite `shared/types.ts`**

Modify `src/shared/types.ts` — replace the whole file:

```ts
export interface UsageWindow {
  id: string
  label: string
  percentUsed: number
  resetsText: string | null
}

export interface TopEntry {
  name: string
  percent: number
}

export interface ContributingStats {
  requests: number
  sessions: number
  aboveContextPercent: number | null
  topSkills: TopEntry[]
  topSubagents: TopEntry[]
  topPlugins: TopEntry[]
  topMcpServers: TopEntry[]
}

export interface Contributing {
  last24h: ContributingStats | null
  last7d: ContributingStats | null
}

export interface ContextWindow {
  usedPercentage: number
  totalInputTokens: number
  contextWindowSize: number
}

export interface UsageEvent {
  timestamp: string
  model: string
  tokens: number
  costCents: number | null
}

export interface CostSummary {
  spentCents: number
  limitCents: number | null
}

export interface AppSettings {
  startAtLogin: boolean
  theme: 'dark' | 'light' | 'system'
  accentColor: string
  fontFamily: 'system' | 'monospace' | 'serif' | 'menlo' | 'jetbrains-mono'
  fontSize: 'small' | 'medium' | 'large'
}

export interface SourceUsage {
  planTier: string | null
  currentModel: string | null
  windows: UsageWindow[]
  contextWindow: ContextWindow | null
  contributing: Contributing | null
  cost: CostSummary | null
  recentActivity: UsageEvent[] | null
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

- [ ] **Step 2: Re-point `src/providers/types.ts` at the new shared `CostSummary`/`UsageEvent` types**

`CommandUsageResult` (Task 7) defined its own inline shapes for `cost`/`recentActivity` because `CostSummary`/`UsageEvent` didn't exist yet. Now that Step 1 added them to `shared/types.ts`, remove the duplication.

Modify `src/providers/types.ts`:

```ts
import type { ContextWindow, Contributing, CostSummary, UsageEvent, UsageWindow } from '../shared/types'

export interface CachedUsage {
  currentModel: string | null
  contextWindow: ContextWindow | null
}

export interface CommandUsageResult {
  windows: UsageWindow[]
  contributing: Contributing | null
  cost: CostSummary | null
  recentActivity: UsageEvent[] | null
  fetchedAt: string
}

export interface UsageProvider {
  getWatchedPaths(): string[]
  getPlanTier(): string | null
  getCachedUsage(): CachedUsage
  getUsageFromCommand(cwd: string): Promise<CommandUsageResult | null>
}
```

- [ ] **Step 3: Rewrite `electron/main.ts`**

Modify `electron/main.ts` — replace the whole file:

```ts
import { app, ipcMain, nativeTheme } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import { createTray, updateTrayIcon } from './tray'
import { togglePopup, getPopupIfExists, POPUP_WIDTH } from './windowManager'
import { setStartAtLogin, getStartAtLogin } from './autostart'
import { ClaudeCodeProvider } from '../src/providers/claude-code'
import { CursorProvider } from '../src/providers/cursor'
import { readCursorAccessToken } from '../src/providers/cursor/cursorAuth'
import type { UsageProvider } from '../src/providers/types'
import type { AppState, AppSettings, SourceUsage } from '../src/shared/types'
import { readSettings, writeSettings } from '../src/main/settingsStore'
import { shouldRefreshUsageCommand, ACTIVE_INTERVAL_MS } from '../src/main/usageCommandScheduler'
import { computeBackoffIntervalMs } from '../src/main/cursorBackoff'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs')
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

// Safety net in case a file watcher misses an event (rare, but fs watching isn't
// 100% reliable cross-platform) — normal updates are watch-driven, not timed.
const FALLBACK_POLL_MS = 60 * 1000

// Cursor's API is unofficial and undocumented, so it gets a more conservative
// baseline than Claude's supported CLI command.
const CURSOR_ACTIVE_INTERVAL_MS = 5 * 60 * 1000

// A dedicated scratch directory, never a real project's cwd, so these recurring background
// calls don't get attributed to whatever project you're actually working in.
const USAGE_COMMAND_CWD = path.join(app.getPath('userData'), 'usage-check-cwd')
fs.mkdirSync(USAGE_COMMAND_CWD, { recursive: true })

interface SourceRuntime {
  id: string
  label: string
  provider: UsageProvider
  activeIntervalMs?: number
  lastActivityAt: number
  lastRefreshAt: number
  consecutiveFailures: number
}

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
        },
      ]
    : []),
]

function emptySourceUsage(): SourceUsage {
  return {
    planTier: null,
    currentModel: null,
    windows: [],
    contextWindow: null,
    contributing: null,
    cost: null,
    recentActivity: null,
    updatedAt: new Date().toISOString(),
    cacheUpdatedAt: null,
  }
}

let state: AppState = {
  sources: sources.map((s) => ({ id: s.id, label: s.label })),
  activeSourceId: 'claude',
  usageBySource: Object.fromEntries(sources.map((s) => [s.id, emptySourceUsage()])),
  settings: readSettings(SETTINGS_PATH),
  appVersion: app.getVersion(),
}

function pushState(): void {
  const activeUsage = state.usageBySource[state.activeSourceId]
  const primaryWindow = activeUsage.windows[0]
  updateTrayIcon(primaryWindow?.percentUsed ?? 0, nativeTheme.shouldUseDarkColors)
  const popup = getPopupIfExists()
  if (popup && popup.isVisible()) {
    popup.webContents.send('usage:update', state)
  }
}

function poll(source: SourceRuntime): void {
  const cached = source.provider.getCachedUsage()
  const existing = state.usageBySource[source.id]
  state = {
    ...state,
    usageBySource: {
      ...state.usageBySource,
      [source.id]: {
        ...existing,
        planTier: source.provider.getPlanTier(),
        currentModel: cached.currentModel,
        contextWindow: cached.contextWindow,
        updatedAt: new Date().toISOString(),
      },
    },
  }
  pushState()
}

function onWatchedFileActivity(source: SourceRuntime): void {
  source.lastActivityAt = Date.now()
  poll(source)
}

function maybeRefreshUsageFromCommand(source: SourceRuntime): void {
  const now = Date.now()
  const baseActiveIntervalMs = source.activeIntervalMs ?? ACTIVE_INTERVAL_MS
  const effectiveActiveIntervalMs = computeBackoffIntervalMs(baseActiveIntervalMs, source.consecutiveFailures)
  if (
    shouldRefreshUsageCommand(
      { now, lastActivityAt: source.lastActivityAt, lastRefreshAt: source.lastRefreshAt },
      { activeIntervalMs: effectiveActiveIntervalMs }
    )
  ) {
    source.lastRefreshAt = now
    void refreshUsageFromCommand(source)
  }
}

async function refreshUsageFromCommand(source: SourceRuntime): Promise<void> {
  const result = await source.provider.getUsageFromCommand(USAGE_COMMAND_CWD)
  if (result === null) {
    source.consecutiveFailures += 1
    return
  }
  source.consecutiveFailures = 0
  const existing = state.usageBySource[source.id]
  state = {
    ...state,
    usageBySource: {
      ...state.usageBySource,
      [source.id]: {
        ...existing,
        windows: result.windows,
        contributing: result.contributing,
        cost: result.cost,
        recentActivity: result.recentActivity,
        cacheUpdatedAt: result.fetchedAt,
      },
    },
  }
  pushState()
}

ipcMain.handle('usage:get', () => state)

ipcMain.handle('source:select', (_event, sourceId: string) => {
  if (state.usageBySource[sourceId] === undefined) {
    return
  }
  state = { ...state, activeSourceId: sourceId }
  pushState()
})

ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
  const next: AppSettings = { ...state.settings, ...patch }
  if (patch.startAtLogin !== undefined) {
    next.startAtLogin = setStartAtLogin(patch.startAtLogin)
  }
  writeSettings(SETTINGS_PATH, next)
  state = { ...state, settings: next }
  pushState()
})

ipcMain.on('popup:resize', (_event, height: number) => {
  getPopupIfExists()?.setContentSize(POPUP_WIDTH, Math.max(1, Math.round(height)))
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }
  const actualSettings: AppSettings = { ...state.settings, startAtLogin: getStartAtLogin() }
  writeSettings(SETTINGS_PATH, actualSettings)
  state = { ...state, settings: actualSettings }
  createTray((trayRef) => {
    const wasVisible = getPopupIfExists()?.isVisible() ?? false
    togglePopup(trayRef, PRELOAD_PATH, { devServerUrl: VITE_DEV_SERVER_URL, rendererDist: RENDERER_DIST })
    // Opening: re-read from disk so the panel never shows a watch event we haven't caught yet.
    // Closing: nothing to render, so just keep the tray icon in sync without a redundant read.
    if (wasVisible) {
      pushState()
    } else {
      sources.forEach(poll)
    }
  }, nativeTheme.shouldUseDarkColors)
  nativeTheme.on('updated', pushState)
  sources.forEach(poll)
  const now = Date.now()
  sources.forEach((s) => {
    s.lastRefreshAt = now
  })
  sources.forEach((s) => void refreshUsageFromCommand(s))
  sources.forEach((source) => {
    chokidar
      .watch(source.provider.getWatchedPaths(), {
        ignoreInitial: true,
        atomic: true,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      })
      .on('add', () => onWatchedFileActivity(source))
      .on('change', () => onWatchedFileActivity(source))
  })
  setInterval(() => sources.forEach(poll), FALLBACK_POLL_MS)
  setInterval(() => sources.forEach(maybeRefreshUsageFromCommand), FALLBACK_POLL_MS)
})

app.on('window-all-closed', () => {
  // Intentionally do nothing — the app lives in the tray.
})
```

- [ ] **Step 4: Update `App.tsx`'s type import**

Modify `src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { WidgetPanel } from './components/WidgetPanel'
import type { AppState } from './shared/types'
import './App.css'

export default function App() {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    window.ipcRenderer.invoke('usage:get').then((initial) => setState(initial as AppState))
    const listener = (_event: unknown, next: AppState) => setState(next)
    window.ipcRenderer.on('usage:update', listener)
    return () => {
      window.ipcRenderer.off('usage:update', listener)
    }
  }, [])

  return <WidgetPanel state={state} />
}
```

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: errors in `src/components/WidgetPanel.tsx` and `src/components/UsageView.tsx` (they still reference the removed `UsageState` type and the old flat `state.currentModel`/`state.windows` shape) — this is expected; Tasks 11 and 12 fix them. Confirm the *only* errors are in those two files.

- [ ] **Step 6: Run the provider/scheduler test suites (renderer tests are broken until Tasks 11–12; skip them here)**

Run: `npx vitest run tests/cursorAuth.test.ts tests/protobuf.test.ts tests/dashboardClient.test.ts tests/cursorBackoff.test.ts tests/cursorProvider.test.ts tests/provider.test.ts tests/usageCommandScheduler.test.ts`
Expected: PASS (all of them)

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/providers/types.ts electron/main.ts src/App.tsx
git commit -m "feat: track usage per-source and poll Cursor alongside Claude in the main process"
```

---

### Task 10: `SourceSelector` component

**Files:**
- Create: `src/components/SourceSelector.tsx`
- Modify: `src/components/icons.tsx`
- Modify: `src/App.css`
- Test: `tests/SourceSelector.test.tsx`

**Interfaces:**
- Consumes: `SourceDescriptor` (Task 9)
- Produces: `SourceSelector({ sources, activeSourceId, activeSourceLabel, currentModel, onSelect })` — a React component. `ChevronDownIcon` added to `icons.tsx`.

- [ ] **Step 1: Write the failing test**

Create `tests/SourceSelector.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SourceSelector } from '../src/components/SourceSelector'

afterEach(() => {
  cleanup()
})

const TWO_SOURCES = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
]

describe('SourceSelector', () => {
  it('renders plain text with no button when there is only one source', () => {
    render(
      <SourceSelector
        sources={[{ id: 'claude', label: 'Claude Code' }]}
        activeSourceId="claude"
        activeSourceLabel="Claude Code"
        currentModel="Sonnet 5"
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('Sonnet 5')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens a menu listing every source when there is more than one', () => {
    render(
      <SourceSelector
        sources={TWO_SOURCES}
        activeSourceId="claude"
        activeSourceLabel="Claude Code"
        currentModel="Sonnet 5"
        onSelect={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('menuitem', { name: 'Claude Code' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cursor' })).toBeInTheDocument()
  })

  it('calls onSelect and closes the menu when a source is clicked', () => {
    const onSelect = vi.fn()
    render(
      <SourceSelector
        sources={TWO_SOURCES}
        activeSourceId="claude"
        activeSourceLabel="Claude Code"
        currentModel="Sonnet 5"
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cursor' }))
    expect(onSelect).toHaveBeenCalledWith('cursor')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu when Escape is pressed', () => {
    render(
      <SourceSelector
        sources={TWO_SOURCES}
        activeSourceId="claude"
        activeSourceLabel="Claude Code"
        currentModel="Sonnet 5"
        onSelect={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu when clicking outside it', () => {
    render(
      <div>
        <SourceSelector
          sources={TWO_SOURCES}
          activeSourceId="claude"
          activeSourceLabel="Claude Code"
          currentModel="Sonnet 5"
          onSelect={() => {}}
        />
        <div data-testid="outside">outside</div>
      </div>
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/SourceSelector.test.tsx`
Expected: FAIL with "Cannot find module '../src/components/SourceSelector'"

- [ ] **Step 3: Add the chevron icon**

Modify `src/components/icons.tsx` — add after `InfoIcon`:

```tsx
export function ChevronDownIcon() {
  return (
    <svg {...ICON_PROPS} width={11} height={11}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
```

- [ ] **Step 4: Write the component**

Create `src/components/SourceSelector.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { SourceDescriptor } from '../shared/types'
import { ChevronDownIcon } from './icons'

export function SourceSelector({
  sources,
  activeSourceId,
  activeSourceLabel,
  currentModel,
  onSelect,
}: {
  sources: SourceDescriptor[]
  activeSourceId: string
  activeSourceLabel: string
  currentModel: string | null
  onSelect: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (sources.length <= 1) {
    return (
      <span>
        {currentModel ?? 'No recent activity'}
        {currentModel && (
          <span
            className="widget-panel__model-qualifier"
            title="The model that most recently produced output in any Claude session on this machine — not necessarily the one selected in the window you're looking at."
          >
            last active
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="source-selector" ref={containerRef}>
      <button className="source-selector__trigger" onClick={() => setIsOpen((open) => !open)}>
        {activeSourceLabel}
        <ChevronDownIcon />
      </button>
      {isOpen && (
        <div className="source-selector__menu" role="menu">
          {sources.map((source) => (
            <button
              key={source.id}
              role="menuitem"
              className={`source-selector__item${source.id === activeSourceId ? ' is-active' : ''}`}
              onClick={() => {
                onSelect(source.id)
                setIsOpen(false)
              }}
            >
              {source.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Add its CSS**

Modify `src/App.css` — add after the `.widget-panel__model-qualifier` block:

```css
.source-selector {
  position: relative;
}

.source-selector__trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.source-selector__menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 6px;
  background: var(--bg-color);
  border: 1px solid var(--track-bg);
  border-radius: 8px;
  padding: 4px;
  min-width: 140px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.source-selector__item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  font-weight: 400;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.source-selector__item:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.source-selector__item.is-active {
  font-weight: 600;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/SourceSelector.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add src/components/SourceSelector.tsx src/components/icons.tsx src/App.css tests/SourceSelector.test.tsx
git commit -m "feat: add SourceSelector component for switching between usage sources"
```

---

### Task 11: Wire `SourceSelector` into `WidgetPanel`

**Files:**
- Modify: `src/components/WidgetPanel.tsx`

**Interfaces:**
- Consumes: `SourceSelector` (Task 10), `AppState` (Task 9)
- Produces: `WidgetPanel` now derives `activeUsage: SourceUsage` and passes it to `UsageView` (Task 12 changes `UsageView`'s prop type to match)

- [ ] **Step 1: Rewrite the header and prop types**

Modify `src/components/WidgetPanel.tsx` — replace the whole file:

```tsx
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AppState, AppSettings } from '../shared/types'
import { UsageView } from './UsageView'
import { SettingsView } from './SettingsView'
import { AboutView } from './AboutView'
import { SourceSelector } from './SourceSelector'
import { BackIcon, SettingsIcon, InfoIcon } from './icons'

type PanelView = 'usage' | 'settings' | 'about'

const FONT_FAMILY_STACKS: Record<AppSettings['fontFamily'], string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  monospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  serif: "Georgia, 'Times New Roman', serif",
  menlo: 'Menlo, monospace',
  'jetbrains-mono': "'JetBrains Mono', monospace",
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

export function WidgetPanel({ state }: { state: AppState | null }) {
  const [view, setView] = useState<PanelView>('usage')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el) {
      return
    }
    const observer = new ResizeObserver(() => {
      window.ipcRenderer.send('popup:resize', el.offsetHeight)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!state) {
    return <div ref={panelRef} className="widget-panel">Loading usage…</div>
  }

  function updateSettings(patch: Partial<AppSettings>): void {
    window.ipcRenderer
      .invoke('settings:update', patch)
      .catch((err: unknown) => console.error('Failed to update settings', err))
  }

  function selectSource(sourceId: string): void {
    window.ipcRenderer
      .invoke('source:select', sourceId)
      .catch((err: unknown) => console.error('Failed to select source', err))
  }

  const activeUsage = state.usageBySource[state.activeSourceId]
  const activeSourceLabel = state.sources.find((s) => s.id === state.activeSourceId)?.label ?? ''
  const dataTheme = state.settings.theme === 'system' ? undefined : state.settings.theme

  return (
    <div ref={panelRef} className="widget-panel" data-theme={dataTheme} style={accentStyle(state.settings)}>
      <div className="widget-panel__header">
        <SourceSelector
          sources={state.sources}
          activeSourceId={state.activeSourceId}
          activeSourceLabel={activeSourceLabel}
          currentModel={activeUsage.currentModel}
          onSelect={selectSource}
        />
        <div className="widget-panel__header-nav">
          {view !== 'usage' ? (
            <button className="widget-panel__icon-button" onClick={() => setView('usage')} aria-label="Back">
              <BackIcon />
            </button>
          ) : (
            <>
              <button className="widget-panel__icon-button" onClick={() => setView('settings')} aria-label="Settings">
                <SettingsIcon />
              </button>
              <button className="widget-panel__icon-button" onClick={() => setView('about')} aria-label="About">
                <InfoIcon />
              </button>
            </>
          )}
        </div>
      </div>
      {view === 'usage' && <UsageView state={activeUsage} />}
      {view === 'settings' && <SettingsView settings={state.settings} onUpdate={updateSettings} />}
      {view === 'about' && <AboutView appVersion={state.appVersion} />}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: errors only in `src/components/UsageView.tsx` (still expects the old `UsageState` type) — fixed in Task 12

- [ ] **Step 3: Commit**

```bash
git add src/components/WidgetPanel.tsx
git commit -m "feat: wire SourceSelector into the popup header"
```

---

### Task 12: Generalize `UsageView` — generic windows, cost, and activity sections

**Files:**
- Modify: `src/components/UsageView.tsx`
- Modify: `src/App.css`
- Test: `tests/UsageView.test.tsx`

**Interfaces:**
- Consumes: `SourceUsage` (Task 9)
- Produces: `UsageView({ state: SourceUsage })` — renders every window generically instead of looking up `five_hour`/`weekly` by id, plus new cost and activity sections that render only when populated.

- [ ] **Step 1: Write the failing test**

Create `tests/UsageView.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { UsageView } from '../src/components/UsageView'
import type { SourceUsage } from '../src/shared/types'

afterEach(() => {
  cleanup()
})

function baseState(overrides: Partial<SourceUsage> = {}): SourceUsage {
  return {
    planTier: null,
    currentModel: null,
    windows: [],
    contextWindow: null,
    contributing: null,
    cost: null,
    recentActivity: null,
    updatedAt: new Date().toISOString(),
    cacheUpdatedAt: null,
    ...overrides,
  }
}

describe('UsageView', () => {
  it('renders every window generically, not just five_hour/weekly', () => {
    render(
      <UsageView
        state={baseState({
          windows: [{ id: 'billing_cycle', label: 'Monthly billing cycle', percentUsed: 31.8, resetsText: 'resets Aug 6' }],
        })}
      />
    )
    expect(screen.getByText('Monthly billing cycle')).toBeInTheDocument()
    expect(screen.getByText('resets Aug 6')).toBeInTheDocument()
  })

  it('shows a cost line when cost data is present', () => {
    render(<UsageView state={baseState({ cost: { spentCents: 636, limitCents: 2000 } })} />)
    expect(screen.getByText('$6.36 / $20.00')).toBeInTheDocument()
  })

  it('renders nothing extra when cost is null', () => {
    render(<UsageView state={baseState()} />)
    expect(screen.queryByText(/spent this period/i)).not.toBeInTheDocument()
  })

  it('shows a recent-activity table when activity events are present', () => {
    render(
      <UsageView
        state={baseState({
          recentActivity: [{ timestamp: '2026-07-27T18:52:00.000Z', model: 'auto', tokens: 23400, costCents: null }],
        })}
      />
    )
    expect(screen.getByText('auto')).toBeInTheDocument()
    expect(screen.getByText('23.4k tok')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/UsageView.test.tsx`
Expected: FAIL — `UsageView` still expects the old `UsageState` shape and looks up `five_hour`/`weekly` specifically, so "Monthly billing cycle" never renders

- [ ] **Step 3: Write the implementation**

Modify `src/components/UsageView.tsx` — replace the whole file:

```tsx
import { useState } from 'react'
import type { ContributingStats, TopEntry, SourceUsage } from '../shared/types'
import { formatCompactNumber, formatPlanTier, formatRelativeTime } from '../shared/format'
import { UsageBar } from './UsageBar'

function TopEntriesRow({ label, entries }: { label: string; entries: TopEntry[] }) {
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="contributing__category">
      <div className="contributing__category-label">{label}</div>
      {entries.map((entry) => (
        <div key={entry.name} className="contributing__entry">
          <span className="contributing__entry-name">{entry.name}</span>
          <span className="contributing__entry-percent">{entry.percent}%</span>
        </div>
      ))}
    </div>
  )
}

function ContributingStatsSection({ contributing }: { contributing: SourceUsage['contributing'] }) {
  const [range, setRange] = useState<'last24h' | 'last7d'>('last24h')
  if (!contributing || (!contributing.last24h && !contributing.last7d)) {
    return null
  }
  const stats: ContributingStats | null = contributing[range]
  return (
    <>
      <hr className="widget-panel__separator" />
      <div className="contributing__header">
        <span className="widget-panel__section-label">What&apos;s using your limits?</span>
        <div className="settings-view__theme-toggle">
          <button className={range === 'last24h' ? 'is-active' : ''} onClick={() => setRange('last24h')}>
            24h
          </button>
          <button className={range === 'last7d' ? 'is-active' : ''} onClick={() => setRange('last7d')}>
            7d
          </button>
        </div>
      </div>
      {stats ? (
        <div className="contributing__body">
          <div className="contributing__category">
            <div className="contributing__meta">
              {stats.requests} requests · {stats.sessions} sessions
            </div>
            {stats.aboveContextPercent !== null && (
              <div className="contributing__row">{stats.aboveContextPercent}% ran above 150k context</div>
            )}
          </div>
          <TopEntriesRow label="Skills" entries={stats.topSkills} />
          <TopEntriesRow label="Subagents" entries={stats.topSubagents} />
          <TopEntriesRow label="Plugins" entries={stats.topPlugins} />
          <TopEntriesRow label="MCP servers" entries={stats.topMcpServers} />
        </div>
      ) : (
        <div className="widget-panel__empty">No data for this range.</div>
      )}
    </>
  )
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function CostSection({ cost }: { cost: SourceUsage['cost'] }) {
  if (!cost) {
    return null
  }
  return (
    <>
      <hr className="widget-panel__separator" />
      <div className="usage-cost">
        <span>Spent this period</span>
        <span>
          {formatCents(cost.spentCents)}
          {cost.limitCents !== null && ` / ${formatCents(cost.limitCents)}`}
        </span>
      </div>
    </>
  )
}

function ActivitySection({ recentActivity }: { recentActivity: SourceUsage['recentActivity'] }) {
  if (!recentActivity || recentActivity.length === 0) {
    return null
  }
  return (
    <>
      <hr className="widget-panel__separator" />
      <div className="widget-panel__section-label">Recent activity</div>
      <div className="usage-activity">
        {recentActivity.map((event, index) => (
          <div className="usage-activity__row" key={`${event.timestamp}-${index}`}>
            <span className="usage-activity__model">{event.model}</span>
            <span className="usage-activity__tokens">{formatCompactNumber(event.tokens)} tok</span>
            <span className="usage-activity__cost">{event.costCents !== null ? formatCents(event.costCents) : '—'}</span>
          </div>
        ))}
      </div>
    </>
  )
}

export function UsageView({ state }: { state: SourceUsage }) {
  const contextWindow = state.contextWindow
  return (
    <>
      {contextWindow && (
        <>
          <div className="usage-bar">
            <div className="usage-bar__header">
              <span>Context window</span>
              <span>
                {formatCompactNumber(contextWindow.totalInputTokens)} / {formatCompactNumber(contextWindow.contextWindowSize)} (
                {Math.round(contextWindow.usedPercentage)}%)
              </span>
            </div>
            <div className="usage-bar__track">
              <div
                className="usage-bar__fill"
                style={{ width: `${Math.min(100, Math.max(0, contextWindow.usedPercentage))}%` }}
              />
            </div>
          </div>
          <hr className="widget-panel__separator" />
        </>
      )}
      {state.windows.length > 0 && (
        <div className="widget-panel__section-label">Plan usage limits · {formatPlanTier(state.planTier)}</div>
      )}
      {state.windows.map((window) => (
        <UsageBar key={window.id} window={window} />
      ))}
      {state.windows.length === 0 && <div className="widget-panel__empty">No usage data yet.</div>}
      <CostSection cost={state.cost} />
      <ContributingStatsSection contributing={state.contributing} />
      <ActivitySection recentActivity={state.recentActivity} />
      {state.cacheUpdatedAt && (
        <>
          <hr className="widget-panel__separator" />
          <div className="widget-panel__freshness">Data as of {formatRelativeTime(state.cacheUpdatedAt)}</div>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 4: Add the cost/activity CSS**

Modify `src/App.css` — add after the `.source-selector__item.is-active` block:

```css
.usage-cost {
  display: flex;
  justify-content: space-between;
  font-size: 0.85em;
  margin-bottom: 8px;
}

.usage-activity {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.usage-activity__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8em;
  opacity: 0.85;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/UsageView.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: clean, no errors anywhere

Run: `npx vitest run`
Expected: every test file passes

- [ ] **Step 7: Commit**

```bash
git add src/components/UsageView.tsx src/App.css tests/UsageView.test.tsx
git commit -m "feat: generalize UsageView to render any source's windows, cost, and activity"
```

---

### Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all test files pass (existing + all new ones from this plan)

- [ ] **Step 2: Strict type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: clean

- [ ] **Step 3: Manual check — machine without Cursor available (or with token deliberately unreadable)**

Run the dev app (`npm run dev`). Confirm the header still shows the plain "Sonnet 5 · last active" text exactly as before, with no dropdown — this is the `cursorAvailable === false` path and must be a visual no-op versus the app's current behavior.

- [ ] **Step 4: Manual check — real Cursor data**

With Cursor installed and logged in, run the dev app. Confirm:
- The header is now a clickable button showing "Claude Code" (or "Cursor" if that's still selected from a prior run — `activeSourceId` isn't persisted across restarts per the original selector spec, so it always starts on `'claude'`).
- Clicking it opens a menu with both "Claude Code" and "Cursor".
- Selecting "Cursor" switches the tray ring and the popup to show the real billing-cycle percentage, cost line, and reset date from your actual Cursor account.
- Switching back to "Claude Code" restores Claude's view exactly as before.

- [ ] **Step 5: Confirm no credential ever appears in logs**

Run: `grep -rn "cursorAuth" electron/ src/ | grep -iv "test\|accessToken'" `
Expected: no output showing the token value being passed to `console.log`, template strings printed anywhere, or written to a file — only to the `Authorization` header inside `dashboardClient.ts`.
