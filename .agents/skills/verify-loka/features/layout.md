# Window layout and Loka's pages

The sidebar's top row is the window's title bar, like Zen's: the menu, hide or pin, back, forward, reload, then the
window's own minimize, maximize and close; its empty space drags the window. The sidebar can be resized, moved to the
right, or unpinned so the browser slides it away and back in at the window's edge (`setSidebarPinned`). Settings
(`loka://settings` here, `chrome://loka-settings` in the browser) is Loka's own page. Downloads and Extensions are
panels opened from inside the address field.

## Sub-features

- `sidebar-resize`: drag the sidebar's inner edge (220 to 420 px). Double-click the edge resets to 300.
- `sidebar-side`: Settings > Sidebar > Sidebar side, Left or Right (the prototype's window only).
- `sidebar-hide`: the top row's `Hide sidebar` button, Ctrl+S, the command bar, or Settings > Keep the sidebar open.
  The same button, now `Keep sidebar open`, pins it back. Reaching the window edge slides it in; leaving hides it.
- `window-buttons`: `Minimize`, `Maximize` and `Close window` call `windowAction`; empty top-row space calls
  `startWindowDrag`, and a double-click maximizes.
- `page-settings`: Sidebar, Spaces (each space's light or dark, edit, new), Sound, Tabs (archiving), Extensions,
  Sync, Import, Privacy and Search, shortcuts, about.
- `downloads-panel`: every state's actions (pause, resume, cancel, try again, open, show in folder, remove), live
  progress, and a progress ring on the Downloads button. Escape closes any panel.
- `pages-once`: opening Settings again goes to the existing tab, even from another space.

## How to get to it (user POV)

- The sidebar's edge; the top row's buttons; Ctrl+S; `...` > Settings; the Downloads button in the address field;
  the command bar's `Settings`, `Downloads`, `Hide the sidebar`.

## Driving it with loka.mjs

Preconditions: seed data.

- **Resize.** Mouse down on `getByRole("separator", { name: "Resize sidebar" })`, move 80 px right, up. `ui()` has
  `sidebarWidth: 380`.
- **Side.** In `loka-settings`, click the `Right` radio. The sidebar's box is right of the page's.
- **Hide and peek.** Click `Hide sidebar`: `window.lokaDemo.calls` has `setSidebarPinned` with `false` and the
  sidebar is off screen. Move the mouse to x=2; after ~350 ms the sidebar's box starts at x >= 0. Click
  `Keep sidebar open` to pin it back.
- **Downloads.** Click `Downloads`; in `getByRole("dialog", { name: "Downloads" })` there are two progress bars
  (running, paused); `Try again lofi-cover.png` makes three. Escape closes it.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs layout`.

## Gotchas

- Fresh runs set `loka.ui.v1` to `{ onboarded: true }`, so the tour doesn't cover the window. Pass
  `openLoka(name, { onboarding: true })` to see it.
- The fake browser keeps the pinned state in `loka.demo.sidebarPinned`, not in the window prefs.
- Critly loads the prototype in a fresh browser: use `/?skip-tour`. Its `check` can't see inside Lit's shadow DOM
  (it reports ~16 elements), so a clean check here proves nothing; use its `taste` images and these recipes.
- Downloads, extensions, media and suggestions come from the fake browser in `prototype/src/demo/`; Privacy and
  Search in the prototype's Settings are switches only.
