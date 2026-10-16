# Extensions

The pinned extensions sit inside the sidebar's address field with their real icons and badges; clicking one asks the
browser to open its popup (`runExtension`). The real browser opens it beside the sidebar, level with its top; only the
prototype's stand-in uses the button's rect. The puzzle button opens the
Extensions panel: every installed extension, click to run it, pin or unpin it (`setExtensionPinned`), or manage them
in the browser. With none installed, the panel says so and offers the Chrome Web Store. Right-clicking an extension,
in the address field or the panel, opens its own menu (`extensionAction`).

## Sub-features

- `extensions-toolbar`: up to three pinned ones in the address field; a narrow sidebar hides whole buttons.
- `extensions-run`: the popup opens (at the button's rect in the prototype, beside the sidebar in the browser).
- `extensions-manage`: the panel's `Manage` button opens `chrome://extensions/`.
- `extensions-pin`: pinning shows at once, then follows `extensions-changed`.
- `extensions-empty`: the empty state with "Get extensions".
- `extensions-menu`: right-click (or the context-menu key, or Shift+F10 on a focused icon) opens a menu headed with
  the extension's name: `Pin to address bar` or `Unpin from address bar`, `Options` (only when `hasOptions`),
  `Manage extension` (chrome://extensions/?id=<id>) and `Remove from Loka…` (Chrome's own uninstall dialog, then
  `extensions-changed`).

## How to get to it (user POV)

- The icons on the right of the address field, and the puzzle button next to them. Settings > Extensions too.

## Driving it with loka.mjs

Preconditions: the fake browser has five extensions; uBlock Origin and `Bitwarden Password Manager` are pinned.

- **Run.** Click the `uBlock Origin` button: `runExtension` is logged with the button's x and y, and the
  `uBlock Origin popup` dialog (the prototype's stand-in) shows.
- **Pin.** Open `Extensions`, click `Pin Dark Reader`: a `Dark Reader` button joins the address field.
- **Menu.** Right-click `uBlock Origin`: `getByRole("menu", { name: "uBlock Origin" })` has the four items;
  `Manage extension` logs `extensionAction` with `manage`. Bitwarden has no `Options`. The fake takes the yes on
  `remove` and drops the extension.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs extensions`.
- **In the browser.** `bun run verify -- --ux extensions` runs it, verify:browser ("getExtensions has uBlock Origin,
  pinned, with its icon", "the sidebar's Extensions panel lists exactly those") and verify:flows `extensions`, which
  loads a test extension with a popup and a badge: "the Extensions panel lists both", "pinning puts its icon in the
  address field", "its badge text reaches the sidebar", "clicking it opens its popup", "right-clicking its icon
  opens its own menu", "Manage extension opens its chrome://extensions page", "Shift+F10 on the focused icon opens
  the menu too", "Options opens its options page", "unpinning takes the icon out of the address field". Not checked
  in the browser: where the popup sits, `Open <name>` rows and their menu, the three-pin cap, the panel's
  `Manage`, `Remove from Loka…` (Chrome's dialog is a window the run can't answer) and the empty state.

## Gotchas

- Panel rows are named `Open <name>` so they don't clash with the pinned buttons, named `<name>`.
- Until the real browser answers `getExtensions` the address field just shows no extensions.
- Chrome opens an options page in the window's empty tab when there is one, not in a new tab.
- Close a tab a flow opened with its row's `Close <title>`, not a raw `closeTab`: closing a window's last tab quits
  the browser, and the sidebar's own close keeps that from happening.
