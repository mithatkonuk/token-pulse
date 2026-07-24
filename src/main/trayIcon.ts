import { PNG } from 'pngjs'
import { urgencyColorForPercent, type UrgencyColor } from '../shared/urgencyColor'

export const ICON_SIZE = 16

const DARK_BLUE: [number, number, number, number] = [0, 0, 139, 255]
const WHITE: [number, number, number, number] = [255, 255, 255, 255]
const DARK_YELLOW: [number, number, number, number] = [184, 134, 11, 255]
const DARK_RED: [number, number, number, number] = [139, 0, 0, 255]

const TRACK_RGBA: [number, number, number, number] = [128, 128, 128, 90]

function filledRgbaFor(color: UrgencyColor, isSystemDarkMode: boolean): [number, number, number, number] {
  switch (color) {
    case 'blue':
      return isSystemDarkMode ? WHITE : DARK_BLUE
    case 'yellow':
      return DARK_YELLOW
    case 'red':
      return DARK_RED
  }
}

export function renderUsageRingPng(percentUsed: number, size: number = ICON_SIZE, isSystemDarkMode = false): Buffer {
  const clamped = Math.max(0, Math.min(100, percentUsed))
  const filledAngle = (clamped / 100) * 360
  const filledColor = filledRgbaFor(urgencyColorForPercent(percentUsed), isSystemDarkMode)
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
      const [r, g, b, a] = isFilled ? filledColor : TRACK_RGBA
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = a
    }
  }

  return PNG.sync.write(png)
}
