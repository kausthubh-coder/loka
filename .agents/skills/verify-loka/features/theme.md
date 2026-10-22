# Light and dark

Each space chooses light, dark or the system's setting, and the whole window follows: the sidebar, the command bar,
the space editor, the panels, and (through `setColorScheme`) the browser and the pages it shows. Dark is the night
sky; light is a day sky with white raised rows. Switching to a space in the other scheme crossfades the window.

## Sub-features

- `theme-space`: the scheme is part of the space (`Space.scheme`, migrated to `system` for old saves).
- `theme-editor`: the space editor's "Light or dark" control previews the choice before it's saved.
- `theme-settings`: Settings > Spaces sets it per space too.
- `theme-browser`: every change of the shown space's scheme calls `setColorScheme` once.
- `theme-contrast`: every text in the sidebar reaches 4.5:1 (3:1 for 24 px, or 18.66 px bold) on what's drawn
  behind it, for the 8 space hues (`SPACE_HUES` in `planet.ts`) in both schemes. The three text colors
  (`--loka-ink`, `-ink-2`, `-ink-3`) are `inkCss()` in `prototype/src/app/theme.logic.ts`: a fixed OKLCH lightness
  per scheme and role, tinted by the space's hue, so the contrast barely moves from hue to hue. The space's name on
  the planet is white on a soft shade (`.world-name > span::before` in `loka-sidebar.ts`); the nebula's brightest
  glow sits above the top edge (sky.md).

## How to get to it (user POV)

- Edit a space (its planet's menu, or the command bar's "Edit this space") and pick Light, Dark or System.

## Driving it with loka.mjs

Preconditions: seed data. Build is dark, School light, Home follows the system (Playwright's default is light).

- **Switch.** Ctrl+2 and Ctrl+3: the window's root has `theme-light`; `window.lokaDemo.calls` holds
  `setColorScheme` with `dark`, `light`, `system` in that order.
- **Choose.** Edit Home, pick `Dark` (a `radio`), Save: `state().spaces` has Home's `scheme: "dark"`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs theme`.
- **Contrast.** `node .agents/skills/verify-loka/scripts/run.mjs contrast` (about 5 minutes). For each hue and
  scheme it gives every space that look in the saved state (Moving stars off, so the stars hold still), and measures
  Build, a hovered row, a row's menu, School (a closed folder's count) and Home (an empty address field, the divider
  high on the sky), and the space's name on each of the 4 planets, a quarter turn at a time. Two window widths: 330
  px, where the sky is about as wide as the sidebar, as it is in the browser's sidebar page, and 1280 px, the
  prototype's own. Each measurement reads every text's color and box, screenshots, hides all text (`color:
  transparent`, so a text-shadow stays as the halo it is), screenshots again, and finds the letters as the pixels
  that changed. Under the rectangle around them it takes the worst background pixel, after a 5x5 median that keeps
  the gradients, nebula, clouds and planet but drops single stars (a star under a light label fails any color; the
  unfiltered ratio is kept as `raw`). It skips `.fav` letters (favicon stand-ins on their own color) and list text
  under the planet's fade. Evidence: `contrast.txt` (the failures, worst per text), `contrast.json` (every box),
  `<width>-<scheme>-<hue>-build|menu|home.png`. It fails on any text below its minimum.
- **Fast guard.** `prototype/src/app/theme.test.ts` checks each ink against the plain sky stops of both schemes
  (read from `skyStyles`) for the 8 hues, the WCAG math, and that the inks match what Chrome draws.
- **In the browser.** `bun run verify -- --ux theme` runs both recipes, verify:browser ('setColorScheme("light")
  reaches pages', 'setColorScheme("dark") reaches pages') and verify:flows `spaces`: "pages in a dark space are
  dark", "and its pages turn light". The browser's sidebar, command bar, menus, new tab, History and Settings use
  the same components and the same `themeTokens` and `skyStyles`, so the inks and the sky are the same CSS there.
  Not checked in the browser: the scheme after a space switch, System, the preview, the crossfade, and contrast
  (no suite measures text against the real sidebar's pixels; its sky is as wide as the sidebar, which the 330 px
  run stands in for).

## Gotchas

- The redraw waits one frame for the crossfade to capture the old look; the save and the call to the browser don't.
  Wait for what's on screen (`waitFor`) rather than counting it at once.
- Colors are role tokens in `prototype/src/app/theme.ts`; a component that hard-codes a color looks wrong in one of
  the two themes.
- Text sits on a sky, not a flat color, and the sky's HSL stops make a green or yellow space's sky brighter than a
  blue one's. Change an ink's lightness in `INK` (theme.logic.ts), not in theme.ts, and rerun the contrast recipe:
  the tightest texts are `-ink-3` (Clear, folder counts, the empty address field) at about 4.6:1 and the planet's
  name at about 4.8:1.
- The prototype's sky spans its whole window; the browser's spans the sidebar only. The nebula's glows are placed in
  percent, so they land behind different text at the two widths: measure at both.
