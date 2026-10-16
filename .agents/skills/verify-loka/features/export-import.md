# Export and import

Spaces live in the profile (the `loka.store` pref) in the real browser and in localStorage in the prototype. A user
can export everything to a JSON file and import one back; the prototype can also reset to the demo data. Import
refuses any file that isn't a valid Loka export (for example, one that places a tab twice), and changes nothing when
it refuses. It also takes the 0.1.0 alpha's export, without the alpha's extension pages.

## Sub-features

- `export` uses `...` > `Export spaces (JSON)` and downloads `loka-spaces.json`.
- `import` uses `...` > `Import spaces (JSON)`, which opens a file picker and replaces the current state.
- `import-reject` shows the alert "That file isn't a Loka spaces export." for a bad file. State is unchanged.
- `reset` uses `...` > `Reset demo data` to restore the seed. Prototype only: the real sidebar has no demo data.

## How to get to it (user POV)

- The `...` button (`More`), first in the sidebar's top row.

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
- **In the browser.** `bun run verify -- --ux export-import` runs it and verify:browser: "Import spaces (JSON) takes
  the alpha's export", "the alpha's own extension pages are left out". Not checked in the browser: Export (the
  download), the rejection alert, and a round trip of an export.

## Gotchas

- The alert blocks the page until it's dismissed. Register `page.once("dialog", ...)` before choosing the file.
- Import validates the whole file. A hand-edited export with a missing tab id is rejected too.
