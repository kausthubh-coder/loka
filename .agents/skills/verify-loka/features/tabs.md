# Tabs

Users open tabs from the Ctrl+K bar, switch by clicking, close open tabs, and pin or unpin them. Closing an open tab
deletes it. Closing a pinned or essential tab only unloads it, so it stays in the sidebar.

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
- `tab-move-space` uses right-click > `Move to <space>`.
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
  browser", "a middle click closes a tab", "Move to Play moves the tab there", "Ctrl+L opens the bar on the shown
  address". Not checked in the browser: `Clear`, `Close tab` from the menu, and the real Ctrl+T and Ctrl+W keys.

## Gotchas

- Ctrl+W and Ctrl+T can't be caught by a web page, so the prototype uses Ctrl+E to close and Ctrl+K to open. In the
  real browser Ctrl+T reaches the command bar through the browser's own command, which CDP keys can't press.
- In the prototype a tab's title is its host (`lit.dev`); real tabs take the page's title.
- The `x` only shows on an open tab's row, on hover or when active. Playwright's click still finds it by name.
