# Cursor usage source — design

## Goal

Add Cursor as a real second usage source in token-pulse, activating the previously-shelved
multi-source selector (`docs/superpowers/specs/2026-07-27-source-selector-design.md`) for
real: the popup's model-name header becomes a clickable selector between "Claude Code" and
"Cursor", and whichever source is active drives both the tray ring and the popup's detailed
view — including a cost-in-$ line and a per-request activity table for Cursor, which Claude's
data doesn't have.

Built as a feature inside the existing Electron tray/popup app — not a separate VS Code/Cursor
extension — per an earlier explicit decision, since the requested feature list (auto token
detection, status-bar display, secure credential storage, etc.) was originally shaped for a
VS Code extension but token-pulse already owns the tray-icon/popup/OS-keychain equivalents of
each of those pieces.

## Why this is feasible now (it wasn't, previously)

The prior source-selector spec deferred Cursor because no local usage/quota data was
reachable. Since then, direct investigation established:

- `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` is a plain SQLite
  key-value table (`ItemTable`) containing `cursorAuth/accessToken` in the clear — a real,
  directly-readable local credential (confirmed the key exists; never printed the value).
- Cursor's own IDE bundle (`workbench.desktop.main.js`) contains a real Connect-RPC service
  registry, `aiserver.v1.DashboardService`, with methods `GetCurrentPeriodUsage`,
  `GetFilteredUsageEvents`, `GetAggregatedUsageEvents`, `GetUsageLimitStatusAndActiveGrants`,
  etc. — a genuine RPC surface backing the same panel the official app renders.
- The web dashboard (`cursor.com/dashboard/usage`) hits a parallel plain-JSON REST API
  (`cursor.com/api/dashboard/get-current-period-usage`, `get-filtered-usage-events`, ...)
  authenticated via a **browser session cookie** — confirmed live (real numbers returned,
  matching the on-screen UI text exactly) but confirmed **not** reachable with the
  `accessToken` from `state.vscdb` (a direct Bearer-auth attempt got redirected to login —
  that token is scoped to the desktop app's own backend, not the website's session-cookie
  auth).
- The desktop app's real backend, `api2.cursor.sh`, **was** confirmed reachable with that
  token: `POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage`
  with `Authorization: Bearer <token>`, `Content-Type: application/proto`, empty body →
  **HTTP 200**, with real usage data in the response (readable display strings in the binary
  payload matched the JSON dashboard's text verbatim: *"You've used 32% of your included
  usage"*, etc.).

Net: the credential we can read in plaintext works against its real intended backend
(`api2.cursor.sh`, Connect-RPC/protobuf), not the simpler JSON API (which needs a browser
cookie we don't have access to and won't extract — decrypting Chrome's keychain-protected
cookie store is a materially more sensitive operation than reading a plaintext SQLite value,
and out of scope here). This is still an **unofficial, undocumented API** — no published
schema, no published rate-limit policy — so it can change or be throttled without notice.

## 1. Data model

Extends the shelved selector spec's `SourceUsage`/`SourceDescriptor`/`AppState` shapes
(`src/shared/types.ts`):

- `UsageWindow.id` loosens from the literal union `'five_hour' | 'weekly'` to `string`.
  Cursor reports one window: `{id: 'billing_cycle', label: 'Monthly billing cycle',
  percentUsed: <totalPercentUsed>, resetsText: <formatted billingCycleEnd>}` — same shape,
  no new fields.
- Two new fields on `SourceUsage`, both nullable so Claude's provider is untouched (it simply
  never populates them, and `UsageView` renders nothing extra when they're `null`):

  ```ts
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
  // added to SourceUsage:
  cost: CostSummary | null
  recentActivity: UsageEvent[] | null
  ```

`UsageView` renders a cost line and an activity table only when `cost`/`recentActivity` are
non-null, so Claude's popup is visually unchanged and Cursor's gets the richer view for free.

## 2. CursorProvider

New module tree mirroring `src/providers/claude-code/`:

- **`src/providers/cursor/cursorAuth.ts`** — reads `cursorAuth/accessToken` from
  `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` via `node:sqlite`
  (same technique already used for Claude's `usage.db`). Returns `string | null` — no
  throwing if the key or file is missing (Cursor never installed, logged out, etc.), matching
  `ClaudeCodeProvider.getPlanTier()`'s defensive style.
- **`src/providers/cursor/dashboardClient.ts`** — a minimal, hand-rolled Connect-RPC unary
  client, deliberately not a full generated protobuf SDK. For each RPC needed
  (`GetCurrentPeriodUsage`, `GetFilteredUsageEvents`, `GetAggregatedUsageEvents`): POST to
  `https://api2.cursor.sh/aiserver.v1.DashboardService/<Method>` with
  `Content-Type: application/proto`, `Connect-Protocol-Version: 1`,
  `Authorization: Bearer <token>`, empty body (confirmed sufficient for
  `GetCurrentPeriodUsage`); then hand-decode only the ~6-10 fields actually consumed
  (varint/length-delimited parsing keyed by field numbers pinned down by correlating against
  the JSON-API ground truth already captured), not the full message schema.
- **`src/providers/cursor/index.ts`** — `CursorProvider`, matching `ClaudeCodeProvider`'s
  shape: `getWatchedPaths()` returns `~/.cursor/chats` (mtime-based activity signal via
  chokidar — no need to parse the protobuf chat blobs, just detect that something changed),
  `getPlanTier()` returns the team/individual `limitType`, cached/command-usage methods wrap
  `dashboardClient` and map results into `SourceUsage`.
- A new `UsageProvider` interface (`src/providers/types.ts` or similar) captures the shape
  both providers implement — `electron/main.ts` currently duck-types `ClaudeCodeProvider`
  with no declared contract; a second real implementation now justifies naming it explicitly.

## 3. Multi-source selector, activated

Implements the shelved `2026-07-27-source-selector-design.md` spec for real:

- `electron/main.ts` instantiates both `new ClaudeCodeProvider()` and `new CursorProvider()`,
  each polled on its own schedule (§4), writing into `AppState.usageBySource.claude` /
  `.cursor`. `AppState.sources = [{id:'claude', label:'Claude Code'}, {id:'cursor',
  label:'Cursor'}]`, `activeSourceId` defaults to `'claude'`.
- `SourceSelector` now genuinely exercises its `sources.length > 1` branch: the header
  model-name text becomes a clickable button opening a popover listing both sources;
  selecting one flips `activeSourceId` via `source:select` IPC and re-broadcasts
  `usage:update`, exactly as originally spec'd.
- `WidgetPanel` derives `activeUsage = state.usageBySource[state.activeSourceId]` and passes
  it to `UsageView`, which renders Cursor's extra cost/activity sections only when present.
- The tray icon's ring always reflects whichever source is currently active — switching
  sources changes what the ring itself shows, not just the popup.

## 4. Polling & rate-limit safety

`CursorProvider` gets its own instance of the existing generic scheduler
(`usageCommandScheduler.ts`'s `shouldRefreshUsageCommand`), independent of Claude's instance —
each source tracks its own `lastActivityAt`/`lastRefreshAt`.

- More conservative active-tier constant than Claude's, since this is an undocumented
  endpoint with no published rate-limit policy (confirmed via direct inspection — no
  `X-RateLimit-*` headers on the response): `ACTIVE_INTERVAL_MS = 5 * 60 * 1000` (5 min, vs.
  Claude's 3). `IDLE_INTERVAL_MS` / `IDLE_THRESHOLD_MS` keep the same shape (20 min / 15 min).
- New adaptive-backoff-on-failure behavior, not present in Claude's provider (Claude's CLI
  call is a supported, stable command and doesn't need this): on a non-200 response,
  `CursorProvider` doubles its own next-poll delay, capped at 1 hour, rather than retrying on
  the fixed schedule — the real safety net given there's no documented ceiling to design
  against.
- Activity detection reuses the `~/.cursor/chats` chokidar watch from §2 — file writes there
  bump `lastActivityAt` for Cursor's scheduler only, independent of Claude's.
- Explicitly no attempt to discover the real rate limit empirically by increasing call
  frequency until throttled — undocumented limits aren't safe to probe that way.

## 5. Testing

- `dashboardClient.test.ts`: feed the actual captured response bytes from the live probe
  (saved as a fixture) through the decoder and assert it extracts the exact known values
  already captured as JSON ground truth (`totalPercentUsed`, `totalSpend`, etc.) — a real
  regression test against real bytes, not a mock.
- `cursorAuth.test.ts`: mock `node:sqlite` (same pattern as the existing `usage.db` tests) —
  token-present, key-missing, file-missing cases.
- `CursorProvider.test.ts`: mirrors `ClaudeCodeProvider`'s existing test shape.
- `SourceSelector.test.tsx`: the tests already designed in the shelved spec, now exercising 2
  real source descriptors instead of mocks.
- Backoff logic (§4) gets its own pure-function unit tests, same style as
  `usageCommandScheduler.test.ts`.
- Manual check: run the dev app, switch sources in the popup, confirm the tray ring and popup
  both reflect Cursor's real numbers.

## Out of scope

- Extracting or decrypting a browser session cookie to use the simpler JSON REST API instead
  of protobuf — a materially more sensitive operation than reading a plaintext SQLite value,
  not undertaken here.
- A full generated protobuf client/schema for `aiserver.v1.DashboardService` — only the
  handful of fields actually consumed are hand-decoded.
- Empirically probing Cursor's real rate limit by increasing call frequency until throttled.
- Any UI/feature for Claude that mirrors Cursor's new cost/activity sections — Claude has no
  underlying data for either, and nothing here fabricates it.
- Persisting `activeSourceId` across restarts (same deferral as the original selector spec).
