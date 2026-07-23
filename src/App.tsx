import { useEffect, useState } from 'react'
import { WidgetPanel } from './components/WidgetPanel'
import type { UsageState } from './shared/types'
import './App.css'

export default function App() {
  const [state, setState] = useState<UsageState | null>(null)

  useEffect(() => {
    const listener = (_event: unknown, next: UsageState) => setState(next)
    window.ipcRenderer.on('usage:update', listener)
    return () => {
      window.ipcRenderer.off('usage:update', listener)
    }
  }, [])

  return <WidgetPanel state={state} />
}
