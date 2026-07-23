import { app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTray, updateTrayIcon } from './tray'
import { togglePopup, getPopupIfExists } from './windowManager'
import { setStartAtLogin } from './autostart'
import { ClaudeCodeProvider } from '../src/providers/claude-code'
import type { PlanLimitsConfig } from '../src/providers/claude-code/planLimits'
import type { UsageState } from '../src/shared/types'
import { readSettings, writeSettings } from '../src/main/settingsStore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const PRELOAD_PATH = path.join(__dirname, 'preload.mjs')
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

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
  startAtLogin: readSettings(SETTINGS_PATH).startAtLogin,
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

ipcMain.handle('settings:setStartAtLogin', (_event, enabled: boolean) => {
  writeSettings(SETTINGS_PATH, { startAtLogin: enabled })
  setStartAtLogin(enabled)
  state = { ...state, startAtLogin: enabled }
  pushState()
})

app.whenReady().then(() => {
  createTray((trayRef) => {
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
