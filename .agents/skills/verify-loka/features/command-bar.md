# Command bar

Ctrl+K opens one bar for everything: type an address or words to open or search, find any tab in any space by its
title or site, or run a command (new space, edit space, new folder, hide the sidebar, Settings, Downloads, the tour).

## Sub-features

- `command-go` opens what was typed: an address, or a DuckDuckGo search. Always the first result when there's text.
- `command-tabs` lists matching tabs from every space, with the space's planet and name. Choosing one switches there.
- `command-actions` lists commands matched by label or related words ("preferences" finds Settings).
- `command-empty` with no text lists this space's open tabs and every command.
- `command-keys`: arrows move the selection, Enter runs it, Escape closes.

## How to get to it (user POV)

- Ctrl+K or Ctrl+L, the URL pill at the top of the sidebar, or the sidebar's `New tab` row.

## Driving it with loka.mjs

Preconditions: seed data.

- **Tab in another space.** Ctrl+K, fill the `combobox` "Search or enter address" with `canvas`, ArrowDown, Enter.
  `outline()` gives `space: "School"`, `activeTab: "Canvas: CSC 281"`.
- **Command by a related word.** Fill `preferences`, ArrowDown, Enter. `activeTab` is `Settings`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs command-bar`.

## Gotchas

- The input is a `combobox`, not a `textbox`.
- Result 0 is the search or address whenever the bar has text, so the first tab or command is ArrowDown once.
- Search results come from `commandResults` in `command-bar.logic.ts`, which is unit tested; the recipe proves the
  keyboard and the switch.
