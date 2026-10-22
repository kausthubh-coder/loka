# Moving stars

The sidebar's sky drifts: three star layers at different speeds, the nebula breathing, a shooting star now and then.
Settings > Appearance > Moving stars picks when: `While I'm using Loka` (the default) drifts and stops 15 s after the
last pointer, key or wheel input in the window; `Always` never stops while the window shows; `Off` stays still. Every
mode holds still while the window is hidden or minimised, and with reduced motion. Skies that cover a whole tab (new
tab, History, Settings) never move.

## Sub-features

- `sky-rule`: `starsMoving()` in `prototype/src/app/sky.logic.ts` decides from the mode, time since input, visibility
  and reduced motion; unit tested in `sky.test.ts`.
- `sky-play`: `setStarMotion()` in `sky.ts` writes `--loka-sky-play` (running or paused) and
  `--loka-sky-will-change` (transform while moving, else auto) on the page's root; each sky animation names
  `--loka-sky-play` in its shorthand. `--loka-play` (the planet's turn, the equaliser, the download sweep) keeps the
  default rule whatever the setting.
- `sky-setting`: the `Moving stars` radiogroup saves `starMotion` in the prefs (`ui.v1` in the profile in the real
  browser, shared by every window); the sidebar follows on its next render.
- `sky-still-pages`: `skyLayer(hue, scheme, "still")` on the new tab, History and Settings, and on the sidebar with
  Off: no drift animation, so no compositor layers for it.
- `sky-text`: the sidebar's text stays readable on the sky (theme.md's `theme-contrast`). The nebula's brightest
  glow is centred above the top edge (`at 10% -4%` in `.nebula`), so it lights the top row and fades out before the
  address field; the fainter glows stay behind the list.

## How to get to it (user POV)

- `...` > Settings > Appearance; the Settings rail's `Appearance` row; search Settings for "stars" or "motion".

## Driving it with loka.mjs

Preconditions: seed data.

- **Rule in the page.** Install Playwright's fake clock and reload, then read `--loka-sky-play` on the root and the
  near star layer's drift animation (`.sky .stars.near` in `loka-app`'s shadow root, `getAnimations()[0].playState`).
  Fast-forward 14 s (still running), 1.5 s more (paused), move the mouse (running).
- **Modes.** Off: paused with no drift animation, and a mouse move doesn't start it. Always: running after a minute
  with no input.
- **Hidden and reduced motion.** Redefine `document.visibilityState` and fire `visibilitychange`; `emulateMedia({
  reducedMotion: "reduce" })` removes the drift entirely.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs sky`.
- **Text on the sky.** `node .agents/skills/verify-loka/scripts/run.mjs contrast` measures every sidebar text
  against the pixels behind it, nebula, clouds and planet included, for the 8 hues in both schemes, at a window as
  wide as the browser's sidebar sky (330 px) and at 1280 px. theme.md says how. It holds the stars still (Moving
  stars Off) and the nebula where it starts breathing (full opacity, its brightest); a 5x5 median drops single stars.
- **In the browser.** `bun run verify -- --ux sky` runs both recipes and verify:flows `settings`: "Moving stars: Always saves
  and the sidebar's stars are running", "Moving stars: Off saves and the sidebar's stars are paused", "Moving stars:
  While I'm using Loka saves". Its cost: `bun run verify:perf -- --stars=<mode>` (idle CPU and GPU per mode;
  `sky.runningAtStart` and `sky.runningAtEnd` count the sky's running animations). The browser's pages draw the same
  `skyLayer()` and `skyStyles`, so the nebula's place is the same CSS there. Not checked in the browser: the 15 s
  rest, a hidden or minimised window, reduced motion, that the still pages stay still, and text contrast on the real
  sidebar's sky.

## Gotchas

- The `animation` shorthand resets `animation-play-state`. A separate play-state rule loses to a more specific
  shorthand rule, which is how the old idle rest left the star drift and shooting stars running; keep the play state
  inside each shorthand.
- Running or paused, an animation keeps its compositor layer (CDP `LayerTree`: the prototype's window held 19 drawing
  layers, about 8.4 M px, moving and resting alike; 6 layers, 1.1 M px, with no sky animation). Resting saves the
  frames, not the GPU memory; only Off and the still pages give the memory back.
- The nebula's glows are placed in percent of the sky. The browser's sidebar sky is as narrow as the sidebar, so a
  glow that sits beside the list in the prototype's wide window sits behind it there. Moving a glow means rerunning
  the contrast recipe, which looks at both widths.
- CDP input to another page (Settings) is not input to the sidebar: in the flows the sidebar may already rest under
  the default mode, so only Always and Off have a fixed expected state.
