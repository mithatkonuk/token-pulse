import { decodeProtoFields, getVarintNumber, getString, getSubmessage, getFloat, getRepeatedSubmessages } from './protobuf'

export interface CursorPeriodUsage {
  billingCycleEndMs: number
  totalSpendCents: number
  limitCents: number
  limitType: string | null
}

export interface CursorUsageEvent {
  timestampMs: number
  model: string
  totalTokens: number
  costCents: number | null
}

const DASHBOARD_BASE_URL = 'https://api2.cursor.sh/aiserver.v1.DashboardService'

// Field mapping verified against a live response cross-checked with the equivalent
// JSON API response — see docs/superpowers/specs/2026-07-28-cursor-usage-source-design.md.
// Top-level: field 2 = billingCycleEnd (ms), field 3 = planUsage submessage,
// field 4 = spendLimitUsage submessage.
// planUsage: field 1 = totalSpend (cents), field 5 = limit (cents).
// spendLimitUsage: field 8 = limitType ("team", etc).
export function decodeGetCurrentPeriodUsageResponse(buf: Buffer): CursorPeriodUsage {
  const top = decodeProtoFields(buf)
  const planUsage = getSubmessage(top, 3)
  const spendLimitUsage = getSubmessage(top, 4)
  return {
    billingCycleEndMs: getVarintNumber(top, 2) ?? 0,
    totalSpendCents: planUsage ? getVarintNumber(planUsage, 1) ?? 0 : 0,
    limitCents: planUsage ? getVarintNumber(planUsage, 5) ?? 0 : 0,
    limitType: spendLimitUsage ? getString(spendLimitUsage, 8) : null,
  }
}

export async function fetchCurrentPeriodUsage(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<CursorPeriodUsage | null> {
  const res = await fetchFn(`${DASHBOARD_BASE_URL}/GetCurrentPeriodUsage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/proto',
      'Connect-Protocol-Version': '1',
    },
  })
  if (!res.ok) {
    return null
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return decodeGetCurrentPeriodUsageResponse(buf)
}

// Field mapping inferred from inspecting a live response (timestamp and model are
// unambiguous; the token/cost fields are a plausible but NOT independently cross-verified
// reading — unlike GetCurrentPeriodUsage above, there's no second reference UI showing the
// same per-request numbers to confirm against). event: field 1 = timestamp (ms),
// field 2 = model display name, field 9 = token submessage (field 1 = input tokens,
// field 2 = output tokens, field 4 = cache-read tokens — summed into totalTokens),
// field 6 = cost in dollars (absent when a request has no associated cost, e.g. included
// in plan with nothing to report).
function decodeUsageEvent(fields: ReturnType<typeof decodeProtoFields>): CursorUsageEvent {
  const tokenFields = getSubmessage(fields, 9)
  const inputTokens = tokenFields ? getVarintNumber(tokenFields, 1) ?? 0 : 0
  const outputTokens = tokenFields ? getVarintNumber(tokenFields, 2) ?? 0 : 0
  const cacheReadTokens = tokenFields ? getVarintNumber(tokenFields, 4) ?? 0 : 0
  const costDollars = getFloat(fields, 6)
  return {
    timestampMs: getVarintNumber(fields, 1) ?? 0,
    model: getString(fields, 2) ?? 'unknown',
    totalTokens: inputTokens + outputTokens + cacheReadTokens,
    costCents: costDollars !== null ? Math.round(costDollars * 100) : null,
  }
}

export function decodeGetFilteredUsageEventsResponse(buf: Buffer): CursorUsageEvent[] {
  const top = decodeProtoFields(buf)
  return getRepeatedSubmessages(top, 3).map(decodeUsageEvent)
}

export async function fetchFilteredUsageEvents(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<CursorUsageEvent[] | null> {
  const res = await fetchFn(`${DASHBOARD_BASE_URL}/GetFilteredUsageEvents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/proto',
      'Connect-Protocol-Version': '1',
    },
  })
  if (!res.ok) {
    return null
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return decodeGetFilteredUsageEventsResponse(buf)
}
