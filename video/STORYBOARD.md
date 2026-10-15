---
format: 1920x1080
duration: 42s
message: "loka is a calm, Arc-style browser for Windows where every space is its own world"
arc: Demo Loop (hook → product intro → demo cycles → trust → CTA)
audience: Windows users with too many tabs, Arc users on Windows, people who want a private Chromium browser
mode: autonomous
music: calm ambient night underscore, soft synth pads, slow, no drums
captions: disabled
---

## Video direction

- **Palette system** (from `frame.md`): every frame's ground is the `sky` component, a night gradient tinted by
  the space hue H, with `assets/stars.svg` full-bleed over it. Build H=200 (blue) is the default ground. Frame 3
  is the only frame where H changes (200 → 30 → 150); frame 8 cycles the mark's color once. Ink `#ececf1` for
  headlines, muted `#a7a8b4` for one-line support. The accent of the current space (`accent-build` etc.) is used
  only for the key caps' glow and the final CTA pill.
- **Type**: `frame.md` ramp by role. Headlines `h1`/`h2`, sentence case, five words or fewer. Body at most one
  line. The wordmark only in frame 8. Fonts are Segoe UI Variable via `@font-face { src: local(...) }`; this
  video renders locally on Windows.
- **The product is the picture**: screenshots are framed with the `window` (whole window) or `crop` (feature
  close-up) component, sharp, never stretched; text sits on the sky, never on a screenshot.
- **Motion grammar**: long-tail settles (`power3.out`, `expo.out` for fast arrivals), no bounce, no overshoot.
  Reveal each piece on its beat across the shot, never all at t=0. Hue changes take ~1.2s on the product's curve
  (cubic-bezier(0.2, 0, 0, 1)). Stars stay still; at most a few px of drift across a whole frame.
- **Rhythm**: frames 1, 3 and 8 are the big moves (planet rise, the color switch, the lockup). Frame 7 is the held
  breather (titlecard, one move, then still). Frames 5 and 6 are quick, two-to-three-card beats.
- **Negative list**: no cursor, no browser chrome beyond the screenshot, no invented numbers or logos, no glow
  except the planet glow and key-cap glow, no uppercase tracked labels, no slideshow (front-load then freeze), no
  screensaver (everything floating), no breathing loops, no repeat/yoyo.
- **Keep-out**: all content above y = 900 (captions are off, but keep the bottom band clear).

## Frame 1 — The world rises

- scene: Night sky; Build's ringed planet rises from below the frame edge like the sidebar's horizon; the tagline builds above it
- voiceover: ""
- duration: 4.5s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- type: hook
- persuasion: Visual spectacle into a promise
- beat: curiosity + calm
- blueprint: compose
- asset_candidates: assets/stars.svg — the seeded star field; assets/planet-build.svg — Build's ringed blue planet
- focal: assets/planet-build.svg
- roles: planet-build = cutout · stars = background

narrativeRole: open on the thing nobody else has, a sky and a world, before saying what it is.
keyMessage: every space is its own world.
On-screen text: "Every space" then "is its own world."

Compose: the planet rise is the hook (the sidebar's horizon, made big), and the line builds in two beats over it
onto a still payoff.
Scene 1 (0.0–1.6s): Build sky (H=200) with stars full-bleed; the ringed planet (about 900px wide, centered,
body mostly below the frame) rises from y beyond the bottom edge to show its top third above y≈880, on one long
power3 settle; a soft planet glow blooms behind its rim (`ambient-glow-bloom`). Centered, layered depth: stars,
glow, planet.
Scene 2 (1.6–2.8s): "Every space" enters word by word (`dynamic-content-sequencing`) at the upper third,
centered, `display` type.
Scene 3 (2.8–4.5s): "is its own world." lands as a second line under it on the same per-word reveal; then the
frame holds still. No camera move.

## Frame 2 — Meet loka

- scene: The loka window floats up onto the Build sky under the headline "An Arc-style browser for Windows"
- voiceover: ""
- duration: 5s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-intro.html
- type: product_intro
- persuasion: Show-don't-tell proof
- beat: clarity
- blueprint: device-surface-showcase (Adapt)
- asset_candidates: assets/build.png — the whole window in Build; assets/stars.svg — star field
- focal: assets/build.png
- roles: build = cutout (the window) · stars = background
- handoff_out: window `assets/build.png` at x=400, y=190, width=1120, height=700 (top-left anchored), scale 1, opacity 1, rotateX 0, not moving

narrativeRole: name the category and show the real product at once.
keyMessage: it's an Arc-style browser for Windows, and this is what it looks like.
On-screen text: "An Arc-style browser for Windows"

Adapt: keep device-surface-showcase's floating window held as hero with a 3D tilt-to-flatten arrival; no screen
cycling here (frame 3 does that), so the hold is the payoff.
Scene 1 (0.0–1.4s): Build sky + stars. The window (build.png in the `window` component) rises from 80px lower
with rotateX ~14° tilting to flat and opacity 0→1, settling at x=400, y=190, 1120×700 (`spring-pop-entrance`,
smooth long-tail settle, no overshoot). Centered, ~60% of frame.
Scene 2 (1.4–2.6s): the headline "An Arc-style browser for Windows" reveals word by word above the window,
centered at y≈90 (`dynamic-content-sequencing`), `h2`.
Scene 3 (2.6–5.0s): hold. The window stays exactly at its handoff position; no drift.

## Frame 3 — Every space has its own color

- scene: The window stays pinned while the whole sky and the screenshot change Build → School → Home, a key cap and the space's name marking each switch
- voiceover: ""
- duration: 8s
- transition_in: cut
- status: animated
- src: compositions/frames/03-spaces.html
- type: feature_showcase
- persuasion: Show-don't-tell proof (the signature)
- beat: delight + control
- blueprint: fixed-anchor-cycle (Adapt, sub-shape B: whole-context morph)
- asset_candidates: assets/build.png — window in Build; assets/school.png — window in School; assets/home.png — window in Home; assets/planet-build.svg — Build planet; assets/planet-school.svg — School planet; assets/planet-home.svg — Home planet; assets/stars.svg — star field
- focal: assets/build.png
- roles: build / school / home = cutout (the same window, swapped in place) · planets = supporting (label icons) · stars = background
- handoff_in: window `assets/build.png` at x=400, y=190, width=1120, height=700 (top-left anchored), scale 1, opacity 1, rotateX 0, not moving

narrativeRole: the one thing only loka does. The window never moves; the world around it changes.
keyMessage: each space keeps its own tabs and paints the window its color.
On-screen text: the label slot above the window cycles "Ctrl 1  Build" → "Ctrl 2  School" → "Ctrl 3  Home"; the
final line is "Each space, its own world".

Adapt: keep fixed-anchor-cycle's pinned anchor (the window, which never moves) and the whole-context re-skin
around it (the sky hue changes with the screenshot, `theme-crossfade-morph`); three states instead of a flurry,
steady stepping, resolving on a payoff line.
Scene 1 (0.0–0.8s): exactly frame 2's last state (window pinned at the handoff position on the Build sky). Above
it at y≈90 a label slot appears: a key cap pair "Ctrl" "1" (`key-cap` component) and "Build" with a small Build
planet, revealed with a quick fade-up. Centered.
Scene 2 (0.8–3.2s): at 1.0s the key cap "2" presses (`press-release-spring`, small and quick); the sky
crossfades H 200 → 30 and the screenshot crossfades build.png → school.png in place over ~1.2s
(`theme-crossfade-morph`); the label swaps to "Ctrl 2  School" with the School planet (`discrete-text-sequence`).
Scene 3 (3.2–5.6s): at 3.4s the same move again: key "3", sky 30 → 150, school.png → home.png, label "Ctrl 3
Home" with the Home planet.
Scene 4 (5.6–8.0s): the label slot gives way to the payoff line "Each space, its own world" (`h2`, ink) on a
per-word reveal; the window and the green sky hold still to the end.

## Frame 4 — Folders inside folders

- scene: Start tight on Build's folder tree, then one long zoom-out reveals it inside the sidebar and the window, then the headline
- voiceover: ""
- duration: 4.5s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/04-folders.html
- type: feature_showcase
- persuasion: Feature-to-benefit translation
- beat: order + ease
- blueprint: zoom-out-workspace-reveal (Reproduce)
- asset_candidates: assets/build.png — the whole window in Build, whose sidebar holds the Loka > Docs tree; assets/folders.png — the folder tree crop; assets/stars.svg — star field
- focal: assets/build.png
- roles: build = cutout (zoomed from its folder region out to the full window) · folders = supporting (only if the worker needs a sharper close-up layer) · stars = background

narrativeRole: show how tabs are kept: nested folders, not a tab strip.
keyMessage: folders hold folders, as deep as you need.
On-screen text: "Folders inside folders"

Scene 1 (0.0–1.2s): Build sky. Open tight: build.png scaled so its folder tree (the Loka folder, the highlighted
helium-windows row, the Docs folder and its two tabs; in the 2560×1600 image roughly x 0–560, y 300–700) fills
about 60% of the frame height, left of center. Hold the close-up.
Scene 2 (1.2–3.0s): one continuous decelerating zoom-out (`coordinate-target-zoom` in reverse, long expo.out
tail) to the full window at 1040×650, top-left at x=440, y=230 (bottom edge at y=880). The frame locks.
Scene 3 (3.0–4.5s): the headline "Folders inside folders" reveals above the window at y≈110 (`h2`), then holds.

## Frame 5 — Find any tab

- scene: Two real crops arrive in turn: the Ctrl+K command bar finding a tab in School, then sidebar search finding a tab inside a closed folder
- voiceover: ""
- duration: 5.5s
- transition_in: crossfade
- status: animated
- src: compositions/frames/05-find.html
- type: feature_showcase
- persuasion: Friction reduction
- beat: control
- blueprint: grid-card-assemble (Adapt)
- asset_candidates: assets/command-bar.png — Ctrl+K finding Canvas: CSC 281 in School; assets/search.png — sidebar search finding Minecraft farm designs in a closed folder; assets/stars.svg — star field
- focal: assets/command-bar.png
- roles: command-bar = cutout · search = cutout · stars = background

narrativeRole: the second reason to switch: nothing gets lost.
keyMessage: find any tab, in any space.
On-screen text: headline "Find any tab, in any space"; under the command bar the key caps "Ctrl" "K"; under the
search crop the key caps "Ctrl" "Shift" "F".

Adapt: keep grid-card-assemble's staggered self-assembly into a held row; two cards, not a grid.
Scene 1 (0.0–1.0s): Build sky; headline "Find any tab, in any space" reveals per word at the top, centered (`h2`).
Scene 2 (1.0–2.6s): the command-bar crop (`crop` component, about 900px wide) rises into the left 60% of the frame
(`spring-pop-entrance`, smooth), its key caps "Ctrl K" fading in beneath it.
Scene 3 (2.6–4.0s): the search crop (about 400px wide) rises into the right side, its key caps "Ctrl Shift F"
beneath. Asymmetric 60/40, both cards' tops aligned.
Scene 4 (4.0–5.5s): hold both.

## Frame 6 — The rest you reach for

- scene: Three real crops assemble in a row with one-line labels: the archive, music from another space, import from other browsers
- voiceover: ""
- duration: 5s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/06-more.html
- type: benefit_highlight
- persuasion: Value stacking
- beat: ease
- blueprint: grid-card-assemble (Reproduce)
- asset_candidates: assets/archive.png — the Archived tabs panel; assets/media.png — the now-playing card above the horizon; assets/import.png — the first-run import step; assets/stars.svg — star field
- focal: assets/import.png
- roles: archive = cutout · media = cutout · import = cutout · stars = background

narrativeRole: breadth in one look, without a feature list.
keyMessage: the small things are already there.
On-screen text: labels under each card, in order: "Old tabs put themselves away", "Music from any space",
"Bring Chrome, Edge and Arc along".

Scene 1 (0.0–0.6s): Build sky only.
Scene 2 (0.6–3.4s): three cards self-assemble left to right in a staggered cascade (`waterfall-entry`, smooth),
each with its label fading in under it a beat later: archive.png shown at its real size (272×250, it is a 1x
image, do not upscale past 1.4×), media.png at about 380px wide, import.png at about 640px wide. Triptych, tops
aligned at y≈220, labels at `label` size.
Scene 3 (3.4–5.0s): hold.

## Frame 7 — Built on Helium

- scene: A calm title card: "Private and fast, because it's Helium", then four short lines
- voiceover: ""
- duration: 4.5s
- transition_in: crossfade
- status: animated
- src: compositions/frames/07-helium.html
- type: benefit_highlight
- persuasion: Authority by association
- beat: trust
- blueprint: titlecard-reveal (Adapt)
- asset_candidates: assets/stars.svg — star field; assets/planet-moon.svg — a small cratered moon
- focal: assets/stars.svg
- roles: stars = background · planet-moon = supporting (small, upper right, still)

narrativeRole: answer "is it private and fast?" with what it's built on.
keyMessage: it's Helium underneath: private, fast, open source.
On-screen text: title "Private and fast, because it's Helium"; then a 2×2 list: "uBlock Origin built in",
"No Google services", "Chrome extensions work", "Open source, GPL-3.0".

Adapt: keep titlecard-reveal's single restrained move and long still hold; the four lines arrive as one quick
stagger right after the title, then everything holds.
Scene 1 (0.0–0.4s): Build sky, the small moon already in place upper right.
Scene 2 (0.4–1.4s): the title slides up a few px with a crossfade (`h1`), left-aligned at x=160, y≈260.
Scene 3 (1.4–2.4s): the four lines reveal in a short stagger as a 2×2 grid below the title (`label`, ink), each
with a small accent dot.
Scene 4 (2.4–4.5s): still hold.

## Frame 8 — loka

- scene: The mark builds (planet, lit crescent, moon), the wordmark and tagline lock up beside it, then the waitlist call and URL
- voiceover: ""
- duration: 5.5s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/08-cta.html
- type: cta
- persuasion: One clear next step
- beat: motivation
- blueprint: logo-assemble-lockup (Adapt)
- asset_candidates: assets/mark-build.svg — the mark in blue; assets/mark-school.svg — the mark in amber; assets/mark-home.svg — the mark in green; assets/stars.svg — star field
- focal: assets/mark-build.svg
- roles: mark-build = cutout · mark-school / mark-home = supporting (the color cycle) · stars = background

narrativeRole: the ask, and the name to remember.
keyMessage: loka. Join the waitlist.
On-screen text: wordmark "loka"; tagline "Every space is its own world."; CTA pill "Join the waitlist"; URL
"loka.example/waitlist" (a placeholder: keep it in one `const WAITLIST_URL` at the top of the frame's script so
the owner can change it and re-render).

Adapt: keep logo-assemble-lockup's mark coming to exist on a cleared stage and resolving into a centered lockup
extended to a URL/CTA end card; the mark builds from its own parts (disk, lit crescent, moon) instead of
orbiting satellites.
Scene 1 (0.0–1.4s): Build sky. The mark (about 220px) assembles at center-left of the lockup: the dark disk
scales in, the lit crescent wipes across it from the top left, the moon pops in last (`spring-pop-entrance`,
smooth). Its color crossfades once Build → School → Home → Build across the build-up (stack the three mark SVGs
and crossfade their opacity).
Scene 2 (1.4–2.6s): "loka" (`wordmark`) slides in beside the mark, lockup centered as a group at y≈380; the
tagline "Every space is its own world." fades in under it (`body` size, muted).
Scene 3 (2.6–4.0s): the CTA pill "Join the waitlist" (`cta-pill`, accent-build fill) and the URL beneath it
fade up, centered at y≈640.
Scene 4 (4.0–5.5s): hold; this is the final frame, so it may ease the whole lockup to a slightly dimmer state in
the last 0.4s.
