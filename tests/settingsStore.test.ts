import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSettings, writeSettings } from '../src/main/settingsStore'
import type { AppSettings } from '../src/shared/types'

let filePath: string

const DEFAULTS: AppSettings = {
  startAtLogin: false,
  theme: 'dark',
  accentColor: '#0a84ff',
  fontFamily: 'system',
  fontSize: 'medium',
}

afterEach(() => {
  fs.rmSync(filePath, { force: true })
})

describe('settingsStore', () => {
  it('returns defaults when the file does not exist', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-missing-${Date.now()}.json`)
    expect(readSettings(filePath)).toEqual(DEFAULTS)
  })

  it('round-trips a written value', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-roundtrip-${Date.now()}.json`)
    const custom: AppSettings = {
      startAtLogin: true,
      theme: 'light',
      accentColor: '#ff0000',
      fontFamily: 'roboto',
      fontSize: 'large',
    }
    writeSettings(filePath, custom)
    expect(readSettings(filePath)).toEqual(custom)
  })

  it('merges partial file contents with defaults', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-partial-${Date.now()}.json`)
    fs.writeFileSync(filePath, JSON.stringify({ startAtLogin: true }))
    expect(readSettings(filePath)).toEqual({ ...DEFAULTS, startAtLogin: true })
  })
})
