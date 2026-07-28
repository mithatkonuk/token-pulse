/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SourceSelector } from '../src/components/SourceSelector'

afterEach(() => {
  cleanup()
})

const TWO_SOURCES = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
]

describe('SourceSelector', () => {
  it('renders plain text with no button when there is only one source', () => {
    render(
      <SourceSelector
        sources={[{ id: 'claude', label: 'Claude Code' }]}
        activeSourceId="claude"
        activeSourceLabel="Claude Code"
        currentModel="Sonnet 5"
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('Sonnet 5')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens a menu listing every source when there is more than one', () => {
    render(
      <SourceSelector
        sources={TWO_SOURCES}
        activeSourceId="claude"
        activeSourceLabel="Claude Code"
        currentModel="Sonnet 5"
        onSelect={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('menuitem', { name: 'Claude Code' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cursor' })).toBeInTheDocument()
  })

  it('calls onSelect and closes the menu when a source is clicked', () => {
    const onSelect = vi.fn()
    render(
      <SourceSelector
        sources={TWO_SOURCES}
        activeSourceId="claude"
        activeSourceLabel="Claude Code"
        currentModel="Sonnet 5"
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cursor' }))
    expect(onSelect).toHaveBeenCalledWith('cursor')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu when Escape is pressed', () => {
    render(
      <SourceSelector
        sources={TWO_SOURCES}
        activeSourceId="claude"
        activeSourceLabel="Claude Code"
        currentModel="Sonnet 5"
        onSelect={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu when clicking outside it', () => {
    render(
      <div>
        <SourceSelector
          sources={TWO_SOURCES}
          activeSourceId="claude"
          activeSourceLabel="Claude Code"
          currentModel="Sonnet 5"
          onSelect={() => {}}
        />
        <div data-testid="outside">outside</div>
      </div>
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
