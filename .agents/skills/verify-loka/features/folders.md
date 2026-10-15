# Folders

Pinned tabs live in folders that can hold other folders, to any depth. A user creates folders, renames them, opens
and closes them, drags tabs and whole folders in and out, and ungroups a folder without losing its tabs. The tree is
saved and survives a reload.

## Sub-features

- `folder-new` creates a folder at the end of the pinned list (the `New folder` button in the top toolbar).
- `folder-new-inside` creates a folder inside another one (right-click > `New folder inside`).
- `folder-rename` renames with an inline box (double-click, or right-click > `Rename`). Enter saves, Escape cancels.
- `folder-toggle` opens and closes by clicking. There is no arrow: the icon is an open or a closed folder. A closed
  folder shows how many items it holds.
- `folder-holds-active` puts a white dot on a closed folder's icon when the active tab is somewhere inside it.
- `folder-drop-into` puts a dragged tab or folder at the end of the folder (middle of the row).
- `folder-reorder` drops before or after a row (top or bottom edge of the row).
- `folder-no-cycle` refuses to drop a folder into itself or its own subfolders.
- `folder-ungroup` deletes the folder and keeps its contents in its place.

## How to get to it (user POV)

- The `New folder` icon button in the toolbar at the top of the sidebar.
- Right-click a folder: `Rename`, `New folder inside`, `Ungroup (keep tabs)`.
- Double-click a folder name to rename it.
- Drag any tab row or folder row onto a folder row.

## Driving it with loka.mjs

Preconditions: seed data, `Build` space active.

- **Tab into a nested folder.** `await loka.drag(loka.row("Hacker News"), loka.row("Docs"), "into")`. Then
  `outline().pinned` includes `2:Hacker News`, and `open` no longer lists it.
- **Subfolder.** Right-click `loka.row("Docs")`, click `loka.menuItem("New folder inside")`, type `Patches`, press
  Enter. `pinned` includes `2:Patches`.
- **No cycle.** `await loka.drag(loka.row("Loka"), loka.row("Lit docs"), "before")`. `pinned` is unchanged.
- **Close and open.** Click `loka.row("Docs")`. `pinned` shows `1:Docs (closed)` and `loka.row("Lit docs")` has
  count 0. Click again to open.
- **Holds the active tab.** Click `loka.row("Loka")` to close it (it holds `imputnet/helium-windows`, the active
  tab). `loka.row("Loka").locator(".holds")` has count 1; open it again and the count is 0.
- **Ungroup.** Right-click `Docs`, then `Ungroup (keep tabs)`. No `Docs` line remains, and `1:Lit docs` and
  `1:Patches` sit where it was.
- **Persistence.** `page.reload()`, then `pinned` equals the line list from before the reload.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs folders`.

## Gotchas

- Dropping on the bottom quarter of an open folder puts the item first inside that folder, which is where it shows.
  Use `"after"` on the folder's last child to land after the folder.
- A new folder starts in rename mode with the text selected. Typing replaces `New folder`.
- Clicking a folder row toggles it, so a stray click before a drag changes the outline.
