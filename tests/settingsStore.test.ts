import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSettings, writeSettings } from '../src/main/settingsStore'

let filePath: string

afterEach(() => {
  fs.rmSync(filePath, { force: true })
})

describe('settingsStore', () => {
  it('returns defaults when the file does not exist', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-missing-${Date.now()}.json`)
    expect(readSettings(filePath)).toEqual({ startAtLogin: false })
  })

  it('round-trips a written value', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-roundtrip-${Date.now()}.json`)
    writeSettings(filePath, { startAtLogin: true })
    expect(readSettings(filePath)).toEqual({ startAtLogin: true })
  })

  it('merges partial file contents with defaults', () => {
    filePath = path.join(os.tmpdir(), `token-pulse-settings-partial-${Date.now()}.json`)
    fs.writeFileSync(filePath, JSON.stringify({}))
    expect(readSettings(filePath)).toEqual({ startAtLogin: false })
  })
})
