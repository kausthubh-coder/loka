# Loka verification map

This directory is the maintained source for verifying what a Loka user sees. Read this index, then use the feature
file as the recipe. Prototype features run with `node .agents/skills/verify-loka/scripts/run.mjs <id>`; the browser
features (the last two) with `bun run verify:browser`.

## Baseline preconditions (prototype recipes)

- `bun run setup` has run in this checkout and `.env.local` has a `PORT`.
- `bun run dev` was started by this run, and the doctor (`node .agents/skills/verify-loka/scripts/doctor.mjs`)
  passes.
- Each recipe resets to the seed data (`prototype/src/features/sidebar/sidebar.seed.ts`):
  - Spaces: `Build` (active), `School`, `Home`.
  - Essentials: `Inbox`, `Calendar`, `GitHub`, `YouTube`.
  - Build pinned: folder `Loka` > tab `imputnet/helium-windows`, folder `Docs` > `Chromium: Windows build guide`,
    `Lit docs`.
  - Build open tabs: `Hacker News`, `Arc: what we learned`, `Zen Browser`.
  - School pinned: `Canvas: CSC 281`, folder `CSC 281` > closed folder `Game project` (2 tabs).
  - Home: one open tab, `Lo-fi beats`, and no active tab.

## Driving conventions

- Use the driver in `scripts/loka.mjs` and its accessible-name handles. Never use CSS selectors or coordinates.
- Use `loka.drag` for every move a user makes by dragging. It produces real `dragover` and `drop` events.
- Run with node, not bun.

## Proof and skip reporting

- Capture state before and after the action with `loka.proof(name)`.
- Assert on `loka.outline()`, which reads what the app saved, as well as on what's visible.
- `close()` fails the run on any console error.
- Report an entry point you couldn't drive, and why. Never report it as verified through a different path.

## Feature entry contract

Each feature file has an H1, one paragraph on the user-visible behavior, then four H2s in this order:
`Sub-features`, `How to get to it (user POV)`, `Driving it with loka.mjs`, `Gotchas`.

## Features

- [Folders](./folders.md): nested pinned folders. Create, rename, open and close, drag in and out, ungroup.
- [Spaces](./spaces.md): the horizon switcher; switch by click, Ctrl+1-9, swipe or drag-hover; each space's tint and
  remembered tab; new spaces.
- [Tabs](./tabs.md): open from Ctrl+K, activate, close, pin and unpin, unload pinned tabs, Clear.
- [Essentials](./essentials.md): the shared icon grid. Drag in (an empty grid opens a tray while you drag), reorder,
  remove; the one-time hint.
- [Export and import](./export-import.md): JSON export, import, reset, rejecting bad files.
- [Command bar](./command-bar.md): Ctrl+T, Ctrl+K, Ctrl+L and the address field: addresses, searches with the
  browser's suggestions, tabs, spaces and commands; the floating `command.html`.
- [Space editor](./space-editor.md): create or change a space's name, color, planet and light or dark.
- [Light and dark](./theme.md): each space's scheme, the crossfade, and `setColorScheme`.
- [Window layout and pages](./layout.md): resize, right side, hide and pin back (the top row's button, Ctrl+S),
  peek; Settings, Downloads.
- [Extensions](./extensions.md): pinned ones in the address field, running them, pinning, the empty state.
- [History](./history.md): Loka's History page, Ctrl+H.
- [Onboarding](./onboarding.md): the first-run tour.
- [Archive](./archive.md): opt-in archiving of old open tabs, and bringing them back.
- [Sidebar search and keyboard](./search-and-keys.md): Ctrl+Shift+F, next/previous tab, arrow keys in the tree.
- [Import](./import.md): Chrome and Edge bookmarks, Arc spaces and Favorites.
- [Media controls](./media.md): the now-playing card.
- [Sound](./sound.md): interface cues for sidebar actions, the throttle, and Settings > Sound.
- [The sidebar in the real browser](./native-sidebar.md): `chrome://loka-sidebar` on real tabs, first run, icons,
  sound; `bun run verify:browser`.
- [Browser build](./browser-build.md): Helium plus Loka's patches: launch, `patches:check`, `build:status`, the alpha.
