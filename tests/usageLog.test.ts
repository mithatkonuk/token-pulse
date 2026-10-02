import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createUsageLog, formatUsageLogLine, type UsageLogEntry } from '../src/main/usageLog'

describe('formatUsageLogLine', () => {
  it('writes one greppable line per attempt', () => {
    expect(
      formatUsageLogLine({
        at: Date.parse('2026-10-02T11:00:00.000Z'),
        sourceId: 'claude',
        trigger: 'panel-open',
        outcome: 'error',
        durationMs: 20013,
        consecutiveFailures: 3,
        floorMs: 60000,
      })
    ).toBe(
      '2026-10-02T11:00:00.000Z source=claude trigger=panel-open outcome=error durationMs=20013 failures=3 floorMs=60000'
    )
  })

  it('omits fields that do not apply to a skipped attempt', () => {
    expect(
      formatUsageLogLine({
        at: Date.parse('2026-10-02T11:00:00.000Z'),
        sourceId: 'cursor',
        trigger: 'file-activity',
        outcome: 'skipped-in-flight',
        consecutiveFailures: 0,
      })
    ).toBe('2026-10-02T11:00:00.000Z source=cursor trigger=file-activity outcome=skipped-in-flight failures=0')
  })
})

describe('createUsageLog', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-log-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const entry: UsageLogEntry = { at: 0, sourceId: 'claude', trigger: 'scheduled', outcome: 'ok', consecutiveFailures: 0 }

  it('appends to a file it creates on demand', () => {
    const file = path.join(dir, 'nested', 'usage.log')
    const log = createUsageLog(file)
    log(entry)
    log(entry)
    expect(fs.readFileSync(file, 'utf-8').trim().split('\n')).toHaveLength(2)
  })

  it('rotates once the file outgrows its cap so it cannot fill the disk', () => {
    const file = path.join(dir, 'usage.log')
    const log = createUsageLog(file, 120)
    for (let i = 0; i < 6; i += 1) {
      log(entry)
    }
    expect(fs.statSync(file).size).toBeLessThanOrEqual(120)
    expect(fs.existsSync(`${file}.1`)).toBe(true)
  })

  it('overwrites the rotated file rather than accumulating history', () => {
    const file = path.join(dir, 'usage.log')
    const log = createUsageLog(file, 120)
    for (let i = 0; i < 6; i += 1) {
      log(entry)
    }
    const firstRotation = fs.readFileSync(`${file}.1`, 'utf-8')
    for (let i = 0; i < 6; i += 1) {
      log(entry)
    }
    expect(fs.statSync(`${file}.1`).size).toBe(firstRotation.length)
  })

  it('still records an entry wider than the cap rather than losing it', () => {
    const file = path.join(dir, 'usage.log')
    const log = createUsageLog(file, 10)
    log(entry)
    expect(fs.readFileSync(file, 'utf-8').trim()).toBe(formatUsageLogLine(entry))
    expect(fs.existsSync(`${file}.1`)).toBe(false)
  })

  it('never throws when the log cannot be written', () => {
    const log = createUsageLog(path.join(dir, 'usage.log'))
    fs.rmSync(dir, { recursive: true, force: true })
    fs.writeFileSync(dir, 'not a directory')
    expect(() => log(entry)).not.toThrow()
  })
})
