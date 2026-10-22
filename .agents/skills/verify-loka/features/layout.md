# Window layout and Loka's pages

The sidebar's top row is the window's title bar, like Zen's: the menu, hide or pin, back, forward, reload, then the
window's own minimize, maximize and close; its empty space drags the window. The sidebar can be resized, moved to the
right, or unpinned so the browser slides it away and back in at the window's edge (`setSidebarPinned`). Settings
(`loka://settings` here, `chrome://loka-settings` in the browser) is Loka's own page. Extensions is a panel opened
from inside the address field; Downloads is a button in the bottom row beside the +, whose panel rises from there.

## Sub-features

- `sidebar-resize`: in the prototype, drag the sidebar's inner edge (220 to 420 px; double-click resets to 300) or
  Settings > Sidebar width. The real browser uses Chromium's own resize edge on the column.
- `sidebar-side`: Settings > Sidebar > Sidebar side, Left or Right (the prototype's window only).
- `sidebar-hide`: the top row's `Hide sidebar` button, the command bar, or Settings > Keep the sidebar open (Ctrl+S
  too, in the prototype only). The same button, now `Keep sidebar open`, pins it back. Reaching the window edge
  slides it in; leaving hides it.
- `sidebar-narrow`: below 286 px the top row drops Reload, below 254 px Forward too.
- `window-buttons`: `Minimize`, `Maximize` and `Close window` call `windowAction`; empty top-row space calls
  `startWindowDrag`, and a double-click maximizes.
- `page-settings`: Sidebar, Spaces (each space's light or dark, edit, new), Appearance (Moving stars, see
  `sky.md`), Sound, Tabs (archiving), Extensions,
  Sync, Import, Privacy and Search, shortcuts, about.
- `settings-rail`: the `Settings sections` nav beside the page lists every section with an icon and marks the one in
  view (`aria-current`, from IntersectionObservers; `settings.logic.ts` picks it). A click scrolls to the section and
  focuses its heading; Up and Down move between rows. `Search settings` (`/` or Ctrl+F) keeps only the settings whose
  name or line has every word, marks the words, and drops sections with nothing left; Escape clears it. Below 720 px
  the rail is a bar of chips that sticks to the top.
- `downloads-panel`: every state's actions (pause, resume, cancel, try again, open, show in folder, remove), live
  progress, a progress ring on the bottom row's Downloads button, a dot on it when a file finished while the panel
  was closed (opening the panel clears it), and a 4 s toast above the bottom row naming the file
  (`newlyFinished` in downloads.logic.ts). Escape closes any panel.
- `pages-once`: opening Settings again goes to the existing tab, even from another space.

## How to get to it (user POV)

- The sidebar's edge; the top row's buttons; Ctrl+S; `...` > Settings; the Downloads button in the bottom row;
  `...` > Downloads; the command bar's `Settings`, `Downloads`, `Hide the sidebar`.

## Driving it with loka.mjs

Preconditions: seed data.

- **Resize.** Mouse down on `getByRole("separator", { name: "Resize sidebar" })`, move 80 px right, up. `ui()` has
  `sidebarWidth: 380`.
- **Side.** In `loka-settings`, click the `Right` radio. The sidebar's box is right of the page's.
- **Settings rail.** In `getByRole("navigation", { name: "Settings sections" })` click `Sound`: the Sound heading
  scrolls near the top, has focus, and only `Sound` has `aria-current="true"`. Fill `Search settings` with
  `autoplay`: the rail's buttons are just `Media`. Escape brings all 12 back.
- **Hide and peek.** Click `Hide sidebar`: `window.lokaDemo.calls` has `setSidebarPinned` with `false` and the
  sidebar is off screen. Move the mouse to x=2; after ~350 ms the sidebar's box starts at x >= 0. Click
  `Keep sidebar open` to pin it back.
- **Downloads.** Click `Downloads` in `.bottom` (the address field has none); in `getByRole("dialog", { name: "Downloads" })` there are two progress bars
  (running, paused); `Try again lofi-cover.png` makes three. Escape closes it.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs layout`.
- **In the browser.** `bun run verify -- --ux layout` runs it, verify:browser ("setSidebarPinned(false) reads
  back", "the sidebar answers Windows' hit test as page, not title bar", "a real click (posted WM_LBUTTONDOWN/UP) on
  a tab's row switches to it") and verify:flows `states` (hover, press, focus). `settings` checks "Keep the sidebar
  open off unpins the sidebar in the browser" and the rail (its rows, a click on Sound, the "autoplay" search, the
  chips at 640 px), with pictures in light and dark; `panels` checks Downloads with a real download: "Downloads is in
  the bottom row, not the address field", "the finished download shows briefly and leaves a dot on Downloads",
  "opening it clears the dot and the toast". Not checked in the browser: the
  top row's Hide button, edge peek, Minimize, Maximize, Close, dragging the window by the top row, Reload, and
  download actions.
- **Real input by hand.** To check a point the way Windows does: `powershell -NoProfile -File
  scripts/window-hittest.ps1 -ProcId <pid> -Points "x,y"` in physical client px (1 page, 2 title bar). To click or
  drag like a mouse: `powershell -NoProfile -File scripts/window-input.ps1 -ProcId <pid> -Kind click -X <x> -Y <y>`
  in client DIPs (`-Kind drag` takes `-X2 -Y2`). Post a `move` first and read the page's `mousemove` clientX/Y to
  find where the sidebar sits in the window.

## Gotchas

- CDP's Input events start inside the page and skip Windows' hit test, so a CDP click passes on a sidebar that a
  real mouse would drag the window from. A change to the top row, the frame or the hit test needs the hit-test and
  real-click checks, not a CDP drive.
- Fresh runs set `loka.ui.v1` to `{ onboarded: true }`, so the tour doesn't cover the window. Pass
  `openLoka(name, { onboarding: true })` to see it.
- The fake browser keeps the pinned state in `loka.demo.sidebarPinned`, not in the window prefs.
- Critly loads the prototype in a fresh browser: use `/?skip-tour`. Its `check` can't see inside Lit's shadow DOM
  (it reports ~16 elements), so a clean check here proves nothing; use its `taste` images and these recipes.
- Downloads, extensions, media and suggestions come from the fake browser in `prototype/src/demo/`; Privacy and
  Search in the prototype's Settings are switches only.
