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
