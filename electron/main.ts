import { app, ipcMain, nativeTheme } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import { createTray, updateTrayIcon } from './tray'
import { trayWindowLabelForWindowId } from '../src/main/trayTitle'
import { togglePopup, showPopup, getPopupIfExists, POPUP_WIDTH } from './windowManager'
import { setStartAtLogin, getStartAtLogin } from './autostart'
import { ClaudeCodeProvider } from '../src/providers/claude-code'
import { CursorProvider } from '../src/providers/cursor'
import { readCursorAccessToken } from '../src/providers/cursor/cursorAuth'
import type { UsageProvider } from '../src/providers/types'
import type { AppState, AppSettings, SourceUsage } from '../src/shared/types'
import { readSettings, writeSettings } from '../src/main/settingsStore'
import {
  shouldRefreshUsageCommand,
  shouldRefreshImmediately,
  ACTIVE_INTERVAL_MS,
  NEAR_LIMIT_INTERVAL_MS,
  IMMEDIATE_REFRESH_MIN_INTERVAL_MS,
  type UsageCommandScheduleConfig,
} from '../src/main/usageCommandScheduler'
import { computeBackoffIntervalMs } from '../src/main/cursorBackoff'
import { parseResetTimestamp } from '../src/main/resetTimestamp'
import { isNearLimit } from '../src/main/nearLimit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs')
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

// Safety net in case a file watcher misses an event (rare, but fs watching isn't
// 100% reliable cross-platform) — normal updates are watch-driven, not timed.
const FALLBACK_POLL_MS = 60 * 1000

// Small margin past the CLI-reported reset instant so the scheduled refresh doesn't land a few
// hundred ms early and still read the pre-reset window.
const RESET_REFRESH_BUFFER_MS = 5 * 1000

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
  refreshInFlight: boolean
  resetRefreshTimer: NodeJS.Timeout | null
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
  poll(source)
  // A watched file changing means Claude was just actually used — that's a far more direct signal
  // than "wait for the next 3-minute tick," so check the real usage command now instead of only
  // refreshing the cheap cached display fields. Floored at NEAR_LIMIT_INTERVAL_MS rather than the
  // tighter IMMEDIATE_REFRESH_MIN_INTERVAL_MS used for tray-open: file writes happen continuously
  // during an active session (every streamed turn), so a 15s floor would re-spawn the usage-check
  // subprocess nearly 4x a minute for the whole session — busier than even the dedicated near-cap
  // fast path, which defeats the point of that path being the "watching most closely" cadence.
  refreshUsageFromCommandNow(source, NEAR_LIMIT_INTERVAL_MS)
}

function maybeRefreshUsageFromCommand(source: SourceRuntime): void {
  if (source.refreshInFlight) {
    return
  }
  const now = Date.now()
  const baseActiveIntervalMs = source.activeIntervalMs ?? ACTIVE_INTERVAL_MS
  const effectiveActiveIntervalMs = computeBackoffIntervalMs(baseActiveIntervalMs, source.consecutiveFailures)
  // Once a source is idle, shouldRefreshUsageCommand switches to IDLE_INTERVAL_MS and ignores
  // activeIntervalMs entirely — so a backed-off source must also widen idleIntervalMs, or a
  // persistent failure gets retried every 20 minutes forever instead of respecting the backoff cap.
  const scheduleConfig: UsageCommandScheduleConfig =
    source.consecutiveFailures > 0
      ? { activeIntervalMs: effectiveActiveIntervalMs, idleIntervalMs: effectiveActiveIntervalMs }
      : { activeIntervalMs: effectiveActiveIntervalMs }
  // Only honor near-limit while the source is healthy — a failing source is already on its own
  // backoff cadence via effectiveActiveIntervalMs above, and nearLimit must not override that
  // (it would turn a capped retry backoff into an unbounded 30s retry storm).
  if (source.consecutiveFailures === 0 && isNearLimit(state.usageBySource[source.id])) {
    scheduleConfig.nearLimit = true
  }
  if (
    shouldRefreshUsageCommand(
      { now, lastActivityAt: source.lastActivityAt, lastRefreshAt: source.lastRefreshAt },
      scheduleConfig
    )
  ) {
    source.lastRefreshAt = now
    source.refreshInFlight = true
    void refreshUsageFromCommand(source)
  }
}

// Shared by "the panel was just opened" and "a watched file just changed" — both are a direct
// signal that someone is actually using the source right now, so both deserve an immediate,
// real usage-command check rather than waiting on the ambient 3-10 minute cadence, floored by
// minIntervalMs so a burst of triggers (repeated tray clicks, a flurry of file writes) can't spawn
// a subprocess per event. Callers pick their own floor: tray-open is a rare, human-triggered event
// so it gets the tightest floor (IMMEDIATE_REFRESH_MIN_INTERVAL_MS); file activity happens
// continuously during a session, so it uses a wider one to avoid becoming the busiest cadence in
// the app (see call site in onWatchedFileActivity).
function refreshUsageFromCommandNow(
  source: SourceRuntime,
  minIntervalMs: number = IMMEDIATE_REFRESH_MIN_INTERVAL_MS
): void {
  // This is activity, so a source that had gone idle must not stay on the idle cadence for its
  // next scheduled refresh either.
  source.lastActivityAt = Date.now()
  if (source.refreshInFlight) {
    return
  }
  const baseActiveIntervalMs = source.activeIntervalMs ?? ACTIVE_INTERVAL_MS
  const floorMs =
    source.consecutiveFailures > 0
      ? computeBackoffIntervalMs(baseActiveIntervalMs, source.consecutiveFailures)
      : minIntervalMs
  if (!shouldRefreshImmediately({ now: source.lastActivityAt, lastRefreshAt: source.lastRefreshAt }, floorMs)) {
    return
  }
  source.lastRefreshAt = source.lastActivityAt
  source.refreshInFlight = true
  void refreshUsageFromCommand(source)
}

// The regular active/idle polling cadence (3-10 min) is deliberately relaxed to avoid wasteful
// subprocess calls, but that means the tray can sit on a stale 5h window for a while right after
// it actually resets — especially with nobody around to generate the "activity" that keeps the
// cadence brisk. The CLI already tells us exactly when that window resets, so schedule one precise
// extra refresh for that instant instead of waiting on the ambient poll.
function scheduleResetRefresh(source: SourceRuntime, windows: SourceUsage['windows']): void {
  if (source.resetRefreshTimer) {
    clearTimeout(source.resetRefreshTimer)
    source.resetRefreshTimer = null
  }
  const fiveHour = windows.find((w) => w.id === 'five_hour')
  if (!fiveHour) {
    return
  }
  const target = parseResetTimestamp(fiveHour.resetsText)
  if (!target) {
    return
  }
  const delayMs = target.getTime() - Date.now() + RESET_REFRESH_BUFFER_MS
  if (delayMs <= 0) {
    return
  }
  source.resetRefreshTimer = setTimeout(() => {
    source.resetRefreshTimer = null
    if (source.refreshInFlight) {
      return
    }
    source.lastRefreshAt = Date.now()
    source.refreshInFlight = true
    void refreshUsageFromCommand(source)
  }, delayMs)
}

async function refreshUsageFromCommand(source: SourceRuntime): Promise<void> {
  try {
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
    scheduleResetRefresh(source, result.windows)
  } catch {
    // A provider throwing (e.g. fetch rejecting on a network-level failure — offline, DNS,
    // TLS) must not become an unhandled rejection in the main process; treat it the same as
    // an explicit null result so the failure backoff still engages.
    source.consecutiveFailures += 1
  } finally {
    source.refreshInFlight = false
  }
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
    // Opening: re-read from disk so the panel never shows a watch event we haven't caught yet,
    // and kick off a usage-command refresh so the limit bars aren't a whole cadence behind
    // Claude's own panel at the exact moment someone is comparing them.
    // Closing: nothing to render, so just keep the tray icon in sync without a redundant read.
    if (wasVisible) {
      pushState()
    } else {
      sources.forEach(poll)
      sources.forEach(refreshUsageFromCommandNow)
    }
  }, (trayRef, view) => {
    const win = showPopup(trayRef, PRELOAD_PATH, { devServerUrl: VITE_DEV_SERVER_URL, rendererDist: RENDERER_DIST })
    pushState()
    // On the very first click ever, the popup was just created and its renderer may not have
    // mounted its IPC listener yet — wait for the page load to finish rather than racing it.
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => win.webContents.send('popup:show-view', view))
    } else {
      win.webContents.send('popup:show-view', view)
    }
  }, nativeTheme.shouldUseDarkColors)
  nativeTheme.on('updated', pushState)
  sources.forEach(poll)
  const now = Date.now()
  sources.forEach((s) => {
    s.lastRefreshAt = now
    s.refreshInFlight = true
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
