# Import

Chrome and Edge bookmarks arrive as one closed pinned folder, keeping their folder tree: in the current space from
Settings > Import, in the first space from the prototype's tour. Each Arc space becomes a Loka space with its name,
color and nested pinned folders, and Arc's Favorites join Essentials. In Settings the user picks the file, in the
prototype and the real browser alike. The real browser's first-run setup (`chrome://setup`) uses Helium's own import
page instead, which brings bookmarks in as Chromium bookmarks. The sidebar then takes those in once per profile
(`takeBrowserBookmarks`, after setup's spaces) as a closed `Imported bookmarks` folder in the first space; the
browser hands them to the first window that asks and marks them taken (`bookmarks.taken` in the `loka.store` pref).

## Sub-features

- `import-browser-bookmarks`: the browser's own bookmarks, from setup's import or an older Loka, become one pinned
  folder, once. Bookmarks the browser gets after that stay in chrome://bookmarks only.
- `import-chrome` / `import-edge`: the `Bookmarks` file. Bookmarks bar first, then Other and Mobile as folders;
  `chrome://` and other non-web entries are skipped.
- `import-arc`: `StorableSidebar.json`. Old (`containerIDs`) and new (`newContainerIDs`) formats; `arc://` skipped.
- `import-tour`: the prototype tour's import step, applied when the tour finishes.
- `import-settings`: Settings > Import > From Chrome / Edge / Arc, applied at once, with a result line.
- Passwords are a CSV export from the other browser (Chrome's App-Bound Encryption blocks reading them directly).

## How to get to it (user POV)

- The tour's second step. Settings > Import.

## Driving it with loka.mjs

Preconditions: seed data. Sample files in `../fixtures/` (shaped like the real ones, from no one's browser).

- **Settings.** Click `Choose file` in the `From Chrome` row and give the file chooser `fixtures/Bookmarks`:
  `Added 4 bookmarks as a folder in this space.` and `pinned` ends with `0:Chrome bookmarks (closed)`. Arc's row with
  `fixtures/StorableSidebar.json`: `Added 2 spaces with 3 pinned tabs, and 1 Favorites.` Edge's row with the Arc file:
  `That isn't Edge's Bookmarks file.`
- **Tour.** `Import from Chrome` and `Import from Arc` with the same files show `Ready: 4 bookmarks` and
  `Ready: 2 spaces, 3 pinned tabs`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs import` (and `onboarding`).
- **In the browser.** `bun run verify -- --ux import` runs the recipe and verify:flows `browser-bookmarks`: a browser
  started on a profile that already has `fixtures/Bookmarks` as its own Bookmarks file, as after setup's import,
  checks "bookmarks already in the browser become one pinned folder in the first space" and "a second window doesn't
  bring them in again". Not checked in the browser: Settings > Import, and setup's import page itself (it needs
  another browser's profile on the machine); verify:flows `first-run` only clicks past it.

## Gotchas

- The parsers are `import.logic.ts`, unit tested with the same shapes; the recipes prove the pickers and the result.
- Never point a recipe at a real browser's files.
