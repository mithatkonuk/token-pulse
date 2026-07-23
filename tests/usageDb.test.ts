import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readTurnsSince, readLatestModel } from '../src/providers/claude-code/usageDb'

let dbPath: string

function createFixtureDb(path_: string): void {
  const db = new DatabaseSync(path_)
  db.exec(`
    CREATE TABLE turns (
      timestamp TEXT,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_creation_tokens INTEGER
    )
  `)
  db.exec(`INSERT INTO turns VALUES ('2026-07-23T09:00:00.000Z', 'claude-opus-4-8', 10, 20, 0, 0)`)
  db.exec(`INSERT INTO turns VALUES ('2026-07-23T11:00:00.000Z', 'claude-sonnet-5', 100, 200, 50, 5)`)
  db.close()
}

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `token-pulse-usagedb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  createFixtureDb(dbPath)
})

afterEach(() => {
  fs.rmSync(dbPath, { force: true })
})

describe('readTurnsSince', () => {
  it('returns only turns at or after the given timestamp, oldest first', () => {
    const rows = readTurnsSince(dbPath, '2026-07-23T10:00:00.000Z')
    expect(rows).toEqual([
      {
        timestamp: '2026-07-23T11:00:00.000Z',
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 50,
        cacheCreationTokens: 5,
      },
    ])
  })
})

describe('readLatestModel', () => {
  it('returns the model of the most recent turn', () => {
    expect(readLatestModel(dbPath)).toBe('claude-sonnet-5')
  })

  it('returns null when there are no turns', () => {
    fs.rmSync(dbPath, { force: true })
    const db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE turns (
        timestamp TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
        cache_read_tokens INTEGER, cache_creation_tokens INTEGER
      )
    `)
    db.close()
    expect(readLatestModel(dbPath)).toBeNull()
  })
})
