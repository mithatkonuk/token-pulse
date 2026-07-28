// Static, hand-maintained per-model context window sizes. Not queryable for free: Claude Code's
// `/usage` never invokes a model turn (so `--output-format json`'s modelUsage.<model>.contextWindow
// is always empty for it), and getting that value any other way means spending a real, paid,
// rate-limit-consuming model turn just to read a constant — not something a background usage
// poller should ever do. Sourced from https://platform.claude.com/docs/en/about-claude/models/overview
// (fetched 2026-07-28); update this table when Anthropic ships a model that isn't in it yet.
const CONTEXT_WINDOW_SIZES: Record<string, number> = {
  'claude-fable-5': 1_000_000,
  'claude-mythos-5': 1_000_000,
  'claude-mythos-preview': 1_000_000,
  'claude-opus-5': 1_000_000,
  'claude-sonnet-5': 1_000_000,
  'claude-haiku-4-5-20251001': 200_000,
  'claude-opus-4-8': 1_000_000,
  'claude-opus-4-7': 1_000_000,
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-sonnet-4-5-20250929': 200_000,
  'claude-opus-4-5-20251101': 200_000,
  'claude-opus-4-1-20250805': 200_000,
}

// 1M is the modal value across current models, and what this table would otherwise default to
// for any model it lists at all — a reasonable fallback for an id it doesn't recognize yet.
const DEFAULT_CONTEXT_WINDOW_SIZE = 1_000_000

export function getContextWindowSizeForModel(modelId: string | null): number {
  if (modelId === null) {
    return DEFAULT_CONTEXT_WINDOW_SIZE
  }
  return CONTEXT_WINDOW_SIZES[modelId] ?? DEFAULT_CONTEXT_WINDOW_SIZE
}
