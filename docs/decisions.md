# Decisions

Choices that look odd from one file but are on purpose. Each says why, so a change that undoes one is a decision
too, not a cleanup.

## Product

- **The UI ships as WebUI pages and C++ patches, never as an extension.** An extension can't own the window, the
  title bar or the tab strip, and every shortcut through one ended up redone in C++. Biome blocks extension APIs and
  URLs in `webui/` and `prototype/src/features/`.
- **Sample data lives only in `prototype/src/demo/`.** Fake extensions and downloads once shipped in the build because
  a component had defaults. Components take their data from a bridge; only the demo bridge has samples.
- **There is no new tab page; the command bar is the new tab.** Ctrl+T, the sidebar's New tab and the + menu open
  the bar and make no tab, as in Zen (`zen.urlbar.replace-newtab`). Chromium can't show a window with no tab, so a
  window with nothing to show (a new window, a space with no tabs, its last tab closed) shows an empty tab:
  chrome://newtab, which the browser rewrites to Loka's page at chrome://loka-newtab (the space's sky, nothing else).
  Like Zen's empty tab, it is never a sidebar row, never navigated (a pick opens a tab of its own), and the sync
  closes it once it's off screen, so a window holds at most one. The bar opens over it only when a window starts on
  it, as Zen does on startup; switching to an empty space doesn't pop the bar. Closing a window's last tab keeps the
  window (Zen sets `browser.tabs.closeWindowWithLastTab` off); Ctrl+W on the empty tab closes the window, as Zen
  does. An extension that overrides the new tab page still wins over Loka's: the user installed it on purpose.
- **Only the sidebar's stars move.** The new tab, History and Settings show the same sky, held still
  (`skyLayer(..., "still")`). Moving layers the size of a whole tab cost far more to composite: in the mockup, stars
  over the whole window took idle from 60 to 38 fps. The sidebar's stars follow Settings > Appearance > Moving stars
  (`sky.logic.ts`).
- **Loka's strings live in the webui bundle, not in `.grdp` files.** A new `<message>` adds a resource ID and
  recompiles thousands of files (about 25 minutes). Editing an existing message's text is cheap.

## Build and test

- **The build checkout is a git worktree of this repo at `C:\src\loka`.** Chromium's tree is about 100 GB and can't
  live in OneDrive; as a worktree, patch work there is committed like any branch, and `patches:check` compares it
  with the patches of whichever checkout runs it.
- **One build checkout, shared.** Two trees would cost 200 GB and hours each. Instead: `build.lock` for one build at
  a time, the snapshot for tests while a build runs, and refusals in `browser:build` and `browser:run` while
  `out\Default` is in use.
- **The browser suites speak raw CDP, not Playwright.** The sidebar is a top-chrome WebUI target that Playwright's
  `connectOverCDP` doesn't list.
- **Real input is posted window messages, not `SendInput`.** `SendInput` moves the real cursor on a desktop I may
  be using; posted messages take Chromium's Win32 input path without it. Posted coordinates are client DIPs, while
  `WM_NCHITTEST` takes physical pixels.
- **Playwright scripts run with node.** Its browser launch hangs under bun on Windows.
- **`messages.test.ts` reads the build checkout's handler when there is one.** The C++ there can be ahead of the
  patch, and the page must match what the binary answers. The cost: on my machine the test fails while a new message
  exists only in `build\src`. CI reads the patch.
- **Each worktree gets its own port and nothing else.** The prototype has no backend; localStorage is per origin, so
  a port is a separate data store.

## Release

- **Alphas are built here and published with `release:alpha`.** Helium's CI build (`main.yml`) takes 15 to 44
  hours on free runners; a local incremental build takes minutes. `release:alpha` checks that the zip was built
  from the commit it tags.
- **Raw `gh release` and `gh workflow run` are denied to agents; `release:alpha --publish` asks me.** Publishing is
  my call, made in the conversation, and the ask rule makes Claude Code confirm it.
- **Builds are unsigned, v1 included.** My call (Oct 22). SmartScreen warns on download; the release notes say so.
- **Crash reports and Helium's services stay Helium's.** My call (Oct 22): Loka uses Helium's crash server (asked
  after a crash, as Helium does) and its services (extension downloads, uBlock lists, bangs, dictionaries, component
  updates), so Loka runs no servers. The privacy policy names them and points to Helium's.
- **One version number: Helium's three parts and Loka's own fourth.** Helium's `build.py` writes
  `HELIUM_MAJOR.MINOR.PATCH` from `helium-chromium` and `HELIUM_PLATFORM` from this repo's `revision.txt` into
  `chrome/VERSION`. Loka owns `revision.txt` and bumps it for each release, so the exe, About, the update feed, the zip
  and the tag share one number that only goes up, Helium updates included (0.19.2.4, then 0.20.1.5), with no edit
  to Helium's files. When a Helium merge touches `revision.txt`, Loka's number wins. The alphas' `0.1.0-alpha.N`
  ends with the first release that reads the number from the build (the update work, #31).

## Git

- **Merge, never rebase, and leave Helium's files alone.** This is a fork of `helium-windows`; merge commits keep
  Helium's history, and every edit to Helium's own files conflicts on the next Helium merge.
- **The `Vercel` check is not a gate.** It is the landing site's preview and fails on every branch without the site.
