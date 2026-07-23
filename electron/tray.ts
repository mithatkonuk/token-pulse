import { Tray, nativeImage, Menu, app } from 'electron'
import { renderUsageBarPng } from '../src/main/trayIcon'

let tray: Tray | null = null

export function createTray(onClick: (tray: Tray) => void): Tray {
  tray = new Tray(nativeImage.createFromBuffer(renderUsageBarPng(0)))
  tray.setToolTip('token-pulse')
  tray.on('click', () => onClick(tray as Tray))
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }]))
  return tray
}

export function updateTrayIcon(percentUsed: number): void {
  if (!tray) {
    return
  }
  tray.setImage(nativeImage.createFromBuffer(renderUsageBarPng(percentUsed)))
}

export function getTray(): Tray | null {
  return tray
}
