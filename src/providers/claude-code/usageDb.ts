import { DatabaseSync } from 'node:sqlite'
import type { TurnRow } from './windowCalc'

export function readTurnsSince(dbPath: string, sinceIso: string): TurnRow[] {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return db
      .prepare(
        `SELECT timestamp,
                input_tokens as inputTokens,
                output_tokens as outputTokens,
                cache_read_tokens as cacheReadTokens,
                cache_creation_tokens as cacheCreationTokens
         FROM turns
         WHERE timestamp >= ?
         ORDER BY timestamp ASC`
      )
      .all(sinceIso) as unknown as TurnRow[]
  } finally {
    db.close()
  }
}

export function readLatestModel(dbPath: string): string | null {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const row = db.prepare(`SELECT model FROM turns ORDER BY timestamp DESC LIMIT 1`).get() as
      | { model: string }
      | undefined
    return row?.model ?? null
  } finally {
    db.close()
  }
}
