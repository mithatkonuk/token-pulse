import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildLinuxAutostartEntry } from '../src/main/autostart'

const LINUX_AUTOSTART_PATH = path.join(os.homedir(), '.config', 'autostart', 'token-pulse.desktop')

export function setStartAtLogin(enabled: boolean): void {
  if (process.platform === 'linux') {
    if (enabled) {
      fs.mkdirSync(path.dirname(LINUX_AUTOSTART_PATH), { recursive: true })
      fs.writeFileSync(LINUX_AUTOSTART_PATH, buildLinuxAutostartEntry(process.execPath))
    } else {
      fs.rmSync(LINUX_AUTOSTART_PATH, { force: true })
    }
    return
  }
  app.setLoginItemSettings({ openAtLogin: enabled })
}
