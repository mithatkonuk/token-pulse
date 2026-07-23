import { Tray, nativeImage, Menu, app } from 'electron'
import { renderUsageRingPng } from '../src/main/trayIcon'

let tray: Tray | null = null

function formatTitle(percentUsed: number): string {
  return ` ${Math.round(percentUsed)}%`
}

export function createTray(onClick: (tray: Tray) => void): Tray {
  tray = new Tray(nativeImage.createFromBuffer(renderUsageRingPng(0)))
  tray.setToolTip('token-pulse')
  if (process.platform === 'darwin') {
    tray.setTitle(formatTitle(0))
  }
  const menu = Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }])
  tray.on('click', () => onClick(tray as Tray))
  tray.on('right-click', () => tray?.popUpContextMenu(menu))
  return tray
}

export function updateTrayIcon(percentUsed: number): void {
  if (!tray) {
    return
  }
  tray.setImage(nativeImage.createFromBuffer(renderUsageRingPng(percentUsed)))
  if (process.platform === 'darwin') {
    tray.setTitle(formatTitle(percentUsed))
  }
}

export function getTray(): Tray | null {
  return tray
}
