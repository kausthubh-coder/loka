# Library

Loka's Library is one page at chrome://history (`webui/history.html`, `<loka-library>` in
`prototype/src/features/library/`) with four sections: Spaces, Archived tabs, History and Downloads. The address's
hash picks the section (`#spaces`, `#archive`, `#downloads`; no hash is History, so Ctrl+H still opens History). Each
section is the sky with two glass cards, like History: a rail (a header under 820px) whose top is the section
switcher, and a list. The page takes the current space's color and light or dark once the spaces have loaded.

## Sub-features

- `library-switcher`: four tiles at the top of every section's rail (one row in a narrow window, icon over name
  under 560px). A click changes the hash and the page's title; Back and Forward walk the sections.
- `library-spaces`: Essentials, then every space with its planet, counts ("3 pinned, 4 open, 2 folders"), its whole
  pinned tree (folders open here, whatever the sidebar has; closing one here doesn't touch the sidebar) and its open
  tabs, "Showing" on each space's shown tab. A tab's row (`Go to <title>`) sends `revealTab`; `Switch to <space>`
  sends `switchSpace`. The rail's space names scroll to that space. Spaces off screen aren't laid out.
- `library-spaces-reorder`: the rail's space rows reorder the spaces. Drag a row (pointer events, 5 px to start):
  the rail shows the order the drop would make, the dragged row lit; letting go sends `moveSpace`, Escape cancels.
  In a narrow window the rail is a row of pills and the drag goes sideways. Or focus a row and press Alt+ArrowUp or
  Alt+ArrowDown: the space moves one place (nothing at the ends), the row keeps the focus, and a status line says
  "<space> moved to <n> of <count>". The list below follows the new order.
- `library-archive`: the archive (`state.archive`) by the day each tab left, newest first, each row with its site,
  the space it left (or "Deleted space") and the time. Search by title or address; filter by space ("Every space"
  and each space that has archived tabs, with counts). A row (`Bring back <title>`) sends `restoreArchived`. "Clear
  archive…" asks first, then sends `clearArchive`.
- `library-downloads`: `getDownloads` and `downloads-changed`, by the day each started, newest first, with the
  panel's actions per state (`downloadAction`): open a finished file (its row), show in folder, pause, resume,
  cancel, try again, remove. Search by file name or address. "Clear the list" removes every download that has
  ended (files stay).
- `library-history`: the History page as it was (see [History](./history.md)), with the switcher in its rail.
- `library-open`: the sidebar's `...` menu > Library and the command bar's Library open chrome://history/#spaces
  (`browser.openPage`); the Downloads panel's "See all downloads" opens chrome://history/#downloads.

## How to get to it (user POV)

- The sidebar's `...` menu > Library, the command bar's Library, Ctrl+H (History), or "See all downloads" in the
  Downloads panel.

## Driving it with loka.mjs

Preconditions: the seed data; the fake downloads (`prototype/src/demo/demo-data.ts`: running, paused, finished,
failed and cancelled, over three days); the fake history.

- **Open.** `More` > `Library`: `loka-library-spaces` shows headings Essentials, Build, School, Home; the Library's
  tab is `loka://history#spaces` in the saved state.
- **Switch.** The switcher's links are `link` named Spaces, Archive, History, Downloads; the shown one has
  `aria-current="page"`.
- **Spaces.** `region` per space by its name; `Go to <title>` buttons; folder buttons named `<folder> <n> tabs` with
  `aria-expanded`; `Switch to <space>`.
- **Reorder.** The rail is `group` "Go to a space"; its rows are buttons named by the space (the current one
  `<space> Current space`). Drag with `page.mouse` (down on Home's middle, move in steps to Build's top edge, up):
  mid-drag the row has class `dragging` and the rail reads Home, Build, School while the saved order hasn't changed;
  after the drop `state().spaces` is Home, Build, School and the list's headings follow. `focus()` a row and press
  `Alt+ArrowDown`/`Alt+ArrowUp`; `getByRole("status")` holds the announcement.
- **Archive.** Fill it the way the archive recipe does (clock 8 hours on: Arc and Zen leave Build). Buttons
  `Bring back <title>`; `searchbox` "Search archived tabs"; filters by space name; "Clear archive…" opens an
  `alertdialog` "Clear N archived tab(s)?".
- **Downloads.** `Pause <file>`, `Resume <file>`, `Show in folder <file>`, `Try again <file>`; a finished file's row
  is a button named by the file; `searchbox` "Search downloads". The fake records `downloadAction` calls.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs library`.
- **Contrast.** `run.mjs contrast-pages` measures the first three screens of each section, for 8 hues in both
  schemes (theme.md). The chosen archive filter's count is `--loka-ink-2` on its lighter fill.
- **In the browser.** `bun run verify -- --ux library` runs it and verify:flows `settings`: "the Library's Spaces
  (chrome://history/#spaces) lists every space", "the Library's switcher shows Downloads, with the browser's list",
  "the Library's Archived tabs shows the archive", "... > Library opens chrome://history/#spaces". Not checked in the
  browser: going to a tab or switching space from the Library, restoring or clearing the archive there, download
  actions from the Library, the narrow layout.
  Reordering spaces (`library-spaces-reorder`) is proven in the prototype only: the browser check is pending the C++
  port of `moveSpace`. Until a build has it, the browser refuses the intent and the order springs back.

## Gotchas

- The Spaces, Archived tabs and Downloads sections need the sidebar's handler (LokaSidebarHandler) on
  chrome://history as well as LokaHistoryHandler. A browser without it shows History fine and placeholder rows in
  the other three forever (their requests are never answered).
- The browser's `getDownloads` sends at most 30 downloads, newest first (`kMaxDownloads` in the handler).
- Going to a tab or a space from the Library changes what the window shows: the Library's tab belongs to a space, so
  it goes out of view. The prototype's recipe opens the Library again with `More` > `Library`, which always lands on
  Spaces.
- With the clock 8 hours on (to fill the archive), the fake history's newest visits can read Yesterday: wait for
  History's own heading, not Today.
- `<loka-history-page>` is still the tag in history.html, so this checkout's page runs in an older build
  (`--webui=checkout`).
