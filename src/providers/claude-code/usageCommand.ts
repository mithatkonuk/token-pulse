import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ContributingStats, TopEntry } from '../../shared/types'

const USAGE_COMMAND_TIMEOUT_MS = 20_000

// GUI-launched apps (a double-clicked .app, not something run from a terminal) get macOS's
// bare launchd PATH, which excludes Homebrew and other common install locations — so a plain
// `claude` lookup that works fine under `npm run dev` fails silently once packaged. Prepending
// these covers the common cases without needing to know the exact binary path per platform.
function buildAugmentedPath(): string {
  const home = os.homedir()
  const extraDirs = ['/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.local', 'bin')]
  return [...extraDirs, process.env.PATH ?? ''].filter(Boolean).join(path.delimiter)
}

export function resolveExecutableOnPath(name: string, pathString: string): string | null {
  for (const dir of pathString.split(path.delimiter)) {
    if (!dir) {
      continue
    }
    const candidate = path.join(dir, name)
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      // Not here — keep looking.
    }
  }
  return null
}

export function isClaudeCliAvailable(): boolean {
  return resolveExecutableOnPath('claude', buildAugmentedPath()) !== null
}

export interface UsageWindowResult {
  percentUsed: number
  resetsText: string
}

export interface UsageCommandResult {
  fiveHour: UsageWindowResult | null
  weekly: UsageWindowResult | null
  last24h: ContributingStats | null
  last7d: ContributingStats | null
}

// `claude -p` starts a brand-new session every call, which writes a transcript file under
// projectsDir as a side effect. We pin the session ID ourselves so we know exactly which file
// that is, and delete it once we've read the output — otherwise it accumulates forever on a
// recurring poll.
function deleteSessionTranscript(projectsDir: string, sessionId: string): void {
  let projects: string[]
  try {
    projects = fs.readdirSync(projectsDir)
  } catch {
    return
  }
  for (const project of projects) {
    try {
      fs.unlinkSync(path.join(projectsDir, project, `${sessionId}.jsonl`))
      return
    } catch {
      // Not this project directory — keep looking.
    }
  }
}

export function runUsageCommand(cwd: string, projectsDir: string): Promise<string | null> {
  const sessionId = randomUUID()
  return new Promise((resolve) => {
    execFile(
      'claude',
      ['-p', '/usage', '--session-id', sessionId, '--mcp-config', '{"mcpServers":{}}', '--strict-mcp-config'],
      {
        cwd,
        timeout: USAGE_COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PATH: buildAugmentedPath() },
      },
      (error, stdout) => {
        deleteSessionTranscript(projectsDir, sessionId)
        resolve(error ? null : stdout)
      }
    )
  })
}

function extractBlock(text: string, startMarker: string, endMarker: string | null): string | null {
  const startIdx = text.indexOf(startMarker)
  if (startIdx === -1) {
    return null
  }
  const endIdx = endMarker ? text.indexOf(endMarker, startIdx + startMarker.length) : -1
  return endIdx === -1 ? text.slice(startIdx) : text.slice(startIdx, endIdx)
}

function parseTopList(text: string): TopEntry[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.+?)\s+(\d+)%$/)
      return match ? { name: match[1], percent: Number(match[2]) } : null
    })
    .filter((entry): entry is TopEntry => entry !== null)
}

function parseContributingBlock(block: string): ContributingStats {
  const header = block.match(/Last (?:24h|7d)\s*·\s*(\d+) requests\s*·\s*(\d+) sessions/)
  const contextMatch = block.match(/(\d+)% of your usage was at >150k context/)
  const skillsMatch = block.match(/Top skills:\s*(.+)/)
  const subagentsMatch = block.match(/Top subagents:\s*(.+)/)
  const pluginsMatch = block.match(/Top plugins:\s*(.+)/)
  const mcpMatch = block.match(/Top MCP servers:\s*(.+)/)
  return {
    requests: header ? Number(header[1]) : 0,
    sessions: header ? Number(header[2]) : 0,
    aboveContextPercent: contextMatch ? Number(contextMatch[1]) : null,
    topSkills: skillsMatch ? parseTopList(skillsMatch[1]) : [],
    topSubagents: subagentsMatch ? parseTopList(subagentsMatch[1]) : [],
    topPlugins: pluginsMatch ? parseTopList(pluginsMatch[1]) : [],
    topMcpServers: mcpMatch ? parseTopList(mcpMatch[1]) : [],
  }
}

export function parseUsageOutput(text: string): UsageCommandResult {
  const fiveHourMatch = text.match(/Current session:\s*(\d+)%\s*used\s*·\s*resets\s+(.+)/)
  const weeklyMatch = text.match(/Current week \(all models\):\s*(\d+)%\s*used\s*·\s*resets\s+(.+)/)

  const last24hBlock = extractBlock(text, 'Last 24h', 'Last 7d')
  const last7dBlock = extractBlock(text, 'Last 7d', null)

  return {
    fiveHour: fiveHourMatch ? { percentUsed: Number(fiveHourMatch[1]), resetsText: fiveHourMatch[2].trim() } : null,
    weekly: weeklyMatch ? { percentUsed: Number(weeklyMatch[1]), resetsText: weeklyMatch[2].trim() } : null,
    last24h: last24hBlock ? parseContributingBlock(last24hBlock) : null,
    last7d: last7dBlock ? parseContributingBlock(last7dBlock) : null,
  }
}
