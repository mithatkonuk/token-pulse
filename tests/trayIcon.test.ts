import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import { renderUsageBarPng } from '../src/main/trayIcon'

function pixelAt(png: PNG, x: number, y: number): [number, number, number, number] {
  const idx = (png.width * y + x) << 2
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]]
}

describe('renderUsageBarPng', () => {
  it('produces a PNG of the requested size', () => {
    const png = PNG.sync.read(renderUsageBarPng(50, 10))
    expect(png.width).toBe(10)
    expect(png.height).toBe(10)
  })

  it('fills bottom rows up to the percentage and leaves the rest as track color', () => {
    const png = PNG.sync.read(renderUsageBarPng(50, 10))
    expect(pixelAt(png, 0, 9)).toEqual([52, 199, 89, 255])
    expect(pixelAt(png, 0, 0)).toEqual([128, 128, 128, 90])
  })

  it('uses red fill color at 90% or above', () => {
    const png = PNG.sync.read(renderUsageBarPng(95, 10))
    expect(pixelAt(png, 0, 9)).toEqual([255, 59, 48, 255])
  })

  it('clamps values above 100 to a fully filled bar', () => {
    const png = PNG.sync.read(renderUsageBarPng(250, 10))
    expect(pixelAt(png, 0, 0)).toEqual([255, 59, 48, 255])
  })
})
