import { PNG } from 'pngjs'

export const MENU_ICON_SIZE = 16

const BLACK: [number, number, number, number] = [0, 0, 0, 255]

function blankCanvas(): PNG {
  return new PNG({ width: MENU_ICON_SIZE, height: MENU_ICON_SIZE })
}

function fillPixel(png: PNG, x: number, y: number): void {
  if (x < 0 || x >= MENU_ICON_SIZE || y < 0 || y >= MENU_ICON_SIZE) {
    return
  }
  const idx = (MENU_ICON_SIZE * y + x) << 2
  png.data[idx] = BLACK[0]
  png.data[idx + 1] = BLACK[1]
  png.data[idx + 2] = BLACK[2]
  png.data[idx + 3] = BLACK[3]
}

function fillRect(png: PNG, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      fillPixel(png, x, y)
    }
  }
}

function strokeRect(png: PNG, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = x0; x <= x1; x++) {
    fillPixel(png, x, y0)
    fillPixel(png, x, y1)
  }
  for (let y = y0; y <= y1; y++) {
    fillPixel(png, x0, y)
    fillPixel(png, x1, y)
  }
}

// Ring of pixels between innerRadius and outerRadius, optionally skipping a wedge (in degrees,
// measured clockwise from the top) — used by the power icon to leave a gap for its tick mark.
function strokeCircle(
  png: PNG,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  gap?: { fromDeg: number; toDeg: number }
): void {
  for (let y = 0; y < MENU_ICON_SIZE; y++) {
    for (let x = 0; x < MENU_ICON_SIZE; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > outerRadius || dist < innerRadius) {
        continue
      }
      if (gap) {
        let angle = (Math.atan2(dx, -dy) * 180) / Math.PI
        if (angle < 0) {
          angle += 360
        }
        // fromDeg > toDeg means the gap wraps through 0° (e.g. 340°..20°, spanning the top).
        const inGap = gap.fromDeg <= gap.toDeg ? angle >= gap.fromDeg && angle <= gap.toDeg : angle >= gap.fromDeg || angle <= gap.toDeg
        if (inGap) {
          continue
        }
      }
      fillPixel(png, x, y)
    }
  }
}

// Three sliders, à la a classic "settings" glyph — deliberately not a literal gear, which
// doesn't read as anything recognizable at 16px when hand-drawn from rectangles.
export function preferencesIconPng(): Buffer {
  const png = blankCanvas()
  fillRect(png, 2, 3, 13, 3)
  fillRect(png, 2, 8, 13, 8)
  fillRect(png, 2, 13, 13, 13)
  fillRect(png, 9, 1, 11, 5)
  fillRect(png, 4, 6, 6, 10)
  fillRect(png, 10, 11, 12, 15)
  return PNG.sync.write(png)
}

export function infoIconPng(): Buffer {
  const png = blankCanvas()
  strokeCircle(png, 7.5, 7.5, 7, 5.5)
  fillRect(png, 7, 3, 8, 4)
  fillRect(png, 7, 6, 8, 11)
  return PNG.sync.write(png)
}

// A window with a filled titlebar — represents opening/closing the popup.
export function toggleIconPng(): Buffer {
  const png = blankCanvas()
  strokeRect(png, 2, 3, 13, 12)
  fillRect(png, 3, 4, 12, 5)
  return PNG.sync.write(png)
}

// Standard power symbol: a broken ring with a tick through the gap.
export function quitIconPng(): Buffer {
  const png = blankCanvas()
  strokeCircle(png, 7.5, 8.5, 6, 4.5, { fromDeg: 340, toDeg: 20 })
  fillRect(png, 7, 2, 8, 8)
  return PNG.sync.write(png)
}
