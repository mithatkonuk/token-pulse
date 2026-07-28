import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findNewestTranscript, formatModelDisplayName, readLastModelId, readLastUsage } from '../src/providers/claude-code/transcript'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-transcript-test-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function writeTranscript(project: string, file: string, lines: unknown[]): string {
  const projectDir = path.join(dir, project)
  fs.mkdirSync(projectDir, { recursive: true })
  const filePath = path.join(projectDir, file)
  fs.writeFileSync(filePath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n')
  return filePath
}

describe('findNewestTranscript', () => {
  it('returns null when the projects dir does not exist', () => {
    expect(findNewestTranscript(path.join(dir, 'missing'))).toBeNull()
  })

  it('returns null when there are no jsonl files', () => {
    fs.mkdirSync(path.join(dir, 'proj-a'))
    expect(findNewestTranscript(dir)).toBeNull()
  })

  it('picks the most recently modified jsonl across all project subdirectories', () => {
    const older = writeTranscript('proj-a', 'older.jsonl', [{ message: { model: 'claude-sonnet-5' } }])
    const newer = writeTranscript('proj-b', 'newer.jsonl', [{ message: { model: 'claude-opus-5' } }])
    const now = Date.now()
    fs.utimesSync(older, new Date(now - 10_000), new Date(now - 10_000))
    fs.utimesSync(newer, new Date(now), new Date(now))
    expect(findNewestTranscript(dir)).toBe(newer)
  })

  it('ignores non-jsonl files', () => {
    fs.mkdirSync(path.join(dir, 'proj-a'))
    fs.writeFileSync(path.join(dir, 'proj-a', 'notes.txt'), 'hello')
    expect(findNewestTranscript(dir)).toBeNull()
  })
})

describe('readLastModelId', () => {
  it('returns the model from the last main-thread assistant entry', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [
      { message: { model: 'claude-sonnet-5' } },
      { message: { model: 'claude-opus-5' } },
    ])
    expect(readLastModelId(file)).toBe('claude-opus-5')
  })

  it('skips sidechain (subagent) entries', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [
      { message: { model: 'claude-opus-5' } },
      { isSidechain: true, message: { model: 'claude-haiku-4-5-20251001' } },
    ])
    expect(readLastModelId(file)).toBe('claude-opus-5')
  })

  it('skips entries with non-versioned model values like aliases or synthetic', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [
      { message: { model: 'claude-opus-5' } },
      { message: { model: 'sonnet' } },
      { message: { model: '<synthetic>' } },
    ])
    expect(readLastModelId(file)).toBe('claude-opus-5')
  })

  it('returns null when the file does not exist', () => {
    expect(readLastModelId(path.join(dir, 'missing.jsonl'))).toBeNull()
  })

  it('returns null when no entry has a usable model', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [{ message: {} }])
    expect(readLastModelId(file)).toBeNull()
  })

  it('picks up a /model switch from its command-stdout line before any assistant reply', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [
      { message: { model: 'claude-sonnet-5' } },
      { type: 'user', message: { role: 'user', content: '<command-name>/model</command-name>' } },
      {
        type: 'user',
        message: { role: 'user', content: '<local-command-stdout>Set model to claude-opus-5</local-command-stdout>' },
      },
    ])
    expect(readLastModelId(file)).toBe('claude-opus-5')
  })

  it('ignores non-string message content when checking for a /model command-stdout line', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [
      { message: { model: 'claude-opus-5' } },
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } },
    ])
    expect(readLastModelId(file)).toBe('claude-opus-5')
  })

  it('skips a malformed trailing line instead of crashing', () => {
    const filePath = path.join(dir, 'proj-a')
    fs.mkdirSync(filePath, { recursive: true })
    const file = path.join(filePath, 'session.jsonl')
    fs.writeFileSync(file, `${JSON.stringify({ message: { model: 'claude-opus-5' } })}\n{not valid json`)
    expect(readLastModelId(file)).toBe('claude-opus-5')
  })
})

describe('readLastUsage', () => {
  it('returns the usage from the last main-thread assistant entry', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [
      {
        type: 'assistant',
        message: { usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 200 } },
      },
      {
        type: 'assistant',
        message: { usage: { input_tokens: 2, cache_creation_input_tokens: 16138, cache_read_input_tokens: 12561 } },
      },
    ])
    expect(readLastUsage(file)).toEqual({ inputTokens: 2, cacheCreationInputTokens: 16138, cacheReadInputTokens: 12561 })
  })

  it('skips sidechain (subagent) entries', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [
      {
        type: 'assistant',
        message: { usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 200 } },
      },
      {
        type: 'assistant',
        isSidechain: true,
        message: { usage: { input_tokens: 9, cache_creation_input_tokens: 9, cache_read_input_tokens: 9 } },
      },
    ])
    expect(readLastUsage(file)).toEqual({ inputTokens: 2, cacheCreationInputTokens: 100, cacheReadInputTokens: 200 })
  })

  it('skips non-assistant entries and entries with no usage', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [
      {
        type: 'assistant',
        message: { usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 200 } },
      },
      { type: 'user', message: { role: 'user', content: 'hi' } },
      { type: 'custom-title' },
    ])
    expect(readLastUsage(file)).toEqual({ inputTokens: 2, cacheCreationInputTokens: 100, cacheReadInputTokens: 200 })
  })

  it('treats missing numeric fields as 0', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [
      { type: 'assistant', message: { usage: { input_tokens: 5 } } },
    ])
    expect(readLastUsage(file)).toEqual({ inputTokens: 5, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 })
  })

  it('returns null when the file does not exist', () => {
    expect(readLastUsage(path.join(dir, 'missing.jsonl'))).toBeNull()
  })

  it('returns null when no entry has usage', () => {
    const file = writeTranscript('proj-a', 'session.jsonl', [{ type: 'user', message: { role: 'user', content: 'hi' } }])
    expect(readLastUsage(file)).toBeNull()
  })
})

describe('formatModelDisplayName', () => {
  it('formats a versioned model id into a display name', () => {
    expect(formatModelDisplayName('claude-opus-5')).toBe('Opus 5')
  })

  it('strips a trailing release date', () => {
    expect(formatModelDisplayName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  })

  it('handles a family with no version segment', () => {
    expect(formatModelDisplayName('claude-fable-5')).toBe('Fable 5')
  })
})
