import { app, ipcMain, nativeTheme } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import { createTray, updateTrayIcon } from './tray'
import { togglePopup, getPopupIfExists, POPUP_WIDTH } from './windowManager'
import { setStartAtLogin, getStartAtLogin } from './autostart'
import { ClaudeCodeProvider } from '../src/providers/claude-code'
import type { UsageState, AppSettings } from '../src/shared/types'
import { readSettings, writeSettings } from '../src/main/settingsStore'
import { shouldRefreshUsageCommand } from '../src/main/usageCommandScheduler'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs')
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

// Safety net in case the file watcher misses an event (rare, but fs watching
// isn't 100% reliable cross-platform) — normal updates are watch-driven, not timed.
const FALLBACK_POLL_MS = 60 * 1000

// A dedicated scratch directory, never a real project's cwd, so these recurring background
// calls don't get attributed to whatever project you're actually working in.
const USAGE_COMMAND_CWD = path.join(app.getPath('userData'), 'usage-check-cwd')
fs.mkdirSync(USAGE_COMMAND_CWD, { recursive: true })

const provider = new ClaudeCodeProvider()

// Tracks real Claude activity (any watched session/cache file write) so the /usage command
// cadence can back off when nothing's happening instead of polling on a fixed timer forever.
let lastActivityAt = Date.now()
let lastUsageCommandAt = 0

let state: UsageState = {
  planTier: provider.getPlanTier(),
  currentModel: null,
  windows: [],
  contextWindow: null,
  contributing: null,
  updatedAt: new Date().toISOString(),
  cacheUpdatedAt: null,
  settings: readSettings(SETTINGS_PATH),
  appVersion: app.getVersion(),
}

function resolveIsDarkMode(theme: AppSettings['theme']): boolean {
  if (theme === 'system') {
    return nativeTheme.shouldUseDarkColors
  }
  return theme === 'dark'
}

function pushState(): void {
  const fiveHour = state.windows.find((w) => w.id === 'five_hour')
  updateTrayIcon(fiveHour?.percentUsed ?? 0, resolveIsDarkMode(state.settings.theme))
  const popup = getPopupIfExists()
  if (popup && popup.isVisible()) {
    popup.webContents.send('usage:update', state)
  }
}

function poll(): void {
  const cached = provider.getCachedUsage()
  state = {
    ...state,
    planTier: provider.getPlanTier(),
    currentModel: cached.currentModel,
    contextWindow: cached.contextWindow,
    updatedAt: new Date().toISOString(),
  }
  pushState()
}

function onWatchedFileActivity(): void {
  lastActivityAt = Date.now()
  poll()
}

function maybeRefreshUsageFromCommand(): void {
  if (shouldRefreshUsageCommand({ now: Date.now(), lastActivityAt, lastRefreshAt: lastUsageCommandAt })) {
    lastUsageCommandAt = Date.now()
    void refreshUsageFromCommand()
  }
}

async function refreshUsageFromCommand(): Promise<void> {
  const result = await provider.getUsageFromCommand(USAGE_COMMAND_CWD)
  if (result === null) {
    return
  }
  state = {
    ...state,
    windows: result.windows,
    contributing: result.contributing,
    cacheUpdatedAt: result.fetchedAt,
  }
  pushState()
}

ipcMain.handle('usage:get', () => state)

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
      poll()
    }
  }, resolveIsDarkMode(state.settings.theme))
  poll()
  lastUsageCommandAt = Date.now()
  void refreshUsageFromCommand()
  chokidar
    .watch(provider.getWatchedPaths(), {
      ignoreInitial: true,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })
    .on('add', onWatchedFileActivity)
    .on('change', onWatchedFileActivity)
  setInterval(poll, FALLBACK_POLL_MS)
  setInterval(maybeRefreshUsageFromCommand, FALLBACK_POLL_MS)
})

app.on('window-all-closed', () => {
  // Intentionally do nothing — the app lives in the tray.
})
