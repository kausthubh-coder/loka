# Tabs

Users open tabs from the Ctrl+K bar, switch by clicking, close open tabs, and pin or unpin them. Closing an open tab
deletes it. Closing a pinned or essential tab only unloads it, so it stays in the sidebar.

## Sub-features

- `tab-open` opens from Ctrl+K or Ctrl+L, the URL pill, or `+ New tab`. Addresses get `https://`; words become a
  DuckDuckGo search.
- `tab-activate` makes a clicked tab active (highlighted row, page area shows it).
- `tab-close` closes with the row's `x`, or Ctrl+E for the active tab. The neighbour becomes active.
- `tab-pin` uses right-click > `Pin to space`; `Unpin` moves it back to the top of the open tabs.
- `tab-unload` uses right-click > `Unload tab` on a pinned tab. It stays pinned, with no active tab.
- `tab-move-space` uses right-click > `Move to <space>`.
- `tab-clear` closes every open tab in the space with `Clear`.

## How to get to it (user POV)

- Ctrl+K, the URL pill at the top of the sidebar, or `+ New tab`.
- Click a row. Hover a row for its `x`.
- Right-click a row for pin, unpin, Essentials, move and close.
- `Clear`, on the divider line above the open tabs.

## Driving it with loka.mjs

Preconditions: seed data, `Build` space active.

- **Open.** `page.keyboard.press("Control+k")`, fill textbox `Search or enter address` with `lit.dev/playground`,
  press Enter. `open[0]` and `activeTab` are both `lit.dev`.
- **Activate and close.** Click `loka.row("Zen Browser")`, then the `Close Zen Browser` button. `open` no longer
  lists it.
- **Pin.** Right-click `Arc: what we learned`, then `Pin to space`. The last `pinned` line is
  `0:Arc: what we learned`.
- **Unload pinned.** Right-click `imputnet/helium-windows`, then `Unload tab`. It is still in `pinned`.
- **Clear.** Click `Clear`. `open` is `[]`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs tabs`.

## Gotchas

- Ctrl+W and Ctrl+T can't be caught by a web page, so the prototype uses Ctrl+E to close and Ctrl+K to open. The
  real browser will use the native shortcuts.
- A tab's title is its host (`lit.dev`), not the path typed. Searches keep the typed words as the title.
- The `x` only shows on hover or on the active row. Playwright's click still finds it by name.
