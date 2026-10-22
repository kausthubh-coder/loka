# Loka verification map

This directory is the maintained source for verifying what a Loka user sees. Read this index, then use the feature
file as the recipe. `bun run verify -- --ux <id>` runs everything that proves feature `<id>`: its prototype recipes,
then its browser suites when a browser binary is here. `bun run verify -- --list` prints what each id runs.

## Baseline preconditions (prototype recipes)

- `bun run setup` has run in this checkout and `.env.local` has a `PORT`.
- `bun run dev` from this checkout is serving (`bun run verify` starts and stops it itself), and the doctor
  (`node .agents/skills/verify-loka/scripts/doctor.mjs`) passes.
- Each recipe resets to the seed data (`prototype/src/features/sidebar/sidebar.seed.ts`):
  - Spaces: `Build` (active), `School`, `Home`.
  - Essentials: `Inbox`, `Calendar`, `GitHub`, `YouTube`.
  - Build pinned: folder `Loka` > tab `imputnet/helium-windows`, folder `Docs` > `Chromium: Windows build guide`,
    `Lit docs`.
  - Build open tabs: `Hacker News`, `Arc: what we learned`, `Zen Browser`.
  - School pinned: `Canvas: CSC 281`, folder `CSC 281` > closed folder `Game project` (2 tabs).
  - Home: one open tab, `Lo-fi beats`, and no active tab.

## Baseline preconditions (browser suites)

- Windows, and a browser binary: `bun run build:status` ends with `Tests drive: <binary>`.
- verify:browser starts from a fresh profile; verify:flows starts from setup's three spaces (Research, Play,
  Code Lab) and opens its own QA pages from a local server.

## Driving conventions

- Prototype: use the driver in `scripts/loka.mjs` and its accessible-name handles, never CSS selectors or
  coordinates. Use `loka.drag` for every move a user makes by dragging. Run with node, not bun.
- Browser: drive the real UI over CDP (`scripts/browser-session.mjs`), and check both what the sidebar shows and what
  the browser did (`getTabs`, `getGroups`, targets). CDP input skips Windows' input path; use `window-hittest.ps1`
  and `window-input.ps1` for anything about where a real mouse lands.

## Proof and skip reporting

- Capture state before and after the action, and assert on the saved state as well as on what's visible.
- `close()` fails a prototype run on any console error.
- Report an entry point you couldn't drive, and why. Never report it as verified through a different path.
- The prototype proves the sidebar's own behavior, never the browser's. Each file's `In the browser` bullet names the
  checks that prove the browser, and what no check covers yet.

## Feature entry contract

Each feature file has an H1, one paragraph on the user-visible behavior, then four H2s in this order:
`Sub-features`, `How to get to it (user POV)`, `Driving it with loka.mjs` (or `Driving it` for the browser-only
ones), `Gotchas`. The driving section ends with an **In the browser** bullet that starts with
`bun run verify -- --ux <id>`. `scripts/verify.test.ts` fails when a file and the `UX` table in `scripts/verify.mjs`
disagree, or a recipe or flow it names doesn't exist.

## Features

- [Folders](./folders.md): nested pinned folders. Create, rename, open and close, drag in and out, ungroup.
- [Spaces](./spaces.md): the horizon switcher; switch by click, Ctrl+1-9, swipe or drag-hover; each space's tint and
  remembered tab; tab groups in the browser.
- [Tabs](./tabs.md): open from the command bar, activate, close, reorder, pin and unpin, unload pinned tabs, Clear;
  pick several with Ctrl+ or Shift+click and act on them from one menu.
- [Essentials](./essentials.md): the shared icon grid, at most 12. Drag in, reorder, remove, add several; the tray
  and the one-time hint.
- [Export and import](./export-import.md): JSON export, import (the alpha's too), reset, rejecting bad files.
- [Command bar](./command-bar.md): Ctrl+T, Ctrl+K, Ctrl+L and the address field: addresses, searches with the
  browser's suggestions, going to an open tab or known site with the address completed, tabs, spaces and commands;
  the floating `command.html`.
- [Space editor](./space-editor.md): create or change a space's name, color, planet and light or dark.
- [Light and dark](./theme.md): each space's scheme, the crossfade, and `setColorScheme`.
- [Window layout and pages](./layout.md): resize, side, hide and pin back, peek, the window buttons, real input;
  Settings, Downloads.
- [Extensions](./extensions.md): pinned ones in the address field, running them, pinning, the empty state.
- [History](./history.md): Loka's History page, Ctrl+H.
- [Library](./library.md): chrome://history as one page for spaces, archived tabs, history and downloads.
- [Onboarding](./onboarding.md): the prototype's first-run tour and the browser's setup.
- [Archive](./archive.md): archiving old open tabs (after 12 hours by default) and bringing them back; unloading
  the tabs of spaces out of sight.
- [Sidebar search and keyboard](./search-and-keys.md): Ctrl+Shift+F, next/previous tab, arrow keys in the tree,
  Shift+arrows to pick rows, Delete to close them.
- [Import](./import.md): Chrome and Edge bookmarks, Arc spaces and Favorites.
- [Media controls](./media.md): the now-playing card.
- [Sound](./sound.md): interface cues for sidebar actions, the throttle, and Settings > Sound.
- [Moving stars](./sky.md): the sidebar sky's drift, Settings > Appearance > Moving stars, the 15 s rest, hidden
  windows and reduced motion.
- [The sidebar in the real browser](./native-sidebar.md): `chrome://loka-sidebar` on real tabs, first run, icons,
  sound, the hit test and real clicks, restart; `verify:browser` and `verify:flows`.
- [Browser build](./browser-build.md): Helium plus Loka's patches: launch, `patches:check`, the shared build checkout,
  `build:status`, the alpha and its release.
