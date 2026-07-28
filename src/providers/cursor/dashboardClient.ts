import { decodeProtoFields, getVarintNumber, getString, getSubmessage } from './protobuf'

export interface CursorPeriodUsage {
  billingCycleEndMs: number
  totalSpendCents: number
  limitCents: number
  limitType: string | null
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
