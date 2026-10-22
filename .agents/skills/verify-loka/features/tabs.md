# Tabs

Users open tabs from the Ctrl+K bar, switch by clicking, close open tabs, and pin or unpin them. Closing an open tab
by hand moves it to the top of Archived tabs, so it can come back. Closing a pinned or essential tab only unloads it,
so it stays in the sidebar, with its icon faded, and opens again at the address it was pinned with.

## Sub-features

- `tab-open` opens from Ctrl+K, Ctrl+T (real browser), `+ New tab` or the `+` (`New`) button. Ctrl+L and the URL
  pill change the shown tab's address, and open a new tab only when none shows. Addresses get `https://`
  (localhost, IP addresses and `name:port` get `http://`); words become a search (DuckDuckGo in the prototype, the
  browser's own engine in the real browser).
- `tab-activate` makes a clicked tab active (highlighted row, page area shows it).
- `tab-close` closes with the row's `x`, a middle click on the row, or the active tab's shortcut (Ctrl+W in the real
  browser, Ctrl+E in the prototype). The neighbour becomes active. A middle click on a pinned row unloads it.
- `tab-reorder` drags a row before or after another; dropping under a pinned row pins it.
- `tab-pin` uses right-click > `Pin to space`; `Unpin` moves it back to the top of the open tabs.
- `tab-unload` uses right-click > `Unload tab` on a pinned tab. It stays pinned, with no active tab.
- `tab-unload-history`: in the real browser a pinned tab or Essential whose browser tab closes (Unload tab, Ctrl+W, x)
  keeps its Back history in `LokaSpacesService` until the browser quits. Opened again, it opens at its pinned address
  with that history behind it, so Back goes to where it was. After a restart it opens with no history, as before.
- `tab-unloaded-look`: in the real browser a row or Essential with no page in memory (never opened, closed, or
  unloaded by the browser) has a faded, greyed icon and a dimmer title (`.unloaded`, from `live[id].unloaded`). The
  prototype has no notion of loaded, so it never shows it.
- `tab-reopen`: in the real browser each tab keeps which Loka tab it shows in the session (`loka.tab`, through
  `SessionServiceBase::SetKeptTabData` in `loka-kept-tab-data.patch`). After a restart or crash a tab takes that row
  before any address match; a tab the browser reopens (Reopen closed tab, a reopened window) brings its row back out
  of the archive, or takes the row it still has.
- `tab-move-space` uses right-click > `Move to space` > `<space>` (the submenu opens under its item; Right opens it,
  Left closes it).
- `tab-menu` also has Duplicate, Copy link, Mute or Unmute, Reload, Close tab and Close other tabs. Right-click on the
  sidebar's background (a gap, the divider) gives New tab, New folder, New space, Edit `<space>` and Hide sidebar.
- `tab-drag` drags with pointer events, not HTML5 drag and drop: press and move 5 px, a copy of the row follows the
  pointer, the row under it shows the drop line (or folder highlight), the list scrolls near its edges, hovering a
  neighbour planet switches space, and Escape cancels. Dropping on the divider or just above it pins the tab.
- `tab-clear` closes every open tab in the space with `Clear`.

## How to get to it (user POV)

- Ctrl+K, the URL pill at the top of the sidebar, `+ New tab`, or right-click empty space > `New tab`.
- Click a row. Hover an open tab's row for its `x`; pinned rows have none (their menu has `Unload tab`).
- Right-click a row for pin, unpin, Essentials, move and close.
- `Clear`, on the divider line above the open tabs. It only shows while the space has open tabs.

## Driving it with loka.mjs

Preconditions: seed data, `Build` space active.

- **Open.** `page.keyboard.press("Control+k")`, fill the combobox `Search or enter address` with `lit.dev/playground`,
  press Enter. `open[0]` and `activeTab` are both `lit.dev`.
- **Activate and close.** Click `loka.row("Zen Browser")`, then the `Close Zen Browser` button. `open` no longer
  lists it.
- **Pin.** Right-click `Arc: what we learned`, then `Pin to space`. The last `pinned` line is
  `0:Arc: what we learned`.
- **Unload pinned.** Right-click `imputnet/helium-windows`, then `Unload tab`. It is still in `pinned`.
- **Clear.** Click `Clear`. `open` is `[]`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs tabs`.
- **In the browser.** `bun run verify -- --ux tabs` runs it, verify:browser ("sidebar lists real tabs", "a real
  click (posted WM_LBUTTONDOWN/UP) on a tab's row switches to it") and verify:flows `tabs`: "pages opened from the
  command bar land in Research, newest first", "clicking a row makes it the browser's tab", "x closes the tab in the
  browser", "a middle click closes a tab", "closed tabs go to the top of the archive, so they can come back", "Move
  to Play moves the tab there", "Ctrl+L opens the bar on the shown address"; `pinning`: "and looks unloaded: its icon
  faded", "and looks loaded again", "closing a pinned tab's browser tab after it went elsewhere keeps its row", "and
  opening it again goes to the address it was pinned with", "and Back goes to the page it was on before it closed";
  and `restart`: "after the restart, Research's QA Twin
  row opens the tab that was Research's" (and Play's), two tabs at one address told apart by the id each saved.
  `tabs` also has "Reopen closed tab brings its row back out of the archive", through the QA extension's
  `chrome.sessions.restore()`, Chromium's own restore behind Ctrl+Shift+T.
  `shortcuts` presses the browser's own keys on a page: "Ctrl+PgDn on a page steps to the space's next row", "Ctrl+PgUp
  steps back", "Ctrl+Tab on a page steps to the space's next row", "Ctrl+Shift+Tab steps back", "Ctrl+W on a page closes it the way its x does: into the archive, and the window stays".
  Not checked in the browser: `Clear`, `Close tab` from the menu, and the real Ctrl+Shift+T key.

## Gotchas

- Ctrl+W and Ctrl+T can't be caught by a web page, so the prototype uses Ctrl+E to close and Ctrl+K to open. In the
  real browser Ctrl+T reaches the command bar through the browser's own command; CDP keys press it only with a native
  key code (see `native-sidebar.md`).
- In the prototype a tab's title is its host (`lit.dev`); real tabs take the page's title.
- The `x` only shows on an open tab's row, on hover or when active. Playwright's click still finds it by name.
