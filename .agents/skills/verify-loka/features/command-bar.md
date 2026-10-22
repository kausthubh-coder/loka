# Command bar

One bar for everything, shaped like Zen's: type an address or words to go or search, find any tab in any space, or
run a command. Ctrl+T opens it for a new tab; Ctrl+L and the sidebar's address field open it on the current tab, with
its address filled in and selected ("New tab" mode when no tab shows). Ctrl+K opens it too, but in the real browser
only while the sidebar has focus: the browser reroutes only its own new-tab and focus-location commands. In the real
browser it's the floating bar (`webui/command.html`, a transparent window over the browser window); in the prototype
it's drawn over the window.

## Sub-features

- `command-go`: the first row is what Enter does with the text: "Search with <engine>" or "Go to <address>". Once
  the browser's autocomplete answers (`suggest` / `suggestions`) its first answer takes that row.
- `command-pick`: like Chrome's and Zen's address bar, the start of a site goes there instead of searching. If a
  Loka tab's site starts with what was typed ("youtu" with YouTube open), or the browser's pick (`default: true` on
  its first suggestion) is an open tab, row 0 is that tab ("Switch to tab"). Else if the browser's pick is a page it
  knows (history, bookmark), row 0 is "Go to youtube.com" with the page's title. The search moves to row 1. Plain
  words (the browser's pick is a search, or it sends no pick) keep the search first.
- `command-inline`: while row 0 is a pick and selected, the field shows its completion selected after the caret
  ("youtu" + selected "be.com", from the suggestion's `inline` or the tab's site). Backspace or Delete removes it
  and keeps it off for the same words until a character is typed; typing the next character of the completion
  keeps it with no wait; arrowing to another row puts back exactly what was typed.
- `command-tabs`: matching tabs from every space (never new tab pages), with the space's planet and name; the
  browser's open-tab suggestions join them.
- `command-history`, `command-bookmarks`: the browser's other suggestions, in their own sections.
- `command-spaces`: other spaces whose name matches.
- `command-actions`: commands matched by label or related words ("preferences" finds Settings).
- `command-modes`: "New tab" or "This tab" on the right of the field says where an address opens.
- `command-keys`: Up, Down, Tab and Shift+Tab move, Enter runs, Ctrl+Enter takes one word to its .com, Escape closes.
- `command-new-tab`: there is no new tab page. Ctrl+T, the `New tab` row and the + menu's New tab open the bar and
  make no tab; Escape leaves the tabs as they were; a pick makes exactly one. A window with nothing to show (a new
  window, a space with no tabs, its last tab closed) shows an empty tab: chrome://newtab, which the browser loads as
  Loka's page `webui/newtab.html` at chrome://loka-newtab (the space's sky; typing on it opens the bar). An empty tab
  is never a sidebar row, a pick on it opens a tab of its own, and the sync closes it once it's off screen. A window
  that starts on one opens the bar over it. Ctrl+W closes the shown tab as its x does; on an empty tab it closes the
  window. `isEmptyTab` in `live.logic.ts` says which tabs are empty.

## How to get to it (user POV)

- Ctrl+T, Ctrl+K or Ctrl+L, the address field at the top of the sidebar, or the sidebar's `New tab` row.

## Driving it with loka.mjs

Preconditions: seed data. The fake browser (`prototype/src/demo/`) answers `suggest` from a seeded history.

- **Tab in another space.** Ctrl+K, fill the `combobox` "Search or enter address" with `canvas`, Enter (the
  Canvas tab's site starts with "canvas", so it's row 0). `outline()` gives `space: "School"`,
  `activeTab: "Canvas: CSC 281"`.
- **Completion.** Ctrl+K, `keyboard.type("youtu")`: the field's value is `youtube.com` with `be.com` selected
  (read `value`, `selectionStart`, `selectionEnd` on the combobox), row 0 is YouTube "Switch to tab". Backspace:
  `youtu`, nothing selected, row 0 is the search. Type `b`: `youtube.com` with `e.com` selected. Enter:
  `activeTab: "YouTube"`. For the browser's history pick, type `redd` (reddit is only in the fake's history).
  "how to cook rice" stays a search first.
- **Command by a related word.** Fill `preferences`, ArrowDown, Enter. `activeTab` is `Settings`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs command-bar`.
- **Contrast.** `run.mjs contrast-pages` measures the bar's text, empty and with "lit" typed (its completion
  selected, on `--loka-text-selection`), embedded beside the sidebar and without it, and as the floating page
  (`layout="page"`), for 8 hues in both schemes (theme.md).
- **In the browser.** `bun run verify -- --ux command-bar` runs it, verify:browser ('suggest("example") answers, a
  search first') and verify:flows `tabs` and `spaces`: "pages opened from the command bar land in Research, newest
  first", "words in the command bar search the web in a new tab", "Ctrl+L opens the bar on the shown address", "and
  Enter goes there in the same tab", "picking Code Lab in the command bar shows it". verify:flows `new-tab` checks
  `command-new-tab`: no tab while the bar is open or after Escape, one tab per pick, the empty tab in a new space,
  after its last tab closes and in a new window (with the bar open over it). verify:flows `shortcuts` presses the
  browser's own Ctrl+T and Ctrl+L on a page: "Ctrl+T on a page opens the command bar and makes no tab", "Ctrl+L on a
  page opens the command bar on its address". Ctrl+K, Tab keys, history and bookmark rows, a start with nothing to
  restore, and jumping to a tab in another space are not checked in the browser.

## Gotchas

- The input is a `combobox`, not a `textbox`.
- Row 0 is the search or address whenever the bar has text, so the first tab or command is ArrowDown once,
  except when what was typed starts an open tab's site or the browser picks a page: then that's row 0 and the
  search is row 1.
- The field's value includes the selected completion; what was typed is the part before the selection. Type with
  `keyboard.type`, not `fill`, when a test cares about completion: deletion is told apart by the input event's
  `inputType`.
- The fake browser (`prototype/src/demo/fake-browser.ts`) sends `default` and `inline` the way the handler's
  OnResultChanged does. Browser builds from before those fields send neither, and the bar then searches first as
  it always did (YouTube still switches to an open Loka tab: that rule is Loka's own).
- The bar doesn't act itself: it sends `loka-pick` with a `CommandPick` and the window runs it (the floating page
  runs what the browser can do and hands the rest to the sidebar with `commandPicked`).
- Results come from `commandResults` in `command-bar.logic.ts`, which is unit tested; the recipe proves the keyboard
  and the switch.
