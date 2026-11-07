import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function defaultCursorStateDbPath(): string {
  return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
}

// The value column stores a raw string for this key (not JSON-encoded) —
// never JSON.parse it, and never log/print the returned value.
export function readCursorAccessToken(dbPath: string = defaultCursorStateDbPath()): string | null {
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('cursorAuth/accessToken') as
        | { value: string }
        | undefined
      return row?.value ?? null
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export function readCursorEmail(dbPath: string = defaultCursorStateDbPath()): string | null {
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('cursorAuth/cachedEmail') as
        | { value: string }
        | undefined
      return row?.value ? row.value : null
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}
