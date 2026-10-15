# Extensions

The pinned extensions sit inside the sidebar's address field with their real icons and badges; clicking one asks the
browser to open its popup next to the button (`runExtension` with the button's rect). The puzzle button opens the
Extensions panel: every installed extension, click to run it, pin or unpin it (`setExtensionPinned`), or manage them
in the browser. With none installed, the panel says so and offers the Chrome Web Store.

## Sub-features

- `extensions-toolbar`: up to three pinned ones in the address field; a narrow sidebar hides whole buttons.
- `extensions-run`: the popup opens at the button's rect.
- `extensions-pin`: pinning shows at once, then follows `extensions-changed`.
- `extensions-empty`: the empty state with "Get extensions".

## How to get to it (user POV)

- The icons on the right of the address field, and the puzzle button next to them. Settings > Extensions too.

## Driving it with loka.mjs

Preconditions: the fake browser has five extensions; uBlock Origin and Bitwarden are pinned.

- **Run.** Click the `uBlock Origin` button: `runExtension` is logged with the button's x and y, and the
  `uBlock Origin popup` dialog (the prototype's stand-in) shows.
- **Pin.** Open `Extensions`, click `Pin Dark Reader`: a `Dark Reader` button joins the address field.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs extensions`.

## Gotchas

- Panel rows are named `Open <name>` so they don't clash with the pinned buttons, named `<name>`.
- Until the real browser answers `getExtensions` the address field just shows no extensions.
