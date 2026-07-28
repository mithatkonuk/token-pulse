import { useEffect, useRef, useState } from 'react'
import type { SourceDescriptor } from '../shared/types'
import { ChevronDownIcon } from './icons'

export function SourceSelector({
  sources,
  activeSourceId,
  activeSourceLabel,
  currentModel,
  onSelect,
}: {
  sources: SourceDescriptor[]
  activeSourceId: string
  activeSourceLabel: string
  currentModel: string | null
  onSelect: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (sources.length <= 1) {
    return (
      <span>
        {currentModel ?? 'No recent activity'}
        {currentModel && (
          <span
            className="widget-panel__model-qualifier"
            title="The model that most recently produced output in any Claude session on this machine — not necessarily the one selected in the window you're looking at."
          >
            last active
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="source-selector" ref={containerRef}>
      <button className="source-selector__trigger" onClick={() => setIsOpen((open) => !open)}>
        {activeSourceLabel}
        <ChevronDownIcon />
      </button>
      {isOpen && (
        <div className="source-selector__menu" role="menu">
          {sources.map((source) => (
            <button
              key={source.id}
              role="menuitem"
              className={`source-selector__item${source.id === activeSourceId ? ' is-active' : ''}`}
              onClick={() => {
                onSelect(source.id)
                setIsOpen(false)
              }}
            >
              {source.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
