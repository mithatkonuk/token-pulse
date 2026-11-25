import fs from 'node:fs'
import path from 'node:path'

// The plan limits use cost, not raw tokens. These weights copy the relative API prices: output
// costs 5 times input, a cache write 1.25 times, and a cache read 0.1 times. A larger model
// costs more. The result is a cost unit for the usage estimate, not a real price.
const OUTPUT_WEIGHT = 5
const CACHE_WRITE_WEIGHT = 1.25
const CACHE_READ_WEIGHT = 0.1
const MODEL_WEIGHTS: Record<string, number> = { opus: 5, sonnet: 3, haiku: 1 }
const DEFAULT_MODEL_WEIGHT = 3

// Remembered reply ids. Claude Code writes one reply on many lines, near each other. Thus a
// small window of recent ids is sufficient to count each reply once.
const MAX_REMEMBERED_REPLIES = 5000
// A reply that started just before prime() can have an earlier timestamp. This margin still counts it.
const START_MARGIN_MS = 60 * 1000

function modelWeight(model: unknown): number {
  const family = typeof model === 'string' ? model.replace(/^claude-/, '').split('-')[0] : ''
  return MODEL_WEIGHTS[family] ?? DEFAULT_MODEL_WEIGHT
}

function tokens(usage: Record<string, unknown>, key: string): number {
  const value = usage[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function weighUsage(model: unknown, usage: Record<string, unknown>): number {
  const inputCost =
    tokens(usage, 'input_tokens') +
    CACHE_WRITE_WEIGHT * tokens(usage, 'cache_creation_input_tokens') +
    CACHE_READ_WEIGHT * tokens(usage, 'cache_read_input_tokens') +
    OUTPUT_WEIGHT * tokens(usage, 'output_tokens')
  return modelWeight(model) * inputCost
}

interface Reply {
  key: string
  cost: number
}

// Tells if a reply from this app (the `entrypoint` field, for example `claude-desktop`) is counted.
export type EntrypointFilter = (entrypoint: string | null) => boolean

function parseReply(line: string, notBefore: number, accepts: EntrypointFilter): Reply | null {
  let entry: unknown
  try {
    entry = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof entry !== 'object' || entry === null) {
    return null
  }
  const e = entry as {
    type?: unknown
    requestId?: unknown
    timestamp?: unknown
    entrypoint?: unknown
    message?: { id?: unknown; model?: unknown; usage?: unknown }
  }
  const usage = e.message?.usage
  if (e.type !== 'assistant' || typeof usage !== 'object' || usage === null) {
    return null
  }
  if (!accepts(typeof e.entrypoint === 'string' ? e.entrypoint : null)) {
    return null
  }
  // A resumed session copies the old replies into a new file. Their timestamps are old, so they
  // are not counted again.
  const at = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN
  if (!(at >= notBefore)) {
    return null
  }
  const key = typeof e.requestId === 'string' ? e.requestId : typeof e.message?.id === 'string' ? e.message.id : null
  return key === null ? null : { key, cost: weighUsage(e.message?.model, usage as Record<string, unknown>) }
}

// Reads only the new lines of Claude Code transcripts and adds up the cost of new replies. It
// reads the files and never changes them.
export class ReplyScanner {
  private readonly offsets = new Map<string, number>()
  private readonly costs = new Map<string, number>()
  private notBefore = Date.now() - START_MARGIN_MS

  constructor(
    private readonly projectsDir: string,
    private readonly accepts: EntrypointFilter = () => true
  ) {}

  // Starts each existing transcript at its current end, so that old replies are not counted.
  prime(): void {
    this.notBefore = Date.now() - START_MARGIN_MS
    for (const file of this.listTranscripts(this.projectsDir)) {
      try {
        this.offsets.set(file, fs.statSync(file).size)
      } catch {
        // The file was removed after the directory read.
      }
    }
  }

  // Returns the cost of the new replies in this file since the last read.
  readFile(file: string): number {
    if (!file.endsWith('.jsonl')) {
      return 0
    }
    const text = this.readNewText(file)
    if (text === null) {
      return 0
    }
    let total = 0
    for (const line of text.split('\n')) {
      const reply = parseReply(line, this.notBefore, this.accepts)
      if (reply !== null) {
        total += this.addReply(reply)
      }
    }
    return total
  }

  private addReply({ key, cost }: Reply): number {
    const known = this.costs.get(key) ?? 0
    if (cost <= known) {
      return 0
    }
    this.costs.delete(key)
    this.costs.set(key, cost)
    if (this.costs.size > MAX_REMEMBERED_REPLIES) {
      const oldest = this.costs.keys().next().value
      if (oldest !== undefined) {
        this.costs.delete(oldest)
      }
    }
    return cost - known
  }

  // Reads the complete lines after the last offset. A partly written last line stays for the next read.
  private readNewText(file: string): string | null {
    let fd: number
    try {
      fd = fs.openSync(file, 'r')
    } catch {
      return null
    }
    try {
      const { size } = fs.fstatSync(fd)
      let offset = this.offsets.get(file) ?? 0
      if (size < offset) {
        offset = 0
      }
      if (size === offset) {
        return null
      }
      const buffer = Buffer.alloc(size - offset)
      fs.readSync(fd, buffer, 0, buffer.length, offset)
      const lastNewline = buffer.lastIndexOf(0x0a)
      if (lastNewline === -1) {
        this.offsets.set(file, offset)
        return null
      }
      this.offsets.set(file, offset + lastNewline + 1)
      return buffer.subarray(0, lastNewline).toString('utf-8')
    } catch {
      return null
    } finally {
      fs.closeSync(fd)
    }
  }

  private listTranscripts(dir: string): string[] {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    return entries.flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return this.listTranscripts(full)
      }
      return entry.name.endsWith('.jsonl') ? [full] : []
    })
  }
}
