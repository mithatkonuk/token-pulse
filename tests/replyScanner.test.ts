import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ReplyScanner, weighUsage } from '../src/providers/claude-code/replyScanner'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-pulse-reply-scanner-test-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const USAGE = { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 100 }

function reply(
  requestId: string,
  usage: Record<string, number> = USAGE,
  model = 'claude-sonnet-5-5',
  timestamp = new Date().toISOString(),
  entrypoint = 'claude-vscode'
): string {
  return JSON.stringify({ type: 'assistant', requestId, timestamp, entrypoint, message: { id: `msg-${requestId}`, model, usage } }) + '\n'
}

function transcriptPath(...parts: string[]): string {
  const file = path.join(dir, ...parts)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  return file
}

describe('weighUsage', () => {
  it('weighs output more than input', () => {
    const input = weighUsage('claude-sonnet-5-5', { input_tokens: 1000 })
    const output = weighUsage('claude-sonnet-5-5', { output_tokens: 1000 })
    expect(output).toBeGreaterThan(input)
  })

  it('weighs opus more than haiku', () => {
    expect(weighUsage('claude-opus-5-5', USAGE)).toBeGreaterThan(weighUsage('claude-haiku-5-5', USAGE))
  })

  it('weighs cache reads less than new input', () => {
    expect(weighUsage('claude-sonnet-5-5', { cache_read_input_tokens: 1000 })).toBeLessThan(
      weighUsage('claude-sonnet-5-5', { input_tokens: 1000 })
    )
  })
})

describe('ReplyScanner', () => {
  it('counts a reply in a new file', () => {
    const scanner = new ReplyScanner(dir)
    scanner.prime()
    const file = transcriptPath('project', 'session.jsonl')
    fs.writeFileSync(file, reply('a'))
    expect(scanner.readFile(file)).toBeCloseTo(weighUsage('claude-sonnet-5-5', USAGE))
  })

  it('skips replies written before prime', () => {
    const file = transcriptPath('project', 'session.jsonl')
    fs.writeFileSync(file, reply('old'))
    const scanner = new ReplyScanner(dir)
    scanner.prime()
    fs.appendFileSync(file, reply('new'))
    expect(scanner.readFile(file)).toBeCloseTo(weighUsage('claude-sonnet-5-5', USAGE))
  })

  it('counts a repeated reply once', () => {
    const scanner = new ReplyScanner(dir)
    scanner.prime()
    const file = transcriptPath('project', 'session.jsonl')
    fs.writeFileSync(file, reply('a') + reply('a'))
    const first = scanner.readFile(file)
    fs.appendFileSync(file, reply('a'))
    expect(first).toBeCloseTo(weighUsage('claude-sonnet-5-5', USAGE))
    expect(scanner.readFile(file)).toBe(0)
  })

  it('counts only the growth when a repeated reply has more output', () => {
    const scanner = new ReplyScanner(dir)
    scanner.prime()
    const file = transcriptPath('project', 'session.jsonl')
    fs.writeFileSync(file, reply('a', { output_tokens: 100 }))
    scanner.readFile(file)
    fs.appendFileSync(file, reply('a', { output_tokens: 300 }))
    expect(scanner.readFile(file)).toBeCloseTo(weighUsage('claude-sonnet-5-5', { output_tokens: 200 }))
  })

  it('waits for a partly written line', () => {
    const scanner = new ReplyScanner(dir)
    scanner.prime()
    const file = transcriptPath('project', 'session.jsonl')
    const line = reply('a')
    fs.writeFileSync(file, line.slice(0, 20))
    expect(scanner.readFile(file)).toBe(0)
    fs.appendFileSync(file, line.slice(20))
    expect(scanner.readFile(file)).toBeCloseTo(weighUsage('claude-sonnet-5-5', USAGE))
  })

  it('counts subagent transcripts in nested folders', () => {
    const file = transcriptPath('project', 'session', 'subagents', 'agent-1.jsonl')
    fs.writeFileSync(file, reply('old'))
    const scanner = new ReplyScanner(dir)
    scanner.prime()
    fs.appendFileSync(file, reply('new'))
    expect(scanner.readFile(file)).toBeCloseTo(weighUsage('claude-sonnet-5-5', USAGE))
  })

  it('skips old replies that a resumed session copies', () => {
    const scanner = new ReplyScanner(dir)
    scanner.prime()
    const file = transcriptPath('project', 'resumed.jsonl')
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    fs.writeFileSync(file, reply('old', USAGE, 'claude-sonnet-5-5', hourAgo) + reply('new'))
    expect(scanner.readFile(file)).toBeCloseTo(weighUsage('claude-sonnet-5-5', USAGE))
  })

  it('counts only replies from accepted apps', () => {
    const scanner = new ReplyScanner(dir, (entrypoint) => entrypoint === 'claude-desktop')
    scanner.prime()
    const file = transcriptPath('project', 'session.jsonl')
    const now = new Date().toISOString()
    fs.writeFileSync(file, reply('ext') + reply('desk', USAGE, 'claude-sonnet-5-5', now, 'claude-desktop'))
    expect(scanner.readFile(file)).toBeCloseTo(weighUsage('claude-sonnet-5-5', USAGE))
  })

  it('ignores lines that are not assistant replies', () => {
    const scanner = new ReplyScanner(dir)
    scanner.prime()
    const file = transcriptPath('project', 'session.jsonl')
    fs.writeFileSync(file, JSON.stringify({ type: 'user', message: { content: 'hi' } }) + '\nnot json\n')
    expect(scanner.readFile(file)).toBe(0)
  })

  it('ignores files that are not transcripts', () => {
    const scanner = new ReplyScanner(dir)
    scanner.prime()
    const file = transcriptPath('project', 'notes.txt')
    fs.writeFileSync(file, reply('a'))
    expect(scanner.readFile(file)).toBe(0)
  })
})
