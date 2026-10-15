# Light and dark

Each space chooses light, dark or the system's setting, and the whole window follows: the sidebar, the command bar,
the space editor, the panels, and (through `setColorScheme`) the browser and the pages it shows. Dark is the night
sky; light is a day sky with white raised rows. Switching to a space in the other scheme crossfades the window.

## Sub-features

- `theme-space`: the scheme is part of the space (`Space.scheme`, migrated to `system` for old saves).
- `theme-editor`: the space editor's "Light or dark" control previews the choice before it's saved.
- `theme-settings`: Settings > Spaces sets it per space too.
- `theme-browser`: every change of the shown space's scheme calls `setColorScheme` once.

## How to get to it (user POV)

- Edit a space (its planet's menu, or the command bar's "Edit this space") and pick Light, Dark or System.

## Driving it with loka.mjs

Preconditions: seed data. Build is dark, School light, Home follows the system (Playwright's default is light).

- **Switch.** Ctrl+2 and Ctrl+3: the window's root has `theme-light`; `window.lokaDemo.calls` holds
  `setColorScheme` with `dark`, `light`, `system` in that order.
- **Choose.** Edit Home, pick `Dark` (a `radio`), Save: `state().spaces` has Home's `scheme: "dark"`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs theme`.

## Gotchas

- The redraw waits one frame for the crossfade to capture the old look; the save and the call to the browser don't.
  Wait for what's on screen (`waitFor`) rather than counting it at once.
- Colors are role tokens in `prototype/src/app/theme.ts`; a component that hard-codes a color looks wrong in one of
  the two themes.
