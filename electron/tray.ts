import { Tray, nativeImage, Menu, app } from 'electron'
import { renderUsageRingPng, ICON_SIZE } from '../src/main/trayIcon'
import { formatTrayTitle, type TrayWindowLabel } from '../src/main/trayTitle'

let tray: Tray | null = null

export type TrayPanelView = 'settings' | 'about'

export function createTray(
  onClick: (tray: Tray) => void,
  onShowView: (tray: Tray, view: TrayPanelView) => void,
  isDarkMode: boolean
): Tray {
  tray = new Tray(nativeImage.createFromBuffer(renderUsageRingPng(0, ICON_SIZE, isDarkMode)))
  tray.setToolTip('token-pulse')
  if (process.platform === 'darwin') {
    tray.setTitle(formatTrayTitle(0))
  }
  const menu = Menu.buildFromTemplate([
    { label: 'Toggle', click: () => onClick(tray as Tray) },
    { type: 'separator' },
    { label: 'Preferences', click: () => onShowView(tray as Tray, 'settings') },
    { label: 'Info', click: () => onShowView(tray as Tray, 'about') },
    { type: 'separator' },
    { label: 'Quit', accelerator: 'Cmd+Q', click: () => app.quit() },
  ])
  tray.on('click', () => onClick(tray as Tray))
  tray.on('right-click', () => tray?.popUpContextMenu(menu))
  return tray
}

export function updateTrayIcon(percentUsed: number, isDarkMode: boolean, windowLabel: TrayWindowLabel = null): void {
  // A watcher/interval callback can still be in flight when quit tears down the native Tray —
  // the module-level reference stays non-null, so `isDestroyed()` is the only real guard.
  if (!tray || tray.isDestroyed()) {
    return
  }
  tray.setImage(nativeImage.createFromBuffer(renderUsageRingPng(percentUsed, ICON_SIZE, isDarkMode)))
  if (process.platform === 'darwin') {
    tray.setTitle(formatTrayTitle(percentUsed, windowLabel))
  }
}

export function getTray(): Tray | null {
  return tray
}
