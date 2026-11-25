import { describe, it, expect } from 'vitest'
import { dropEndedWindow, keepHigherInSameWindow, resetWindow } from '../src/main/windowMerge'
import type { UsageWindow } from '../src/shared/types'

function fiveHour(percentUsed: number, resetsText: string | null = 'Nov 24 at 3pm (Europe/Berlin)'): UsageWindow {
  return { id: 'five_hour', label: 'Every 5 hours', percentUsed, resetsText }
}

describe('keepHigherInSameWindow', () => {
  it('keeps the higher value in the same window', () => {
    expect(keepHigherInSameWindow([fiveHour(80)], [fiveHour(46)])).toEqual([fiveHour(80)])
  })

  it('takes a higher incoming value', () => {
    expect(keepHigherInSameWindow([fiveHour(46)], [fiveHour(80)])).toEqual([fiveHour(80)])
  })

  it('takes a lower value from a new window', () => {
    const next = fiveHour(3, 'Nov 24 at 8pm (Europe/Berlin)')
    expect(keepHigherInSameWindow([fiveHour(80)], [next])).toEqual([next])
  })

  it('takes the incoming windows when none are shown', () => {
    expect(keepHigherInSameWindow([], [fiveHour(46)])).toEqual([fiveHour(46)])
  })
})

describe('resetWindow', () => {
  it('sets the window to zero with no reset time', () => {
    const weekly: UsageWindow = { id: 'weekly', label: 'Weekly', percentUsed: 30, resetsText: 'Nov 29 at 9am (Europe/Berlin)' }
    expect(resetWindow([fiveHour(80), weekly], 'five_hour')).toEqual([fiveHour(0, null), weekly])
  })
})

describe('dropEndedWindow', () => {
  const ended = 'Nov 24 at 3pm (Europe/Berlin)'

  it('shows zero for old data of a window that ended', () => {
    expect(dropEndedWindow([fiveHour(87, ended)], ended)).toEqual([fiveHour(0, null)])
  })

  it('keeps a new window', () => {
    const next = fiveHour(2, 'Nov 24 at 8pm (Europe/Berlin)')
    expect(dropEndedWindow([next], ended)).toEqual([next])
  })

  it('changes nothing when no window ended', () => {
    expect(dropEndedWindow([fiveHour(87, ended)], null)).toEqual([fiveHour(87, ended)])
  })
})
