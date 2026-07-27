import { PNG } from 'pngjs'
import { urgencyColorForPercent, type UrgencyColor } from '../shared/urgencyColor'

export const ICON_SIZE = 16

const NEAR_WHITE: [number, number, number, number] = [235, 235, 235, 255]
const NEAR_WHITE_TRACK: [number, number, number, number] = [235, 235, 235, 90]
const NEAR_BLACK: [number, number, number, number] = [35, 35, 35, 255]
const NEAR_BLACK_TRACK: [number, number, number, number] = [35, 35, 35, 90]
const DARK_ORANGE: [number, number, number, number] = [255, 140, 0, 255]
const DARK_RED: [number, number, number, number] = [139, 0, 0, 255]

function trackRgbaFor(isDarkMode: boolean): [number, number, number, number] {
  return isDarkMode ? NEAR_WHITE_TRACK : NEAR_BLACK_TRACK
}

function filledRgbaFor(color: UrgencyColor, isDarkMode: boolean): [number, number, number, number] {
  switch (color) {
    case 'blue':
      return isDarkMode ? NEAR_WHITE : NEAR_BLACK
    case 'orange':
      return DARK_ORANGE
    case 'red':
      return DARK_RED
  }
}

export function renderUsageRingPng(percentUsed: number, size: number = ICON_SIZE, isDarkMode = false): Buffer {
  const clamped = Math.max(0, Math.min(100, percentUsed))
  const filledAngle = (clamped / 100) * 360
  const filledColor = filledRgbaFor(urgencyColorForPercent(percentUsed), isDarkMode)
  const trackColor = trackRgbaFor(isDarkMode)
  const png = new PNG({ width: size, height: size })
  const center = (size - 1) / 2
  const outerRadius = size / 2
  const thickness = Math.max(2, size / 6)
  const innerRadius = outerRadius - thickness

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center
      const dy = y - center
      const dist = Math.sqrt(dx * dx + dy * dy)
      const idx = (size * y + x) << 2
      if (dist > outerRadius || dist < innerRadius) {
        png.data[idx + 3] = 0
        continue
      }
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI
      if (angle < 0) {
        angle += 360
      }
      const isFilled = angle < filledAngle
      const [r, g, b, a] = isFilled ? filledColor : trackColor
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = a
    }
  }

  return PNG.sync.write(png)
}
