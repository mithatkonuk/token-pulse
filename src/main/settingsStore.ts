import fs from 'node:fs'
import type { AppSettings } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  startAtLogin: false,
  theme: 'dark',
  accentColor: '#0a84ff',
  fontFamily: 'system',
  fontSize: 'medium',
}

export function readSettings(filePath: string): AppSettings {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function writeSettings(filePath: string, settings: AppSettings): void {
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2))
}
