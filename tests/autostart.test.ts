import { describe, it, expect } from 'vitest'
import { buildLinuxAutostartEntry } from '../src/main/autostart'

describe('buildLinuxAutostartEntry', () => {
  it('produces a valid .desktop entry referencing the given executable path', () => {
    const entry = buildLinuxAutostartEntry('/opt/token-pulse/token-pulse')
    expect(entry).toContain('[Desktop Entry]')
    expect(entry).toContain('Exec=/opt/token-pulse/token-pulse')
    expect(entry).toContain('Name=token-pulse')
  })
})
