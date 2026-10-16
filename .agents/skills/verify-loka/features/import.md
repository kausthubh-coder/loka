# Import

Chrome and Edge bookmarks arrive as one closed pinned folder, keeping their folder tree: in the current space from
Settings > Import, in the first space from the prototype's tour. Each Arc space becomes a Loka space with its name,
color and nested pinned folders, and Arc's Favorites join Essentials. In Settings the user picks the file, in the
prototype and the real browser alike. The real browser's first-run setup (`chrome://setup`) uses Helium's own import
page instead, which brings bookmarks in as Chromium bookmarks, not as Loka spaces.

## Sub-features

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
- **In the browser.** `bun run verify -- --ux import` runs the recipe and reports the gap: no browser check covers
  Settings > Import or setup's import step yet. verify:flows `first-run` only clicks past setup's import page.

## Gotchas

- The parsers are `import.logic.ts`, unit tested with the same shapes; the recipes prove the pickers and the result.
- Never point a recipe at a real browser's files.
