import { BrowserWindow, Tray, screen } from 'electron'
import path from 'node:path'

let popup: BrowserWindow | null = null

export const POPUP_WIDTH = 360

export interface PopupSource {
  devServerUrl?: string
  rendererDist?: string
}

export function getOrCreatePopup(preloadPath: string, source: PopupSource): BrowserWindow {
  if (popup) {
    return popup
  }
  popup = new BrowserWindow({
    width: POPUP_WIDTH,
    height: 220,
    backgroundColor: '#1c1c1e',
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

function positionNearTrayAndShow(win: BrowserWindow, tray: Tray): void {
  const trayBounds = tray.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const windowBounds = win.getBounds()
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
  const y = process.platform === 'darwin' ? trayBounds.y + trayBounds.height : trayBounds.y - windowBounds.height
  const clampedX = Math.min(Math.max(x, display.workArea.x), display.workArea.x + display.workArea.width - windowBounds.width)
  const clampedY = Math.min(Math.max(y, display.workArea.y), display.workArea.y + display.workArea.height - windowBounds.height)
  win.setPosition(clampedX, clampedY)
  win.show()
  win.focus()
}

export function togglePopup(tray: Tray, preloadPath: string, source: PopupSource): void {
  const win = getOrCreatePopup(preloadPath, source)
  if (win.isVisible()) {
    win.hide()
    return
  }
  positionNearTrayAndShow(win, tray)
}

// Unlike togglePopup, always ends with the popup visible — used by menu actions (e.g. "Info")
// that need to land on a specific view rather than following the usual open/close toggle.
export function showPopup(tray: Tray, preloadPath: string, source: PopupSource): BrowserWindow {
  const win = getOrCreatePopup(preloadPath, source)
  positionNearTrayAndShow(win, tray)
  return win
}

export function getPopupIfExists(): BrowserWindow | null {
  return popup
}
