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
  refreshInFlight: boolean
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
  if (source.refreshInFlight) {
    return
  }
  const now = Date.now()
  const baseActiveIntervalMs = source.activeIntervalMs ?? ACTIVE_INTERVAL_MS
  const effectiveActiveIntervalMs = computeBackoffIntervalMs(baseActiveIntervalMs, source.consecutiveFailures)
  // Once a source is idle, shouldRefreshUsageCommand switches to IDLE_INTERVAL_MS and ignores
  // activeIntervalMs entirely — so a backed-off source must also widen idleIntervalMs, or a
  // persistent failure gets retried every 20 minutes forever instead of respecting the backoff cap.
  const scheduleConfig =
    source.consecutiveFailures > 0
      ? { activeIntervalMs: effectiveActiveIntervalMs, idleIntervalMs: effectiveActiveIntervalMs }
      : { activeIntervalMs: effectiveActiveIntervalMs }
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
