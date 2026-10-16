# Essentials

Essentials is the icon grid at the top of the sidebar, up to four per row (fewer fill the row, so one is one big
tile). Every space shares it. A user drags tabs in, reorders them, and removes them back to the open tabs. With none,
it takes no room and says nothing: while a tab is dragged, three empty tiles grow into place to drop on.

## Sub-features

- `essentials-add-drag` drags a tab onto a tile's left or right edge, or into the free cell at the end of the last row.
- `essentials-add-menu` uses right-click on a tab > `Add to Essentials` (added at the end).
- `essentials-reorder` drags a tile onto another tile's edge.
- `essentials-remove` uses right-click on a tile > `Remove from Essentials` (moves to the top of the open tabs), or
  drags the tile out to the open list. A tile's menu also has `Move to <space>` and `Unload tab`.
- `essentials-shared` shows the same tiles in every space, while the active tile is per space.
- `essentials-empty`: no room and no hint when empty; the slots only while a tab is dragged. Rules in
  `empty-states.logic.ts`.

## How to get to it (user POV)

- Drag a tab up to the grid.
- Right-click a tab or a tile.
- Click a tile to open it in the current space.

## Driving it with loka.mjs

Preconditions: seed data.

- **Add.** `await loka.drag(loka.row("Hacker News"), loka.essential("YouTube"), "after")`. The last `essentials`
  entry is `Hacker News`, and `open` no longer lists it.
- **Shared.** `Control+2`. School's `essentials` also includes `Hacker News`.
- **Remove.** Back in Build (`Control+1`), right-click `loka.essential("Inbox")`, then
  `Remove from Essentials`. `open[0]` is `Inbox`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs essentials`.
- **In the browser.** `bun run verify -- --ux essentials` runs it and verify:flows `pinning`: "Add to Essentials
  adds it", "dragging a tab onto Essentials adds it", "Essentials stay when switching spaces"; `restart` keeps them.
  Essentials sit outside every tab group. Not checked in the browser: remove, reorder, the tray and the hint.

## Gotchas

- With a full last row (4 or 8 tiles) there is no end slot. Drop on a tile's edge instead. The slot never adds a row.
- With no Essentials the tray pushes the list down while it's open, so read positions after it has opened (~200 ms).
- `loka.drag` uses left and right edges for tiles, because the grid runs horizontally.
- Folders can't become Essentials. A folder drop there is refused.
