export interface TurnRow {
  timestamp: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export const CACHE_READ_WEIGHT = 0

export function tokensForTurn(turn: TurnRow): number {
  return turn.inputTokens + turn.outputTokens + turn.cacheCreationTokens + turn.cacheReadTokens * CACHE_READ_WEIGHT
}

export interface WindowResult {
  usedTokens: number
  resetsAt: Date
}

export function computeWindow(turns: TurnRow[], windowMs: number, now: Date): WindowResult {
  const windowStart = now.getTime() - windowMs
  const inWindow = turns.filter((t) => new Date(t.timestamp).getTime() >= windowStart)
  if (inWindow.length === 0) {
    return { usedTokens: 0, resetsAt: now }
  }
  const usedTokens = inWindow.reduce((sum, t) => sum + tokensForTurn(t), 0)
  const oldestMs = inWindow.reduce(
    (oldest, t) => Math.min(oldest, new Date(t.timestamp).getTime()),
    new Date(inWindow[0].timestamp).getTime()
  )
  return { usedTokens, resetsAt: new Date(oldestMs + windowMs) }
}
