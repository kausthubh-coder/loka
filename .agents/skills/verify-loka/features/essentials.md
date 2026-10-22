# Essentials

Essentials is the icon grid at the top of the sidebar, up to four per row (fewer fill the row, so one is one big
tile), and at most 12. Every space shares it. A user drags tabs in, reorders them, and removes them back to the open
tabs. With none, it takes no room and says nothing: while a tab is dragged, three empty tiles grow into place to drop
on.

## Sub-features

- `essentials-add-drag` drags a tab onto a tile's left or right edge, or into the free cell at the end of the last row.
- `essentials-add-menu` uses right-click on a tab > `Add to Essentials` (added at the end). On several picked tabs
  (Ctrl+ or Shift+click, see tabs.md) it adds them in sidebar order, as one change (`moveItems`).
- `essentials-limit`: at most 12 (`ESSENTIALS_LIMIT` in `sidebar.logic.ts`); `moveItem` refuses a 13th, reordering
  full Essentials still works. Adding several adds as many as fit, in order, and a toast above the bottom row says
  `Added 2. Essentials have room for 12, so 1 tab didn't fit.`; on a full grid it says `Essentials have room for 12.
  Remove one first.` and adds nothing (the menu item stays enabled, so the reason can be said). Dragging onto a full
  grid shows no free cell and no drop line on a tile's edge, and the drop changes nothing.
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
- **Limit.** After `Reset demo data`, pick Build's three open tabs and add them, then its three pinned tabs (10). In
  School open `Game project`, pick `Canvas: CSC 281`, `Game design doc` and `Minecraft farm designs`, add them: the
  `status` says 1 didn't fit, `essentials` has 12 ending `Canvas: CSC 281`, `Game design doc`, and Minecraft is still
  pinned. Its own `Add to Essentials` is refused and said; a mouse drag of it onto `YouTube`'s edge shows no
  `.slot`, `.drop-before` or `.drop-after` in `.essentials` and changes nothing.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs essentials`.
- **In the browser.** `bun run verify -- --ux essentials` runs it and verify:flows `pinning`: "with no Essentials,
  starting a drag moves no row (real mouse)", "and shows where Essentials go", "dropping there makes the first
  Essential", "Add to Essentials adds it", "dragging a tab onto Essentials adds it", "Essentials stay when
  switching spaces"; `restart` keeps them. Essentials sit outside every tab group. Not checked in the browser: remove, reorder and the hint.
  The limit of 12 and adding several are proven in the prototype only: the browser check waits for the C++ model's
  port (the cap in its moveItem, and the `moveItems` intent).

## Gotchas

- With a full last row (4 or 8 tiles) there is no end slot. Drop on a tile's edge instead. The slot never adds a row.
  At 12 there is no slot and the edges take nothing new.
- An import (Arc's Favorites, a JSON file) can bring more than 12: nothing is dropped, and no new one can join until
  some leave.
- With no Essentials, a drag fades out the address field and fades in three slots (`.essentials .tray`) over it.
  Nothing in the list moves; the first drop there makes the grid, and the rows slide down to make room.
- `loka.drag` uses left and right edges for tiles, because the grid runs horizontally.
- Folders can't become Essentials. A folder drop there is refused.
