import { useEffect, useState } from 'react'
import { WidgetPanel } from './components/WidgetPanel'
import type { AppState } from './shared/types'
import './App.css'

export default function App() {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    window.ipcRenderer.invoke('usage:get').then((initial) => setState(initial as AppState))
    const listener = (_event: unknown, next: AppState) => setState(next)
    window.ipcRenderer.on('usage:update', listener)
    return () => {
      window.ipcRenderer.off('usage:update', listener)
    }
  }, [])

  return <WidgetPanel state={state} />
}
