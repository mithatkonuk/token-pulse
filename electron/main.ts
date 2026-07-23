import { app, ipcMain, shell } from 'electron'
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

const DEFAULT_PLAN_LIMITS_CONFIG: PlanLimitsConfig = {
  defaultTier: 'claude_pro',
  notes:
    "Anthropic does not publish exact 5h/weekly token thresholds. These are rough community-estimated starting points, scaled from the Pro tier by each plan's advertised usage multiplier. Edit the numbers below once you've observed your own real limits.",
  tiers: {
    claude_pro: { five_hour: 200000, weekly: 2000000 },
    claude_max_5x: { five_hour: 1000000, weekly: 10000000 },
    claude_max_20x: { five_hour: 4000000, weekly: 40000000 },
  },
}

const CONFIG_PATH = app.isPackaged
  ? path.join(process.env.APP_ROOT, 'config', 'plan-limits.json').replace('app.asar', 'app.asar.unpacked')
  : path.join(process.env.APP_ROOT, 'config', 'plan-limits.json')

function loadPlanLimitsConfig(): PlanLimitsConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as PlanLimitsConfig
  } catch (err) {
    console.error('Failed to read config/plan-limits.json, using built-in defaults:', err)
    return DEFAULT_PLAN_LIMITS_CONFIG
  }
}

const planLimitsConfig = loadPlanLimitsConfig()

const provider = new ClaudeCodeProvider({ planLimitsConfig })

let state: UsageState = {
  planTier: planLimitsConfig.defaultTier,
  currentModel: provider.getCurrentModel(),
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
  state = {
    ...state,
    windows: [provider.getWindow('five_hour'), state.windows[1]],
    currentModel: provider.getCurrentModel(),
    updatedAt: new Date().toISOString(),
  }
  pushState()
}

function pollWeekly(): void {
  state = {
    ...state,
    planTier: provider.getPlanTier() ?? planLimitsConfig.defaultTier,
    windows: [state.windows[0], provider.getWindow('weekly')],
    updatedAt: new Date().toISOString(),
  }
  pushState()
}

ipcMain.handle('usage:get', () => state)

ipcMain.handle('settings:setStartAtLogin', (_event, enabled: boolean) => {
  writeSettings(SETTINGS_PATH, { startAtLogin: enabled })
  setStartAtLogin(enabled)
  state = { ...state, startAtLogin: enabled }
  pushState()
})

ipcMain.handle('config:reveal', () => {
  shell.showItemInFolder(CONFIG_PATH)
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
