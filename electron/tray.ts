import { Tray, nativeImage, Menu, app } from 'electron'
import { renderUsageRingPng, ICON_SIZE } from '../src/main/trayIcon'
import { formatTrayTitle, type TrayWindowLabel } from '../src/main/trayTitle'
import { toggleIconPng, preferencesIconPng, infoIconPng, quitIconPng } from '../src/main/menuIcons'

let tray: Tray | null = null

export type TrayPanelView = 'settings' | 'about'

// Template images: macOS re-tints these automatically (e.g. white when a menu row is
// highlighted) instead of the fixed black they're drawn in.
function templateIcon(pngBuffer: Buffer): Electron.NativeImage {
  const image = nativeImage.createFromBuffer(pngBuffer)
  image.setTemplateImage(true)
  return image
}

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
    { label: 'Toggle', icon: templateIcon(toggleIconPng()), click: () => onClick(tray as Tray) },
    { type: 'separator' },
    { label: 'Preferences', icon: templateIcon(preferencesIconPng()), click: () => onShowView(tray as Tray, 'settings') },
    { label: 'Info', icon: templateIcon(infoIconPng()), click: () => onShowView(tray as Tray, 'about') },
    { type: 'separator' },
    { label: 'Quit', icon: templateIcon(quitIconPng()), accelerator: 'Cmd+Q', click: () => app.quit() },
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
