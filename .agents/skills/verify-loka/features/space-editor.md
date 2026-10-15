# Space editor

A dialog to create a space or change one: its name, one of eight colors, and one of four planets (gas giant, ringed,
moon, ocean world), with a live preview. The window's sky follows the chosen color while the dialog is open.

## Sub-features

- `space-create` makes a space with the chosen look and switches to it. The name starts as `Space N`.
- `space-edit` changes the look of an existing space; its tabs stay.
- `space-delete`: in an edit, `Delete space` then `Delete it and its tabs` removes the space with its pinned, folder
  and open tabs (the browser closes them); the next space along shows. The only space has no Delete button.
- `space-preview` tints the window with the chosen color before saving; Cancel or Escape puts it back.

## How to get to it (user POV)

- Click the big planet on the horizon: `New space` or `Edit this space`.
- `...` > `New space`; Ctrl+K > `New space` or `Edit this space`; Settings > Spaces > `Edit` or `New space`.

## Driving it with loka.mjs

Preconditions: seed data.

- **Create.** Click `Spaces: Build`, then `menuItem("New space")`. In `getByRole("dialog", { name: "New space" })`,
  fill the `Space name` textbox, click `Hue 330`, click `Moon`, click `Create space`. The last space in `state()` is
  `{ name, hue: 330, planet: "cratered" }`, and it's the current space.
- **Edit.** `Spaces: <name>` > `Edit this space`. The dialog is named `Edit <old name>`. Change and click `Save`.
- **Delete.** `Spaces: <name>` > `Edit this space` > `Delete space` > `Delete it and its tabs`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs space-editor`. In the browser: `bun run verify:flows`
  (flow 2).

## Gotchas

- The dialog keeps its own draft. The window re-sends the starting look on every render, so a dialog that read its
  prop directly would lose typing whenever the sky preview changed (this was a real bug).
- An empty name disables `Create space` / `Save`.
