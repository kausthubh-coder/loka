# Onboarding

The first-run tour, over the window's sky: welcome, choose browsers to import from, set up the first spaces (name,
color, planet), and three things to know, where Ctrl+K can be tried. Finishing edits the existing spaces in order
and adds any extra ones (never deleting one), puts imported bookmarks in the first space as closed folders and adds
Arc's spaces as new spaces. It shows once, and again on request.

## Sub-features

- `tour-first-run` shows when `loka.ui.v1` has no `onboarded: true` (and the URL has no `?skip-tour`).
- `tour-import`: each `Import from <browser>` button opens a file picker and parses the file (Chrome or Edge
  `Bookmarks`, Arc's `StorableSidebar.json`); the button below says how many browsers are ready.
- `tour-spaces` edits up to five spaces (`Add a space`, `Remove <name>`); clicking a planet cycles its kind; the sky
  follows the focused space's color. Spaces left without a name are dropped on finish.
- `tour-try-keys` marks Ctrl+K `Done` when pressed, without opening the command bar.
- `tour-finish` applies the spaces, switches to the first, and saves `onboarded: true`. `Skip` saves it and changes
  nothing else.

## How to get to it (user POV)

- First launch. Later: `...` > `Show the welcome tour`, or Ctrl+K > `Show the welcome tour`. In the real browser
  that opens Loka's setup (`chrome://setup`) instead: see native-sidebar.md.

## Driving it with loka.mjs

Preconditions: `openLoka(name, { onboarding: true })` (the recipe runner does this for the recipes in
`tourRecipes`).

- **Through.** `Get started`; `Import from Chrome` with `fixtures/Bookmarks` and `Import from Arc` with
  `fixtures/StorableSidebar.json` (the recipe's `choose` answers the file picker); `Import from 2 browsers`; fill `Space 1 name` with `Code`;
  in radiogroup `Space 1 color` click `Hue 260`; click `Code: change planet...`; `Next`; press Ctrl+K and wait for
  `Done`; `Open Loka`. The first space is `{ name: "Code", hue: 260, planet: "cratered" }`.
- **Once.** Reload: no `loka-onboarding` element.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs onboarding`.
- **In the browser.** The real first run is Loka's setup (`chrome://setup`), not this tour.
  `bun run verify -- --ux onboarding` runs the recipe, verify:browser ("first run opens only Loka's setup", 'the only window is "Welcome to
  Loka"', "setup draws its own Minimize and Close", "the setup window has no title bar", "setup's Minimize minimizes
  the window", '"Use defaults" finishes setup', "no setup or helium:// page left") and verify:flows `first-run`: "setup's
  orbit shows the three spaces", "the sidebar has exactly setup's spaces", "with setup's colors and planets", "its
  tab is in a tab group named Research". Add `bun run verify:browser -- --no-first-run` to check setup stays away.
  Not checked in the browser: setup's import step, reopening setup later, Skip, dragging the setup window by its top
  bar (it needs a real mouse press, which posted messages don't make) and its Close.

## Gotchas

- Each step fades in. On a busy machine the first frame can take over a second, so wait for
  `shadowRoot.getAnimations()` to be empty before a screenshot (the recipe's `settled()`), not a fixed delay.
- While the tour shows, the sidebar and page are `visibility: hidden`, so locators into them wait.
