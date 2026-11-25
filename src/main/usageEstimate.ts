// Between two real usage fetches, the 5h percentage is estimated from the cost of new local
// replies. The rate (percent for each cost unit) comes from earlier fetches. The estimate does not
// see usage from claude.ai or from other machines, so the next real fetch corrects it.

// The endpoint gives whole percents. A rate from a 1% step is mostly rounding noise.
const MIN_CALIBRATION_STEP = 3
// The weight of a new sample in the smoothed rate.
const SMOOTHING = 0.3

interface Point {
  percent: number
  resetsText: string | null
  cost: number
}

export interface EstimateState {
  // The last confirmed value. The estimate starts from it.
  base: Point | null
  // The start of the current rate sample.
  anchor: Point | null
  rate: number | null
}

export const EMPTY_ESTIMATE: EstimateState = { base: null, anchor: null, rate: null }

export function recordConfirmed(
  state: EstimateState,
  confirmed: { percent: number; resetsText: string | null },
  totalCost: number
): EstimateState {
  const base: Point = { ...confirmed, cost: totalCost }
  const { anchor, rate } = state
  if (anchor === null || anchor.resetsText !== base.resetsText || base.percent < anchor.percent) {
    return { base, anchor: base, rate }
  }
  const step = base.percent - anchor.percent
  const spent = base.cost - anchor.cost
  // No local cost explains this step, so it came from claude.ai or another machine. A sample
  // that includes it gives a rate that is much too high.
  if (spent <= 0) {
    return { base, anchor: base, rate }
  }
  if (step < MIN_CALIBRATION_STEP) {
    return { base, anchor, rate }
  }
  const sample = step / spent
  return { base, anchor: base, rate: rate === null ? sample : rate * (1 - SMOOTHING) + sample * SMOOTHING }
}

// Returns null when there is no estimate that is higher than the confirmed value.
export function estimatePercent(state: EstimateState, totalCost: number): number | null {
  const { base, rate } = state
  if (base === null || rate === null) {
    return null
  }
  const estimate = Math.min(100, Math.round(base.percent + rate * (totalCost - base.cost)))
  return estimate > base.percent ? estimate : null
}
