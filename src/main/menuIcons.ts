// Each icon below is a base64-encoded 16x16 RGBA PNG, rendered directly at target size from
// the SVG source below via an HTML5 canvas (drawImage at 16x16, NOT a downsample from a larger
// render — anti-aliasing at the actual target size gives a cleaner result than resizing).
// tests/menuIcons.test.ts's isOpaqueAt treats a pixel as "opaque" at alpha > 127 (real ink,
// allowing genuine anti-aliased edges) rather than requiring alpha === 255 everywhere — that
// binary threshold is what previously forced every stroke to 3.3 (24-unit units) just to
// guarantee a fully-opaque pixel, which is thicker than these icons need.
//
// toggle:
// <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
//   <rect x="3" y="4" width="18" height="16" rx="2" stroke="black" stroke-width="2.2"/>
//   <line x1="3" y1="9.5" x2="21" y2="9.5" stroke="black" stroke-width="2.2"/>
// </svg>
//
// preferences:
// <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
//   <line x1="3" y1="5.5" x2="21" y2="5.5" stroke="black" stroke-width="2.2" stroke-linecap="round"/>
//   <circle cx="15" cy="5.5" r="3" fill="black"/>
//   <line x1="3" y1="12" x2="21" y2="12" stroke="black" stroke-width="2.2" stroke-linecap="round"/>
//   <circle cx="9" cy="12" r="3" fill="black"/>
//   <line x1="3" y1="18.5" x2="21" y2="18.5" stroke="black" stroke-width="2.2" stroke-linecap="round"/>
//   <circle cx="17" cy="18.5" r="3" fill="black"/>
// </svg>
//
// info:
// <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
//   <circle cx="12" cy="12" r="9" stroke="black" stroke-width="3.3"/>
//   <circle cx="12" cy="7.6" r="1.7" fill="black"/>
//   <line x1="12" y1="11.2" x2="12" y2="16.8" stroke="black" stroke-width="3.3" stroke-linecap="round"/>
// </svg>
//
// quit:
// <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
//   <path d="M18.36 6.64a9 9 0 1 1-12.73 0" stroke="black" stroke-width="3.3" stroke-linecap="round"/>
//   <line x1="12" y1="2.2" x2="12" y2="11" stroke="black" stroke-width="3.3" stroke-linecap="round"/>
// </svg>
export const MENU_ICON_SIZE = 16

const TOGGLE_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAsUlEQVR4AaySsQkCQRQFFxsQDUwEc1OL0h4swB60GxuwCEMDxdjEmZNdWKN36LFv4T7zBo5/k/Lj8y2Y4UsC9jlVsOH1Su5hZO2UKthTvJFdGFk7TTCl+CCnMLJ2moBeWXJtw8iClk6wZnIMIwvaC85M5mFkQXvBi4nflkQWvBcMg7FXXePYXuP/Jnii9BdO1yhrp63xgGBB0jXK2mmCC+UVSdcoa6cJ6A4nWaHMAHu9AQAA//+4/p6nAAAABklEQVQDAD8lTCEwCRfFAAAAAElFTkSuQmCC'
const PREFERENCES_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABFElEQVR4AaSSu05CQRRFb2y01cbe3m8wFrY2am1MjH6DxkQSEvgGHgmEkkBBCwU/QU9BaCigBSrWvplzgGQGSCB7zd1zXswduMjO/Jw64InvETz2tTvgmlSMJvF+QN5qCGWZDRiwmyd4J26Stzr1+IASFd8JJsRN8lanHh8wpKKa4IF4LSBvderxAeRdH7hlQH6M/wrIY7eyOygT0juJOv4yIK9YDPVET0Dv6bIT/NCi31l84lcBecViqCd6ggbNVwF5bK4/1ja8gMtO8EjELir27JEvwht0oADq8RP8Eqgc4Jncrv7ZqMcH6B1vCKbQP5B0rinrLajHB7DPFiwpWuTu4RXuYAa57A7yzZFlRL4La3BtAAAA///5JpgsAAAABklEQVQDAJG0SyEuLT3zAAAAAElFTkSuQmCC'
const INFO_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABRElEQVR4AZySoU5DURBEbzAoQBWB4D9AgiBBoBFgESgS0BDQkKAQWBAEicCBhI/gD6gCUd1zNruvTdO0SZud3Xkzu/tub7vUZn962IIyPaYt2KL1CfyB34RcTQ9pFJMLLrG+wBFYBRVyNT17Sm/jCzSu0/mkHoLNhFyNx2aPvfJugUfTULwj7YJX8JOQq+khxRJnugWnqsC3XFCNFdJyQg5tevbIY6a+woEKeAQV/5D7hBwaUT0x4wJ/Ji9J10uyig3SWUIOjageZ3ouCHXR5II+w3XEbfi8qB5n+i5w4M0ETsC8qJ6YqQUPObVDvQXGwJQormePcszUgm+UK2Cckz7AHthPyNX0kJq9znT/A8Ubkgal+ZYXyHtCrsZjDNsrb3WCeCBpeEnPcC+JEiFX07MnRNPkAjWPdgxZA+sJuZoe0iiGAAAA//+EEPD+AAAABklEQVQDAPhEPEsQ3pHdAAAAAElFTkSuQmCC'
const QUIT_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA8UlEQVR4AXyS4REBMRSEQxmaQRO0wi/8oReKQDNmFGHGfrnbiLu8u3l7edndbJJjnqafveSdENZUwEKrzsJFoNcwrqmAsbvBDANW8hyFqEZ6HcDCu1YuhagOEgBetSk5AAIB8skrwKnn8XKaEtDzCQNhng/HhwigIRFSAvIENsCn4tmkTH0FE/XuL5FbYSO8hWE1r5DJynlVfxPC8gn+7hW6O8Gb5DUO8L0QQWdtv/298q/lANIAS/gvtELg0PDgzd/LAZA+BT1GgAnQA0LQi7cOIHUm1SJmjgvoJSV7GBNPHcAcsONaDUEAMyMckPSrLwAAAP//0TPP7gAAAAZJREFUAwBxkyngfvjXrQAAAABJRU5ErkJggg=='

export function toggleIconPng(): Buffer {
  return Buffer.from(TOGGLE_ICON_BASE64, 'base64')
}

export function preferencesIconPng(): Buffer {
  return Buffer.from(PREFERENCES_ICON_BASE64, 'base64')
}

export function infoIconPng(): Buffer {
  return Buffer.from(INFO_ICON_BASE64, 'base64')
}

export function quitIconPng(): Buffer {
  return Buffer.from(QUIT_ICON_BASE64, 'base64')
}
