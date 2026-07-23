import { PNG } from 'pngjs'
import { urgencyColorForPercent, type UrgencyColor } from '../shared/urgencyColor'

export const ICON_SIZE = 16

const FILLED_RGBA: Record<UrgencyColor, [number, number, number, number]> = {
  green: [52, 199, 89, 255],
  yellow: [255, 204, 0, 255],
  red: [255, 59, 48, 255],
}

const TRACK_RGBA: [number, number, number, number] = [128, 128, 128, 90]

export function renderUsageBarPng(percentUsed: number, size: number = ICON_SIZE): Buffer {
  const clamped = Math.max(0, Math.min(100, percentUsed))
  const filledRows = Math.round((clamped / 100) * size)
  const filledColor = FILLED_RGBA[urgencyColorForPercent(percentUsed)]
  const png = new PNG({ width: size, height: size })

  for (let y = 0; y < size; y++) {
    const rowFromBottom = size - 1 - y
    const isFilled = rowFromBottom < filledRows
    const [r, g, b, a] = isFilled ? filledColor : TRACK_RGBA
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = a
    }
  }

  return PNG.sync.write(png)
}
