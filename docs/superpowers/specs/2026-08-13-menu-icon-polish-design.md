# Menu icon polish

## Problem

The tray's dropdown menu (Toggle / Preferences / Info / Quit) uses hand-drawn
16×16 pixel bitmaps built from raw rectangle/circle-fill loops in
`src/main/menuIcons.ts` — no anti-aliasing, no curves, blocky primitives.
Next to macOS's crisp native menu iconography this reads as amateur.

## Scope

The 4 dropdown-menu glyphs only (`toggleIconPng`, `preferencesIconPng`,
`infoIconPng`, `quitIconPng`). The tray-bar usage-ring icon
(`src/main/trayIcon.ts`) is a live data visualization, a different concern,
and explicitly out of scope for this pass.

## Design

**Icon concepts (unchanged):** Toggle = window with a titlebar. Preferences
= three horizontal sliders. Info = circle with an "i". Quit = power symbol
(broken ring + tick). These already communicate the right thing; the
problem is execution quality, not the choice of glyph.

**Style:** Monoline/outline icons (~1.5px consistent stroke, rounded
caps/joins) instead of solid black fills — matches how macOS's own system
icons read at small sizes, and reads far more polished than solid blocks at
16px.

**Output contract (unchanged):** Each function still returns a `Buffer`
containing a 16×16 PNG. `electron/tray.ts` needs zero changes — it already
imports these four functions by name and wraps them in `templateIcon()` for
macOS auto-tinting; that continues to work identically since template-image
tinting only cares about the alpha channel of a black-on-transparent image,
which anti-aliased line art still provides.

**Pipeline (one-time, no new dependency):** Hand-author clean SVG source for
each icon, render at high resolution through the Browser pane (Chromium's
SVG rendering gives genuine anti-aliasing), downsample to a crisp 16×16 PNG
with macOS's built-in `sips` tool (high-quality resampling), then embed the
resulting PNG bytes as base64 constants directly in `menuIcons.ts`. No new
npm dependency, nothing added to `package.json` — this is a build-time-only
authoring step, not a runtime rasterization pipeline. The packaged app ships
a small embedded byte buffer either way (previously computed at runtime,
now a constant); size impact is negligible (a handful of small PNGs).

**Dead code removal:** `fillPixel`, `fillRect`, `strokeRect`, `strokeCircle`,
`blankCanvas` become unused once nothing calls them and are deleted.
`MENU_ICON_SIZE` stays (still used by the test and to document the
contract), now just describing rather than driving the icon geometry.

**Testing:** `tests/menuIcons.test.ts` has two kinds of assertions. The
parameterized "produces a 16×16 PNG with both drawn and transparent pixels"
check (one case per icon) needs no changes — it holds for any valid icon,
old or new. But three of the four icons (toggle, info, quit — not
preferences) also have a dedicated test asserting exact pixel coordinates
against the *current* hand-drawn geometry (e.g. "titlebar fill at (7,4)",
"info dot at (7,3)", "tick mark at (7,2)"). These are tightly coupled to
today's specific pixel layout and will not hold against the new icons'
actual ink placement. Each gets updated — after the new icons exist, read
their real opaque pixels and pick new coordinates that verify the same
semantic property the original test checked (e.g. "the top region has ink,
the interior stays empty" for toggle) — preserving intent, not deleting
coverage.

## Out of scope

- The tray-bar usage-ring icon (`trayIcon.ts`).
- Any change to `electron/tray.ts`, `menu` construction, or icon
  tinting/template-image behavior.
- Retina/@2x variants — the app currently ships single 16×16 icons with no
  @2x convention anywhere in the codebase; introducing one would be a
  larger, unrequested change. High-quality downsampling at authoring time
  keeps the single 16×16 output looking crisp regardless.
