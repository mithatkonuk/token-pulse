import type { UsageWindow } from '../shared/types'

// Usage in one window only goes up until the window resets. A lower value with the same reset time
// is old data: for example, a statusline cache from an idle terminal session. Thus it does not
// replace a higher value.
export function keepHigherInSameWindow(current: UsageWindow[], incoming: UsageWindow[]): UsageWindow[] {
  return incoming.map((window) => {
    const shown = current.find((w) => w.id === window.id)
    const sameWindow = shown !== undefined && shown.resetsText !== null && shown.resetsText === window.resetsText
    return sameWindow && shown.percentUsed > window.percentUsed ? { ...window, percentUsed: shown.percentUsed } : window
  })
}

// At its reset time a window starts again at zero. The next fetch gives the new reset time.
export function resetWindow(windows: UsageWindow[], id: string): UsageWindow[] {
  return windows.map((w) => (w.id === id ? { ...w, percentUsed: 0, resetsText: null } : w))
}

// For some seconds after a reset, the backend can still send the window that ended. That data is
// old, so the window shows zero until the new window arrives.
export function dropEndedWindow(windows: UsageWindow[], endedResetsText: string | null): UsageWindow[] {
  if (endedResetsText === null) {
    return windows
  }
  return windows.map((w) =>
    w.id === 'five_hour' && w.resetsText === endedResetsText ? { ...w, percentUsed: 0, resetsText: null } : w
  )
}
