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
  const clampedY = Math.min(Math.max(y, display.workArea.y), display.workArea.y + display.workArea.height - windowBounds.height)
  win.setPosition(clampedX, clampedY)
  win.show()
  win.focus()
}

export function getPopupIfExists(): BrowserWindow | null {
  return popup
}
