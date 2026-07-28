import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readCursorAccessToken } from '../src/providers/cursor/cursorAuth'

let dir: string
let dbPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-cursor-auth-test-'))
  dbPath = path.join(dir, 'state.vscdb')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function createStateDb(rows: Record<string, string>): void {
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)')
  const insert = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(rows)) {
    insert.run(key, value)
  }
  db.close()
}

describe('readCursorAccessToken', () => {
  it('reads the raw token string from the ItemTable', () => {
    createStateDb({ 'cursorAuth/accessToken': 'fake-token-value' })
    expect(readCursorAccessToken(dbPath)).toBe('fake-token-value')
  })

  it('returns null when the key is missing', () => {
    createStateDb({ 'some/other/key': 'x' })
    expect(readCursorAccessToken(dbPath)).toBeNull()
  })

  it('returns null when the database file does not exist', () => {
    expect(readCursorAccessToken(path.join(dir, 'missing.vscdb'))).toBeNull()
  })
})
