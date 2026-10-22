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
- `theme-contrast-pages`: the same 4.5:1 on everything else Loka draws text on: Settings, the space editor, the
  Library (Spaces, Archived tabs, History, Downloads), the command bar (embedded and the browser's floating page), the
  sidebar's Downloads, Archived tabs, Search and Extensions panels, the download toast, the prototype's empty page,
  and the longest space name on the planet. The fixes it took: an extension's badge text is white or black,
  whichever reads better on the extension's color (`badgeInk` in `extensions.logic.ts`, white on GitHub's green was
  3.2:1); dark selected text is `--loka-text-selection` (the accent at 25%, not 35%, which put the command bar's
  completion at 4.0:1 in green and teal spaces); the chosen archive filter's count is `--loka-ink-2`; the planet's
  name stays on one line between the + and Downloads buttons and ends in "…" (a long one ran over the buttons onto
  the bright sky, 1.3:1 in light), and its shade starts a pixel higher.

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
  under the planet's fade, and text on disabled controls (WCAG exempts them). A text field's value, or its
  placeholder when empty, and a select's shown option count as text. Evidence: `contrast.txt` (a table of measured
  and failing texts per surface and scheme, then the failures, worst per text), `contrast.json` (every box),
  `<width>-<scheme>-<hue>-build|menu|home.png`. It fails on any text below its minimum.
- **Contrast on the other surfaces.** `node .agents/skills/verify-loka/scripts/run.mjs contrast-pages` (about 20
  minutes; `CONTRAST_HUES=90,210` limits the hues while iterating). The same measurement, for each hue and scheme,
  on: Settings a screen at a time to its end, the space editor opened from Settings > Spaces > Edit, the Library's
  four sections (three screens each; three archived tabs, one from a deleted space, put in the saved state), all
  with the sidebar hidden so the page spans the 1280 px window as the browser's tab does; the command bar empty and
  with "lit" typed (a completion selected), beside the sidebar and without it, and with `layout="page"` set, the
  browser's floating window; the sidebar's four panels (`only` their own elements) and the download toast (set as
  `followDownloads` sets it, so it doesn't leave mid-measure) at 330 and 1280 px; Home's empty page; and a
  31-letter name (the editor's limit is 32) on each planet, a quarter turn at a time at the default 300 px sidebar
  and once at 220 px. Evidence: `contrast.txt`, `contrast.json`, and a picture per surface, scheme and hue
  (`settings-<scheme>-<hue>.png`, `library-<section>-...`, `command-bar-sidebar|full|floating-...`,
  `<panel>-panel-<width>-...`, `toast-...`, `long-name-<sidebar width>-...`).
- **Fast guard.** `prototype/src/app/theme.test.ts` checks each ink against the plain sky stops of both schemes
  (read from `skyStyles`) for the 8 hues, the WCAG math, `parseRgb`, and that the inks match what Chrome draws;
  `extensions.test.ts` checks that a badge's text keeps 4.5:1 on every color.
- **In the browser.** `bun run verify -- --ux theme` runs the three recipes, verify:browser ('setColorScheme("light")
  reaches pages', 'setColorScheme("dark") reaches pages') and verify:flows `spaces`: "pages in a dark space are
  dark", "and its pages turn light". The browser's sidebar, command bar, menus, new tab, History and Settings use
  the same components and the same `themeTokens` and `skyStyles`, so the inks and the sky are the same CSS there.
  Not checked in the browser: the scheme after a space switch, System, the preview, the crossfade, and contrast
  (no suite measures text against the real sidebar's or pages' pixels; the sidebar's sky is as wide as the
  sidebar, which the 330 px run stands in for, and a page's as wide as the page, which the hidden sidebar stands
  in for).
- **Not measured anywhere.** The browser's empty tab (`webui/src/newtab.ts`) draws only the sky, no text. Sync's
  settings (`loka-sync-settings`) are never shown yet (nothing passes `sync` to `<loka-settings>`) and hard-code
  dark colors. Onboarding is Helium's Svelte page in the Chromium tree. The Settings and Library layouts under 720
  and 820 px, menus opened from the pages, the extension popup stand-in, and confirm dialogs (Clear archive, Clear
  history) aren't opened by the recipe.

## Gotchas

- The redraw waits one frame for the crossfade to capture the old look; the save and the call to the browser don't.
  Wait for what's on screen (`waitFor`) rather than counting it at once.
- Colors are role tokens in `prototype/src/app/theme.ts`; a component that hard-codes a color looks wrong in one of
  the two themes.
- Text sits on a sky, not a flat color, and the sky's HSL stops make a green or yellow space's sky brighter than a
  blue one's. Change an ink's lightness in `INK` (theme.logic.ts), not in theme.ts, and rerun the contrast recipe:
  the tightest texts are `-ink-3` (Clear, folder counts, the empty address field) at about 4.6:1 and the planet's
  name at about 4.8:1.
- Text on a color the user or a site picks (an extension's badge) can't use the inks: choose white or black by
  contrast (`badgeInk`). Text drawn while selected uses the selection's background: measure with the caret
  collapsed (`End`) unless the selection is what's shown, as with the command bar's completion.
- The prototype's sky spans its whole window; the browser's spans the sidebar only. The nebula's glows are placed in
  percent, so they land behind different text at the two widths: measure at both.
