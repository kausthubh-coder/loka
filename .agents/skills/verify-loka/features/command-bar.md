# Command bar

One bar for everything, shaped like Zen's: type an address or words to go or search, find any tab in any space, or
run a command. Ctrl+T opens it for a new tab; Ctrl+L and the sidebar's address field open it on the current tab, with
its address filled in and selected ("New tab" mode when no tab shows). Ctrl+K opens it too, but in the real browser
only while the sidebar has focus: the browser reroutes only its own new-tab and focus-location commands. In the real
browser it's the floating bar (`webui/command.html`, a transparent window over the browser window); in the prototype
it's drawn over the window.

## Sub-features

- `command-go`: the first row is what Enter does with the text: "Search the web" or "Go to <address>" until the
  browser's autocomplete answers (`suggest` / `suggestions`); then its first answer ("Search with <engine>") takes
  that row.
- `command-tabs`: matching tabs from every space (never new tab pages), with the space's planet and name; the
  browser's open-tab suggestions join them.
- `command-history`, `command-bookmarks`: the browser's other suggestions, in their own sections.
- `command-spaces`: other spaces whose name matches.
- `command-actions`: commands matched by label or related words ("preferences" finds Settings).
- `command-modes`: "New tab" or "This tab" on the right of the field says where an address opens.
- `command-keys`: Up, Down, Tab and Shift+Tab move, Enter runs, Ctrl+Enter takes one word to its .com, Escape closes.

## How to get to it (user POV)

- Ctrl+T, Ctrl+K or Ctrl+L, the address field at the top of the sidebar, or the sidebar's `New tab` row.

## Driving it with loka.mjs

Preconditions: seed data. The fake browser (`prototype/src/demo/`) answers `suggest` from a seeded history.

- **Tab in another space.** Ctrl+K, fill the `combobox` "Search or enter address" with `canvas`, ArrowDown, Enter.
  `outline()` gives `space: "School"`, `activeTab: "Canvas: CSC 281"`.
- **Command by a related word.** Fill `preferences`, ArrowDown, Enter. `activeTab` is `Settings`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs command-bar`.
- **In the browser.** `bun run verify -- --ux command-bar` runs it, verify:browser ('suggest("example") answers, a
  search first') and verify:flows `tabs` and `spaces`: "pages opened from the command bar land in Research, newest
  first", "words in the command bar search the web in a new tab", "Ctrl+L opens the bar on the shown address", "and
  Enter goes there in the same tab", "picking Code Lab in the command bar shows it". The flows open the bar with
  `chrome.send("openCommandBar")`, the handler Ctrl+T runs; the real Ctrl+T, Ctrl+K, Escape and Tab keys, history and
  bookmark rows, and jumping to a tab in another space are not checked in the browser.

## Gotchas

- The input is a `combobox`, not a `textbox`.
- Row 0 is the search or address whenever the bar has text, so the first tab or command is ArrowDown once.
- The bar doesn't act itself: it sends `loka-pick` with a `CommandPick` and the window runs it (the floating page
  runs what the browser can do and hands the rest to the sidebar with `commandPicked`).
- Results come from `commandResults` in `command-bar.logic.ts`, which is unit tested; the recipe proves the keyboard
  and the switch.
