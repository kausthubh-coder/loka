# Sidebar search and keyboard

Search across the sidebar finds any tab in any space or folder and says where it sits; choosing one goes there and
opens the folders above it. The keyboard moves between tabs in sidebar order and through the tree.

## Sub-features

- `sidebar-search`: Ctrl+Shift+F, or `...` > `Search the sidebar`, or Ctrl+K > `Search the sidebar`. Arrows and Enter.
- `tab-step`: Ctrl+Alt+Down / Up: next or previous tab in sidebar order (Essentials, visible pinned, open), wrapping.
- `tree-keys`: on a focused row, Up and Down move focus, Enter runs it, Right opens a closed folder, Left closes one.

## How to get to it (user POV)

- The shortcuts above; the `...` menu.

## Driving it with loka.mjs

Preconditions: seed data.

- **Search.** Ctrl+Shift+F, fill `combobox` "Search the sidebar" with `minecraft`, Enter. `space` is `School`,
  `activeTab` is `Minecraft farm designs`, and `pinned` shows it at depth 2 (its closed folder opened).
- **Step.** From Build (showing `imputnet/helium-windows`), Ctrl+Alt+ArrowDown gives `Chromium: Windows build guide`;
  Up twice from there gives `YouTube` (the last Essential).
- **Tree.** Focus `loka.row("Loka")`, ArrowLeft: `0:Loka (closed)`. ArrowRight, ArrowDown, Enter: `activeTab` is
  `imputnet/helium-windows`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs search-and-keys`.

## Gotchas

- A web page can't take Ctrl+Tab, so the prototype uses Arc's Ctrl+Alt+arrows, and so does the real
  browser's sidebar today (`webui/src/main.ts`). Mapping Ctrl+Tab and Ctrl+PgDn to the same step is not built.
- Ctrl+F stays find-in-page; sidebar search is Ctrl+Shift+F.
