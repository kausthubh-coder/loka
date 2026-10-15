# Window layout and Loka's pages

The sidebar can be resized, moved to the right, or hidden so it slides in over the page at the window's edge. These
are window prefs (`loka.ui.v1`), not spaces data, so they don't travel with an export. Settings (`loka://settings`) is
Loka's own page, drawn on the night sky instead of a white web page. Downloads is a toolbar panel, like Extensions.

## Sub-features

- `sidebar-resize`: drag the sidebar's inner edge (220 to 420 px). Double-click the edge resets to 272.
- `sidebar-side`: Settings > Appearance > Sidebar side, Left or Right.
- `sidebar-hide`: Ctrl+S, or Settings > Hide the sidebar. Reaching the window edge slides it in; leaving hides it.
- `page-settings`: Appearance (works), Spaces (works: edit, new), Privacy and Search (switches only), shortcuts, about.
- `downloads-panel`: the toolbar's Downloads button: recent sample files, a running one that progresses, Retry on a
  failure, Clear. Escape closes any panel.
- `pages-once`: opening Settings again goes to the existing tab, even from another space.
- `extensions`: the puzzle button lists sample extensions; pinning one puts its icon in the toolbar.

## How to get to it (user POV)

- The sidebar's edge; Ctrl+S; `...` > Settings; the toolbar's Downloads button; Ctrl+K > `Settings`, `Downloads`.
- The puzzle button in the sidebar's toolbar for extensions.

## Driving it with loka.mjs

Preconditions: seed data.

- **Resize.** Mouse down on `getByRole("separator", { name: "Resize sidebar" })`, move 80 px right, up. `ui()` has
  `sidebarWidth: 352`.
- **Side.** In `loka-settings`, click the `Right` radio. The sidebar's box is right of the page's.
- **Hide and peek.** Ctrl+S, then `ui().sidebarHidden` is true and the sidebar is off screen. Move the mouse to x=2;
  after ~350 ms the sidebar's box starts at x >= 0.
- **Downloads.** Click the toolbar's `Downloads`; in `getByRole("dialog", { name: "Downloads" })` click `Retry`: two
  progress bars. Escape closes it.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs layout`.

## Gotchas

- Fresh runs set `loka.ui.v1` to `{ onboarded: true }`, so the tour doesn't cover the window. Pass
  `openLoka(name, { onboarding: true })` to see it.
- Critly loads the prototype in a fresh browser: use `/?skip-tour`. Its `check` can't see inside Lit's shadow DOM
  (it reports ~16 elements), so a clean check here proves nothing; use its `taste` images and these recipes.
- Downloads, extensions, Privacy and Search are samples: nothing is saved and there's no network.
