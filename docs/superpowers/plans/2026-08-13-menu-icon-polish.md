# Menu Icon Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 hand-drawn, blocky pixel-fill menu icons in `src/main/menuIcons.ts` with crisp, anti-aliased, monoline-style icons — same concepts, same 16×16 output contract, no new dependency.

**Architecture:** Author clean SVG source for each icon, render it through the Browser pane (real anti-aliasing via Chromium), downsample to 16×16 with macOS's `sips`, embed the resulting PNG bytes as base64 constants in `menuIcons.ts`. `electron/tray.ts` is untouched — the four exported function names and their `Buffer`-of-16×16-PNG contract don't change.

**Tech Stack:** TypeScript, `pngjs` (already a dependency, used only to validate output in tests — not needed for the new icon code itself, which just decodes a base64 constant), Vitest.

## Global Constraints

- Each icon function (`toggleIconPng`, `preferencesIconPng`, `infoIconPng`, `quitIconPng`) must keep returning a `Buffer` containing a 16×16 PNG — `electron/tray.ts` and `MENU_ICON_SIZE` depend on this and must not change.
- No new npm dependency, no change to `package.json`.
- Style: monoline/outline strokes (~1.5–1.8px at the 24×24 authoring grid), rounded caps/joins, black on transparent, not solid fills.
- Scope is exactly these 4 icons. Do not touch `src/main/trayIcon.ts` or `electron/tray.ts`.

---

### Task 1: Author and rasterize the 4 icon assets

**Files:**
- Create (temporary, not committed): a scratch HTML file to render the SVGs for screenshotting, anywhere outside the repo (e.g. the session scratchpad).
- Produces: 4 base64-encoded PNG strings (16×16 each), to be consumed by Task 2.

**Interfaces:**
- Produces: `TOGGLE_ICON_BASE64`, `PREFERENCES_ICON_BASE64`, `INFO_ICON_BASE64`, `QUIT_ICON_BASE64` — four base64 strings (no `data:` URI prefix, just the raw base64 payload), each decoding to a valid 16×16 PNG with a transparent background and black (fully opaque, alpha 255 at stroke centers) ink.

This task is asset authoring, not logic — the exact byte output can't be pre-computed without actually rendering it, so this task is scoped as "follow this process, using this starting SVG source, verify visually, adjust stroke widths/positions as needed for legibility at 16px." That adjustment loop is expected and is the point of doing this via a real renderer instead of guessing pixel coordinates by hand (which is exactly what produced the current amateur result).

- [ ] **Step 1: Write the scratch rendering page**

Create a scratch HTML file (e.g. `/tmp/menu-icon-render.html` or the session scratchpad equivalent) with this content — a 4×1 grid of the icons at 25x their target size (400×400 each) on a white background with a light grid, so anti-aliasing is crisp when rendered and the icons are easy to individually screenshot:

```html
<!doctype html>
<html><head><style>
  body { margin: 0; background: white; display: flex; }
  .cell { width: 400px; height: 400px; display: flex; align-items: center; justify-content: center; border-right: 1px solid #eee; }
  svg { width: 340px; height: 340px; }
</style></head>
<body>
  <div class="cell" id="toggle">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="black" stroke-width="2.2"/>
      <line x1="3" y1="9.5" x2="21" y2="9.5" stroke="black" stroke-width="2.2"/>
    </svg>
  </div>
  <div class="cell" id="preferences">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="3" y1="5.5" x2="21" y2="5.5" stroke="black" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="15" cy="5.5" r="3" fill="black"/>
      <line x1="3" y1="12" x2="21" y2="12" stroke="black" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="9" cy="12" r="3" fill="black"/>
      <line x1="3" y1="18.5" x2="21" y2="18.5" stroke="black" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="17" cy="18.5" r="3" fill="black"/>
    </svg>
  </div>
  <!-- NOTE (2026-08-13 fix wave): these are the FINAL values, superseding the isolated 1.8-stroke
       values Task 1 originally produced (which the icon-generation step then thickened to 3.3 to
       satisfy an alpha===255 test — collapsing these two icons' proportions). See
       src/main/menuIcons.ts's header comment for the authoritative final SVG source for all 4 icons. -->
  <div class="cell" id="info">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.25" stroke="black" stroke-width="1.8"/>
      <circle cx="12" cy="8" r="1.15" fill="black"/>
      <line x1="12" y1="11.5" x2="12" y2="16.5" stroke="black" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  </div>
  <div class="cell" id="quit">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" stroke="black" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="12" y1="2" x2="12" y2="11" stroke="black" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  </div>
</body></html>
```

- [ ] **Step 2: Render and screenshot each icon**

Open the scratch file in the Browser pane (`navigate` to the `file://` path), take a screenshot, and crop/zoom each of the 4 cells individually (each cell is a distinct 400×400 region at x-offsets 0, 400, 800, 1200). Look at each rendered icon at full size: confirm the shape reads clearly as its intended concept (window/sliders/info/power), strokes look clean and not lopsided, nothing is clipped by the viewBox.

If a shape doesn't read well at a glance (this is the point of rendering before finalizing — e.g. the power icon's arc gap might look too wide/narrow, the info dot might look too small), adjust the SVG's numbers directly in the HTML file and re-render until each icon looks clean and intentional. This is a normal part of icon design — don't treat the starting coordinates above as final if they don't look right once actually rendered.

- [ ] **Step 3: Export each icon as a standalone PNG and downsample to 16×16**

For each of the 4 icons, save/export just that icon's rendered region as its own PNG file (e.g. via the Browser pane's screenshot capability targeting just that cell's bounding box, or by creating 4 separate single-icon HTML files at exactly 16×16 CSS size and screenshotting at that size directly — whichever gives a cleaner crop). Then use `sips` to produce a final crisp 16×16 PNG with alpha preserved:

```bash
sips -z 16 16 --setProperty formatOptions best /tmp/toggle-raw.png --out /tmp/toggle-16.png
sips -z 16 16 --setProperty formatOptions best /tmp/preferences-raw.png --out /tmp/preferences-16.png
sips -z 16 16 --setProperty formatOptions best /tmp/info-raw.png --out /tmp/info-16.png
sips -z 16 16 --setProperty formatOptions best /tmp/quit-raw.png --out /tmp/quit-16.png
```

(Exact flags/approach may need adjusting based on what the screenshot tool actually outputs — the goal is: end up with 4 files, each a true 16×16 PNG with a transparent background and anti-aliased black ink, not a naive nearest-neighbor resize of a much larger flat-color image.)

- [ ] **Step 4: Base64-encode each final PNG**

```bash
base64 -i /tmp/toggle-16.png | tr -d '\n'
base64 -i /tmp/preferences-16.png | tr -d '\n'
base64 -i /tmp/info-16.png | tr -d '\n'
base64 -i /tmp/quit-16.png | tr -d '\n'
```

Save these 4 strings — they're the exact input Task 2 needs.

- [ ] **Step 5: Sanity-check each PNG's dimensions before moving on**

```bash
sips -g pixelWidth -g pixelHeight /tmp/toggle-16.png /tmp/preferences-16.png /tmp/info-16.png /tmp/quit-16.png
```
Expected: all four report `pixelWidth: 16` / `pixelHeight: 16`.

No commit for this task — it produces no repo changes, only the 4 base64 strings carried into Task 2.

---

### Task 2: Replace the pixel-drawing implementation and update tests

**Files:**
- Modify: `src/main/menuIcons.ts`
- Modify: `tests/menuIcons.test.ts`

**Interfaces:**
- Consumes: `TOGGLE_ICON_BASE64`, `PREFERENCES_ICON_BASE64`, `INFO_ICON_BASE64`, `QUIT_ICON_BASE64` from Task 1.
- Produces: no change to the public interface — `toggleIconPng(): Buffer`, `preferencesIconPng(): Buffer`, `infoIconPng(): Buffer`, `quitIconPng(): Buffer`, `MENU_ICON_SIZE` all keep their existing names, signatures, and semantics.

- [ ] **Step 1: Replace `src/main/menuIcons.ts`'s contents**

Replace the entire file with (substituting the real base64 strings produced by Task 1 for the four `'<...>'` placeholders — those placeholders are literal, non-negotiable data, not something to leave unfilled):

```ts
export const MENU_ICON_SIZE = 16

const TOGGLE_ICON_BASE64 = '<paste from Task 1>'
const PREFERENCES_ICON_BASE64 = '<paste from Task 1>'
const INFO_ICON_BASE64 = '<paste from Task 1>'
const QUIT_ICON_BASE64 = '<paste from Task 1>'

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
```

This removes `fillPixel`, `fillRect`, `strokeRect`, `strokeCircle`, `blankCanvas`, and the `pngjs` import — none of them are used anymore.

- [ ] **Step 2: Run the parameterized size/opacity test to confirm it still passes unchanged**

Run: `npx vitest run tests/menuIcons.test.ts`
Expected: the `it.each` "produces a 16x16 PNG with both drawn and transparent pixels" cases PASS for all 4 icons (this doesn't depend on icon geometry, only that real ink and real transparency both exist). The 3 geometry-specific tests (toggle, info, quit) will FAIL at this point — expected, since they assert the old pixel coordinates. Confirm they fail for that reason (wrong pixel values at the old coordinates), not for an unrelated reason like a decode error.

- [ ] **Step 3: Determine the new icons' real ink coordinates**

For each of the 3 icons with a geometry test (toggle, info, quit), write a tiny throwaway script (or use a Vitest `it` temporarily, then remove it) that decodes the PNG and prints which pixels are opaque, e.g.:

```ts
import { PNG } from 'pngjs'
import { toggleIconPng } from '../src/main/menuIcons'
const png = PNG.sync.read(toggleIconPng())
for (let y = 0; y < 16; y++) {
  let row = ''
  for (let x = 0; x < 16; x++) {
    const idx = (16 * y + x) << 2
    row += png.data[idx + 3] === 255 ? '#' : '.'
  }
  console.log(row)
}
```
Run this (e.g. via `npx tsx` or a scratch Vitest test with a `console.log`, then `npx vitest run <file> --reporter=verbose` to see the output) for each of the 3 icons. Use the printed grid to pick 2-3 solid-ink coordinates and 1 solidly-empty coordinate per icon — the same semantic properties the original tests checked (a frame/top edge is inked, an interior/corner stays empty, a specific recognizable feature like the info dot or the power tick has ink).

- [ ] **Step 4: Update the 3 geometry tests with the new coordinates**

Edit `tests/menuIcons.test.ts`, replacing the coordinate literals (and their comments) in these three tests to match what Step 3 found — keep the test names, keep the semantic intent (e.g. "top-left corner of the frame", "titlebar fill", "interior stays empty" for toggle; "the dot of the i", "the stem", "corner, outside the ring" for info; "the tick mark", "bottom of the ring stays closed" for quit) but point at coordinates that are actually true for the new icons. Do not weaken the assertions to something trivial like "has any ink somewhere" — keep them specific to the recognizable feature they're named after.

- [ ] **Step 5: Run the full test file to confirm everything passes**

Run: `npx vitest run tests/menuIcons.test.ts`
Expected: all cases PASS — the parameterized size/opacity test (4 cases) and the 3 updated geometry tests.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite passes (same total count as before, since no tests were added or removed — only 3 existing tests' internals changed), zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/mko/realm/personal/token-pulse
git add src/main/menuIcons.ts tests/menuIcons.test.ts
git commit -m "feat: replace hand-drawn menu icons with anti-aliased monoline icons

The dropdown menu's 4 glyphs (Toggle/Preferences/Info/Quit) were built
from raw pixel-fill loops with no anti-aliasing — blocky next to macOS's
native menu iconography. Replaced with icons authored as SVG, rendered
through a real renderer, and downsampled with high-quality resampling.
Same 16x16 output contract, same exported function names — electron/tray.ts
is unaffected."
```

---

## Self-Review Notes

- **Spec coverage:** Icon concepts unchanged (Task 1's SVGs match Problem/Design section) ✓. Output contract unchanged (Task 2 keeps signatures) ✓. No new dependency (Task 2 removes the `pngjs` import from this file entirely, adds none) ✓. Dead code removed (Task 2 Step 1) ✓. Test updates preserve intent (Task 2 Steps 3-4) ✓. Out-of-scope items (trayIcon.ts, electron/tray.ts, @2x) — not touched by either task ✓.
- **Placeholder scan:** The `'<paste from Task 1>'` placeholders in Task 2 Step 1 are intentional — they're a data handoff between two tasks in the same plan (Task 1's literal output), not a "figure it out later." Everything else is concrete code or exact shell commands.
- **Type consistency:** `toggleIconPng(): Buffer` etc. match `electron/tray.ts`'s existing import and usage (`import { toggleIconPng, preferencesIconPng, infoIconPng, quitIconPng } from '../src/main/menuIcons'`) — unchanged, so no cross-file drift possible.
