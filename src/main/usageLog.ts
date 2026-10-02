import fs from 'node:fs'
import path from 'node:path'

// Every `/usage` attempt used to fail silently — a null result and a bare catch — which made a
// frozen panel indistinguishable from numbers that simply hadn't moved. One line per attempt is
// enough to tell those apart after the fact.
const DEFAULT_MAX_BYTES = 256 * 1024

export type UsageLogOutcome = 'ok' | 'empty' | 'error' | 'skipped-in-flight' | 'skipped-floor'

export type UsageLogTrigger =
  | 'startup'
  | 'scheduled'
  | 'panel-open'
  | 'source-switch'
  | 'file-activity'
  | 'wake'
  | 'reset-boundary'

export interface UsageLogEntry {
  at: number
  sourceId: string
  trigger: UsageLogTrigger
  outcome: UsageLogOutcome
  consecutiveFailures: number
  durationMs?: number
  floorMs?: number
}

export function formatUsageLogLine(entry: UsageLogEntry): string {
  const fields = [
    new Date(entry.at).toISOString(),
    `source=${entry.sourceId}`,
    `trigger=${entry.trigger}`,
    `outcome=${entry.outcome}`,
  ]
  if (entry.durationMs !== undefined) {
    fields.push(`durationMs=${entry.durationMs}`)
  }
  fields.push(`failures=${entry.consecutiveFailures}`)
  if (entry.floorMs !== undefined) {
    fields.push(`floorMs=${entry.floorMs}`)
  }
  return fields.join(' ')
}

function rotateIfFull(filePath: string, maxBytes: number, nextLineBytes: number): void {
  const size = fs.statSync(filePath, { throwIfNoEntry: false })?.size ?? 0
  // A line wider than the whole cap has nothing to rotate away from — renaming a file that was
  // never created would throw, and the entry we came here to write would be lost.
  if (size === 0 || size + nextLineBytes <= maxBytes) {
    return
  }
  fs.renameSync(filePath, `${filePath}.1`)
}

export function createUsageLog(filePath: string, maxBytes: number = DEFAULT_MAX_BYTES): (entry: UsageLogEntry) => void {
  // This runs on every attempt and every skip, so the directory walk happens once rather than
  // several times a minute on the main process during an active session.
  let dirReady = false
  return (entry) => {
    try {
      const line = `${formatUsageLogLine(entry)}\n`
      if (!dirReady) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        dirReady = true
      }
      rotateIfFull(filePath, maxBytes, Buffer.byteLength(line))
      fs.appendFileSync(filePath, line)
    } catch {
      // Diagnostics must never take the widget down with them.
    }
  }
}
