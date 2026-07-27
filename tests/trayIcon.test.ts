import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import { renderUsageRingPng } from '../src/main/trayIcon'

function pixelAt(png: PNG, x: number, y: number): [number, number, number, number] {
  const idx = (png.width * y + x) << 2
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]]
}

describe('renderUsageRingPng', () => {
  it('produces a PNG of the requested size', () => {
    const png = PNG.sync.read(renderUsageRingPng(50, 20))
    expect(png.width).toBe(20)
    expect(png.height).toBe(20)
  })

  it('is transparent at the center and outside the ring', () => {
    const png = PNG.sync.read(renderUsageRingPng(50, 20))
    expect(pixelAt(png, 10, 10)).toEqual([0, 0, 0, 0])
    expect(pixelAt(png, 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('in light mode, fills clockwise with near-black up to the percentage, leaving the rest as a faint near-black track', () => {
    const png = PNG.sync.read(renderUsageRingPng(50, 20))
    expect(pixelAt(png, 10, 1)).toEqual([35, 35, 35, 255])
    expect(pixelAt(png, 9, 1)).toEqual([35, 35, 35, 90])
    expect(pixelAt(png, 10, 18)).toEqual([35, 35, 35, 255])
  })

  it('in dark mode, fills clockwise with near-white up to the percentage, leaving the rest as a faint near-white track', () => {
    const png = PNG.sync.read(renderUsageRingPng(50, 20, true))
    expect(pixelAt(png, 10, 1)).toEqual([235, 235, 235, 255])
    expect(pixelAt(png, 9, 1)).toEqual([235, 235, 235, 90])
  })

  it('leaves the ring entirely track-colored at 0%', () => {
    const png = PNG.sync.read(renderUsageRingPng(0, 20))
    expect(pixelAt(png, 10, 1)).toEqual([35, 35, 35, 90])
  })

  it('fills the entire ring at 100%', () => {
    const png = PNG.sync.read(renderUsageRingPng(100, 20))
    expect(pixelAt(png, 10, 18)).toEqual([139, 0, 0, 255])
  })

  it('uses red fill color at 90% or above', () => {
    const png = PNG.sync.read(renderUsageRingPng(95, 20))
    expect(pixelAt(png, 10, 1)).toEqual([139, 0, 0, 255])
  })

  it('keeps the red fill at 90%+ regardless of dark mode', () => {
    const png = PNG.sync.read(renderUsageRingPng(95, 20, true))
    expect(pixelAt(png, 10, 1)).toEqual([139, 0, 0, 255])
  })
})
