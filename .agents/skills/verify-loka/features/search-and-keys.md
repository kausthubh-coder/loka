# Sidebar search and keyboard

Search across the sidebar finds any tab in any space or folder and says where it sits; choosing one goes there and
opens the folders above it. The keyboard moves between tabs in sidebar order and through the tree.

## Sub-features

- `sidebar-search`: Ctrl+Shift+F, or `...` > `Search the sidebar`, or Ctrl+K > `Search the sidebar`. Arrows and Enter.
- `tab-step`: Ctrl+Alt+Down / Up: next or previous tab in sidebar order (Essentials, visible pinned, open), wrapping.
- `tree-keys`: on a focused row, Up and Down move focus (across the divider too), Enter runs it, Right opens a closed
  folder and goes into an open one (its first row), Left closes an open folder and otherwise goes up to the folder
  holding the row. Keys with Ctrl, Cmd or Alt are left to the window, so Ctrl+Alt+arrows and Ctrl+1-9 still work
  with a row focused.
- `select-keys`: Shift+Up and Shift+Down move focus one row and pick the run from the anchor (the last row picked or
  clicked, else the focused row); they stay within the pinned tree or the open tabs. Escape lets go (after a menu
  or panel, which Escape closes first). Delete or Backspace closes the picked tabs, or the focused tab when none are
  picked: open ones go to the archive, pinned ones unload; focus goes to the row that takes their place.
- `menu-keys`: a menu (right-click, Shift+F10 on a row, `...`, the space label, `+`) focuses its first item; Up,
  Down, Home and End move; Escape or Tab closes it and focus goes back to what opened it.

## How to get to it (user POV)

- The shortcuts above; the `...` menu.

## Driving it with loka.mjs

Preconditions: seed data.

- **Search.** Ctrl+Shift+F, fill `combobox` "Search the sidebar" with `minecraft`, Enter. `space` is `School`,
  `activeTab` is `Minecraft farm designs`, and `pinned` shows it at depth 2 (its closed folder opened).
- **Step.** From Build (showing `imputnet/helium-windows`), Ctrl+Alt+ArrowDown gives `Chromium: Windows build guide`;
  Up twice from there gives `YouTube` (the last Essential).
- **Tree.** Focus `loka.row("Loka")`, ArrowLeft: `0:Loka (closed)`. ArrowRight, ArrowDown, Enter: `activeTab` is
  `imputnet/helium-windows`. ArrowLeft focuses `Loka`; ArrowRight, ArrowDown, ArrowRight focus
  `Chromium: Windows build guide` (read the focused row from the sidebar's `shadowRoot.activeElement`).
- **Pick and delete.** From there Shift+ArrowDown picks Chromium and `Lit docs` (`aria-checked`); again stays on
  `Lit docs`; Escape lets go. ArrowDown to `Hacker News`, Shift+ArrowDown, Delete: `open` is `[Zen Browser]` and
  `Zen Browser` has focus. Delete again empties `open`; `archive` is Zen, Arc, Hacker News. Delete on `Lit docs`
  keeps it pinned.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs search-and-keys`.
- **In the browser.** `bun run verify -- --ux search-and-keys` runs it and verify:flows `panels` ("Search the
  sidebar finds a tab") and `tabs`; `states` checks "Tab moves focus with a visible ring". Not checked in the
  browser: going to a result, Ctrl+Shift+F itself, Ctrl+Alt+arrows, and the tree and menu keys. Shift+arrows and
  Delete are proven in the prototype only; their browser check is pending the C++ model's port (Delete sends
  `closeTabs`, which the browser answers today, but nothing drives it there yet).

## Gotchas

- A web page can't take Ctrl+Tab, so the prototype uses Arc's Ctrl+Alt+arrows, and so does the real
  browser's sidebar today (`webui/src/main.ts`). Mapping Ctrl+Tab and Ctrl+PgDn to the same step is not built.
- In the real browser Ctrl+Shift+F and Ctrl+Alt+arrows come from the sidebar page's own key handler, so they work
  only while the sidebar has focus.
- Ctrl+F stays find-in-page; sidebar search is Ctrl+Shift+F.
