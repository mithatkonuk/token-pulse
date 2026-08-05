import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import { MENU_ICON_SIZE, toggleIconPng, preferencesIconPng, infoIconPng, quitIconPng } from '../src/main/menuIcons'

function isOpaqueAt(png: PNG, x: number, y: number): boolean {
  const idx = (png.width * y + x) << 2
  return png.data[idx + 3] === 255
}

describe('menu icons', () => {
  it.each([
    ['toggleIconPng', toggleIconPng],
    ['preferencesIconPng', preferencesIconPng],
    ['infoIconPng', infoIconPng],
    ['quitIconPng', quitIconPng],
  ])('%s produces a %dx%d PNG with both drawn and transparent pixels', (_name, render) => {
    const png = PNG.sync.read(render())
    expect(png.width).toBe(MENU_ICON_SIZE)
    expect(png.height).toBe(MENU_ICON_SIZE)
    let opaqueCount = 0
    let transparentCount = 0
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (isOpaqueAt(png, x, y)) {
          opaqueCount++
        } else {
          transparentCount++
        }
      }
    }
    expect(opaqueCount).toBeGreaterThan(0)
    expect(transparentCount).toBeGreaterThan(0)
  })

  it('draws the toggle icon as a rectangle outline with a filled titlebar strip', () => {
    const png = PNG.sync.read(toggleIconPng())
    expect(isOpaqueAt(png, 2, 3)).toBe(true) // top-left corner of the frame
    expect(isOpaqueAt(png, 7, 4)).toBe(true) // titlebar fill
    expect(isOpaqueAt(png, 7, 8)).toBe(false) // interior stays empty
  })

  it('draws the info icon as a ring with a dot-and-stem "i" in the center', () => {
    const png = PNG.sync.read(infoIconPng())
    expect(isOpaqueAt(png, 7, 3)).toBe(true) // the dot of the "i"
    expect(isOpaqueAt(png, 7, 8)).toBe(true) // the stem
    expect(isOpaqueAt(png, 1, 1)).toBe(false) // corner, outside the ring
  })

  it('draws the quit icon as a power symbol with a gap at the top for the tick', () => {
    const png = PNG.sync.read(quitIconPng())
    expect(isOpaqueAt(png, 7, 2)).toBe(true) // the tick mark
    expect(isOpaqueAt(png, 7, 14)).toBe(true) // bottom of the ring stays closed
  })
})
