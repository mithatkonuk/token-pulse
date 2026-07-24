import { app, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTray, updateTrayIcon } from './tray'
import { togglePopup, getPopupIfExists } from './windowManager'
import { setStartAtLogin, getStartAtLogin } from './autostart'
import { ClaudeCodeProvider } from '../src/providers/claude-code'
import type { UsageState, AppSettings } from '../src/shared/types'
import { readSettings, writeSettings } from '../src/main/settingsStore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs')
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

const POLL_MS = 5 * 1000

const provider = new ClaudeCodeProvider()

let state: UsageState = {
  planTier: provider.getPlanTier(),
  currentModel: null,
  windows: [],
  updatedAt: new Date().toISOString(),
  cacheUpdatedAt: null,
  settings: readSettings(SETTINGS_PATH),
  appVersion: app.getVersion(),
}

function pushState(): void {
  const fiveHour = state.windows.find((w) => w.id === 'five_hour')
  updateTrayIcon(fiveHour?.percentUsed ?? 0)
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
    currentModel: cached?.currentModel ?? null,
    windows: cached?.windows ?? [],
    updatedAt: new Date().toISOString(),
    cacheUpdatedAt: cached?.cacheUpdatedAt ?? null,
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

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }
  const actualSettings: AppSettings = { ...state.settings, startAtLogin: getStartAtLogin() }
  writeSettings(SETTINGS_PATH, actualSettings)
  state = { ...state, settings: actualSettings }
  createTray((trayRef) => {
    togglePopup(trayRef, PRELOAD_PATH, { devServerUrl: VITE_DEV_SERVER_URL, rendererDist: RENDERER_DIST })
    pushState()
  })
  poll()
  setInterval(poll, POLL_MS)
})

app.on('window-all-closed', () => {
  // Intentionally do nothing — the app lives in the tray.
})
