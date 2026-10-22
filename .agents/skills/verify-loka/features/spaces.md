# Spaces

A space is a named set of tabs with its own color. Switching spaces swaps the pinned tree and open tabs, tints the
whole window with the space's hue, and brings back the tab that was active in that space. Essentials stay the same.
The switcher is a horizon at the bottom of the sidebar: the current space is a large planet with its name on it, and
the previous and next spaces are small planets on the left and right.

## Sub-features

- `space-orbit`: a switch turns the orbit (`orbit.logic.ts`, from the v1 mockup): the planet you were on shrinks
  into the neighbour place it now belongs in, and the one you picked grows out of its place into the horizon, 380 ms
  (200 ms within 250 ms of the last switch). Stand-ins in an `.orbit` layer make the trip over the real planets,
  which turn transparent (not hidden, so they still take clicks), moving only by transform and opacity; reduced
  motion skips it.
- `space-theme-follow`: in the real browser the window's frame colour and the pages' light/dark follow the space
  700 ms after the last switch (`FOLLOW_AFTER_SWITCH_MS` in `webui/src/main.ts`), not in the switch's own frames:
  telling the browser re-themes the whole window and every tab. Other changes (the space editor) follow at once.
- `space-switch-click` switches by clicking a neighbouring planet.
- `space-switch-keys` switches with Ctrl+1 to Ctrl+9, in space order.
- `space-switch-swipe` switches with a sideways two-finger swipe anywhere on the sidebar (next on a leftward swipe).
- `space-switch-drag` switches when a dragged tab hovers over a neighbouring planet.
- `space-list` lists every space when the current planet is clicked, plus `New space`.
- `space-memory` keeps one active tab per space.
- `space-empty`: in the prototype the page area says "Nothing open in <space>." when the space has no active tab;
  the real browser opens a new tab in it instead.
- `space-tab-group`: in the real browser each space's tabs are one tab group named and colored after it, and the
  other spaces' groups are folded away.
- `space-new` opens the space editor with `Space N` and the next color; creating switches to it.
- `space-reorder`: the spaces' order (`state.spaces`) is Ctrl+1..9's, the horizon's neighbours' and the spaces
  menu's. The current planet's menu (click it or right-click it) has `Move left` and `Move right` for the current
  space; at either end the item that would wrap is left out. The Library's Spaces reorders any space (see
  [library.md](./library.md)). Both send the `moveSpace` intent (`{ op: "moveSpace", spaceId, toIndex }`, `toIndex`
  counted after the move, clamped); the space showing stays showing.
- `space-per-window`: in the real browser each window shows its own space. A new window opens on the space last
  used (the saved `activeSpaceId`); switching one window leaves the others' spaces and tabs on screen alone. After a
  restart each window shows the space of the tab it had on screen. The browser keeps the space per window
  (`LokaSpacesService`), and each page hears its own window's space as `activeSpaceId`.

## How to get to it (user POV)

- The small planets either side of the horizon. Hover shows the name and shortcut.
- Ctrl+1 to Ctrl+9.
- A sideways swipe on the sidebar.
- Drag a tab and hold it over a small planet.
- Click the big planet, or the space's name at the top of the list, for the list of spaces and `New space`; the `+`
  (`New`) button > `New space`; or `...` > `New space`.
- Click or right-click the big planet > `Move left` / `Move right`; or reorder in the Library's Spaces (`...` >
  `Library`).

## Driving it with loka.mjs

Preconditions: seed data (Build, School, Home).

- **Keys.** `page.keyboard.press("Control+2")`. `outline()` gives `space: "School"` and `activeTab: "Canvas: CSC 281"`.
- **Click.** From School, `loka.space("Home").click()`. `space` is `Home` and the page shows `Nothing open in Home.`
- **Memory.** From Home, `loka.space("Build").click()`. `activeTab` is `imputnet/helium-windows` again.
- **Drag-hover.** From Build, `loka.row("Zen Browser").dragTo(loka.space("School"))`. `space` is `School`.
- **Swipe.** Hover a sidebar row, then `page.mouse.wheel(120, 0)`. From School, `space` is `Home`.
- **New.** Click the `Spaces: <current>` button, `loka.menuItem("New space")`, then `Create space` in the editor
  (see [space-editor.md](./space-editor.md)). `space` is `Space 4`, with empty `pinned` and `open`.
- **Reorder.** From School, click `Spaces: School` > `Move left`. `state().spaces` names read School, Build, Home;
  `space` stays School; Ctrl+2 shows Build and Ctrl+1 School. On the first space the menu has no `Move left`.
  Right-click the big planet > `Move right` puts it back.
- **Tint.** Compare `proof()` screenshots of Build (blue) and School (amber). The sky, the big planet and the accents
  change hue.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs spaces`.
- **In the browser.** `bun run verify -- --ux spaces` runs it and verify:flows `spaces`: "clicking Play's planet
  shows Play", "the browser follows to Play", "Ctrl+3 shows Code Lab", "picking Code Lab in the command bar shows
  it", "the browser shows Work's tab group, the rest folded", "switching to the empty space opens a new tab in it";
  and `windows`: "a new window opens on the space last used", "the new window switches to Play", "the first window
  still shows Research, on the same tab", "switching the first window leaves the new one on Play".
  Not checked in the browser: the swipe, drag-hover switching, each space keeping its own active tab, and windows
  keeping their spaces through a restart.
  Reordering (`space-reorder`) is proven in the prototype only: the browser check is pending the C++ port of
  `moveSpace` (components/loka/core, against the `moveSpace` cases in `model-cases.json`). Until a build has it, the
  browser refuses the intent and the order springs back.

## Gotchas

- Only the two neighbours are buttons. `loka.space(name)` finds a space only when it sits next to the current one;
  with three spaces every space is a neighbour. With two spaces the other one shows once, on the right.
- `loka.space(name)` matches the button's full label, `<name> (Ctrl <n>)`. The big planet is `Spaces: <name>`.
- One swipe gesture sends many wheel events. After a switch the rest are ignored for 450 ms, so a second swipe in a
  test needs a wait.
- To see the orbit, slow it: a CDP session's `Animation.setPlaybackRate` at 0.1 makes 380 ms last 3.8 s. A switch
  between a dark and a light space also crossfades the whole sidebar (a view transition), whose old picture lingers
  over the orbit at that speed.
- The tint changes at once; the old sky crossfades out over 650 ms and the star layers sweep for 1.1 s. Wait before
  screenshotting a hue change, or pause and scrub the animations. They live in shadow roots, which
  `document.getAnimations()` doesn't search: collect them from each `shadowRoot.getAnimations()`.
- Dropping onto a planet itself does nothing. Only hovering switches spaces, and the drop has to land on a row in the
  new space.
