export const MAX_BACKOFF_MS = 60 * 60 * 1000

export function computeBackoffIntervalMs(baseIntervalMs: number, consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return baseIntervalMs
  }
  return Math.min(MAX_BACKOFF_MS, baseIntervalMs * 2 ** consecutiveFailures)
}
