/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

describe('component test harness', () => {
  it('renders a component and queries it via testing-library', () => {
    render(<div>hello from jsdom</div>)
    expect(screen.getByText('hello from jsdom')).toBeInTheDocument()
  })
})
