# Space editor

A dialog to create a space or change one: its name, one of eight colors, one of four planets (gas giant, ringed,
moon, ocean world) and Light, Dark or System, with a live preview. The window's sky and scheme follow the choice
while the dialog is open.

## Sub-features

- `space-create` makes a space with the chosen look and switches to it. The name starts as `Space N`.
- `space-edit` changes the look of an existing space; its tabs stay.
- `space-delete`: in an edit, `Delete space` then `Delete it and its tabs` removes the space with its pinned, folder
  and open tabs (the browser closes them); the next space along shows. The only space has no Delete button.
- `space-preview` tints the window with the chosen color and scheme before saving; Cancel or Escape puts it back.
- `space-scheme`: the `Light or dark` radio group (Light, Dark, System) sets the space's scheme, which pages follow
  in the real browser.

## How to get to it (user POV)

- Click the big planet on the horizon: `New space` or `Edit this space`.
- The `+` (`New`) button > `New space`; `...` > `New space`; Ctrl+K > `New space` or `Edit this space`; Settings >
  Spaces > `Edit` or `New space`.

## Driving it with loka.mjs

Preconditions: seed data.

- **Create.** Click `Spaces: Build`, then `menuItem("New space")`. In `getByRole("dialog", { name: "New space" })`,
  fill the `Space name` textbox, click `Hue 330`, click `Moon`, click `Create space`. The last space in `state()` is
  `{ name, hue: 330, planet: "cratered" }`, and it's the current space.
- **Edit.** `Spaces: <name>` > `Edit this space`. The dialog is named `Edit <old name>`. Change and click `Save`.
- **Delete.** `Spaces: <name>` > `Edit this space` > `Delete space` > `Delete it and its tabs`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs space-editor`.
- **In the browser.** `bun run verify -- --ux space-editor` runs it and verify:flows `spaces`: "New space makes
  Work, with its look, and shows it", "pages in a dark space are dark", "Edit this space renames, recolors, changes
  the planet and the scheme", "its tab group takes the new name", "deleting it removes the space and closes its
  tab". Not checked in the browser: Cancel reverting the preview, the empty-name rule, and the editor from Settings.

## Gotchas

- The dialog keeps its own draft. The window re-sends the starting look on every render, so a dialog that read its
  prop directly would lose typing whenever the sky preview changed (this was a real bug).
- An empty name disables `Create space` / `Save`.
