import { PNG } from 'pngjs'
import { urgencyColorForPercent, type UrgencyColor } from '../shared/urgencyColor'

export const ICON_SIZE = 16

const FILLED_RGBA: Record<UrgencyColor, [number, number, number, number]> = {
  green: [52, 199, 89, 255],
  yellow: [255, 204, 0, 255],
  red: [255, 59, 48, 255],
}

const TRACK_RGBA: [number, number, number, number] = [128, 128, 128, 90]

export function renderUsageRingPng(percentUsed: number, size: number = ICON_SIZE): Buffer {
  const clamped = Math.max(0, Math.min(100, percentUsed))
  const filledAngle = (clamped / 100) * 360
  const filledColor = FILLED_RGBA[urgencyColorForPercent(percentUsed)]
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
