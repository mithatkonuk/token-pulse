import { Tray, nativeImage, Menu, app } from 'electron'
import { renderUsageRingPng, ICON_SIZE } from '../src/main/trayIcon'
import { formatTrayTitle, type TrayWindowLabel } from '../src/main/trayTitle'

let tray: Tray | null = null

export function createTray(onClick: (tray: Tray) => void, onShowInfo: (tray: Tray) => void, isDarkMode: boolean): Tray {
  tray = new Tray(nativeImage.createFromBuffer(renderUsageRingPng(0, ICON_SIZE, isDarkMode)))
  tray.setToolTip('token-pulse')
  if (process.platform === 'darwin') {
    tray.setTitle(formatTrayTitle(0))
  }
  const menu = Menu.buildFromTemplate([
    { label: 'Info', click: () => onShowInfo(tray as Tray) },
    { type: 'separator' },
    { label: 'Quit token-pulse', accelerator: 'Cmd+Q', click: () => app.quit() },
  ])
  tray.on('click', () => onClick(tray as Tray))
  tray.on('right-click', () => tray?.popUpContextMenu(menu))
  return tray
}

export function updateTrayIcon(percentUsed: number, isDarkMode: boolean, windowLabel: TrayWindowLabel = null): void {
  if (!tray) {
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
