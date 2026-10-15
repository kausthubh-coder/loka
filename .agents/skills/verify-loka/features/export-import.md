# Export and import

Spaces live in the browser's localStorage. A user can export everything to a JSON file, import one back, or reset
to the demo data. Import refuses any file that isn't a valid Loka export (for example, one that places a tab twice),
and changes nothing when it refuses.

## Sub-features

- `export` uses `...` > `Export spaces (JSON)` and downloads `loka-spaces.json`.
- `import` uses `...` > `Import spaces (JSON)`, which opens a file picker and replaces the current state.
- `import-reject` shows the alert "That file isn't a Loka spaces export." for a bad file. State is unchanged.
- `reset` uses `...` > `Reset demo data` to restore the seed.

## How to get to it (user POV)

- The `...` button (`More`) at the top right of the sidebar, in the toolbar.

## Driving it with loka.mjs

Preconditions: seed data.

- **Change something.** Drag `Hacker News` into `Docs`, so the export differs from the seed.
- **Export.** Click `More`, then `Export spaces (JSON)`, inside `Promise.all` with `page.waitForEvent("download")`.
  Save it in `loka.dir`. The file's JSON equals `loka.state()`.
- **Reset.** `More`, then `Reset demo data`. `open` includes `Hacker News` again.
- **Import.** `More`, then `Import spaces (JSON)`, with `page.waitForEvent("filechooser")`, and `setFiles` the
  export. `outline()` equals the outline taken before exporting.
- **Reject.** Import a file containing `{"hello":"world"}`. One dialog with the message above appears, and the
  outline is unchanged.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs export-import`.

## Gotchas

- The alert blocks the page until it's dismissed. Register `page.once("dialog", ...)` before choosing the file.
- Import validates the whole file. A hand-edited export with a missing tab id is rejected too.
