import fs from 'node:fs'

export interface AppSettings {
  startAtLogin: boolean
}

const DEFAULT_SETTINGS: AppSettings = { startAtLogin: false }

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
