import fs from 'node:fs'
import path from 'node:path'

// How much of the end of a transcript we scan for the newest assistant entry. Lines can be
// very large (tool results, pasted content), so this is generous — if no complete entry turns
// up inside it we report null and let the caller fall back.
const TAIL_BYTES = 256 * 1024

// Only a full versioned id ("claude-opus-5", "claude-haiku-4-5-20251001") names a real model.
// Transcripts also carry "<synthetic>" placeholders and bare aliases like "sonnet".
const VERSIONED_MODEL_ID = /^claude-[a-z]+-\d[\d-]*$/

interface TranscriptEntry {
  isSidechain?: unknown
  message?: { model?: unknown }
}

export function findNewestTranscript(projectsDir: string): string | null {
  let newestFile: string | null = null
  let newestMtimeMs = -Infinity
  let projects: fs.Dirent[]
  try {
    projects = fs.readdirSync(projectsDir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const project of projects) {
    if (!project.isDirectory()) {
      continue
    }
    const dir = path.join(projectsDir, project.name)
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) {
        continue
      }
      const file = path.join(dir, entry)
      try {
        const { mtimeMs } = fs.statSync(file)
        if (mtimeMs > newestMtimeMs) {
          newestMtimeMs = mtimeMs
          newestFile = file
        }
      } catch {
        // Vanished between readdir and stat — ignore it.
      }
    }
  }
  return newestFile
}

function readTail(file: string): string | null {
  let fd: number
  try {
    fd = fs.openSync(file, 'r')
  } catch {
    return null
  }
  try {
    const { size } = fs.fstatSync(fd)
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    fs.readSync(fd, buffer, 0, length, size - length)
    return buffer.toString('utf-8')
  } catch {
    return null
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Walks back from the end of a transcript for the model of the newest main-thread assistant
 * entry. Sidechain (subagent) entries are skipped — they can run a different model than the
 * one the user picked for the session.
 */
export function readLastModelId(file: string): string | null {
  const tail = readTail(file)
  if (tail === null) {
    return null
  }
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('{')) {
      continue
    }
    let entry: TranscriptEntry
    try {
      entry = JSON.parse(line) as TranscriptEntry
    } catch {
      continue // Truncated by the tail read, or a partially flushed write.
    }
    if (entry.isSidechain === true) {
      continue
    }
    const model = entry.message?.model
    if (typeof model === 'string' && VERSIONED_MODEL_ID.test(model)) {
      return model
    }
  }
  return null
}

export function formatModelDisplayName(id: string): string {
  const tokens = id.replace(/^claude-/, '').split('-')
  const family = tokens[0]
  // A trailing release date ("20251001") is not part of the display name.
  const version = tokens
    .slice(1)
    .filter((token) => /^\d{1,2}$/.test(token))
    .join('.')
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return version ? `${name} ${version}` : name
}
