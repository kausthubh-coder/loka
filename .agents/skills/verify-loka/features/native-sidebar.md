# The sidebar in the real browser

The built browser's left column is a built-in page, `chrome://loka-sidebar.top-chrome`, built from `webui/` and
answered by `LokaSidebarHandler` (C++ in `patches/loka/loka-native-sidebar.patch`). It shows the window's real tabs
with their own icons and sound, keeps spaces in the profile (`state.v1` in the `loka.store` pref, shared by every
window), and acts as the title bar. A first run opens Loka's setup (`chrome://setup`) in its own window before any
browser window. The UI is never delivered as an extension: the old `extension/` sidebar is legacy and proves
nothing about the browser.

## Sub-features

- `native-first-run`: a fresh profile shows only setup ("Welcome to Loka"); "Use defaults" or Finish opens the normal
  window with the sidebar. `--no-first-run` skips setup.
- `native-tabs`: every tab in the window is a row; tabs opened from outside the sidebar join the current space.
- `native-favicon`: a loaded tab's row shows its page's own icon (a data: URL from `getTabs`); an unloaded one asks
  the favicon cache (`chrome://favicon2`), which answers the default globe when it knows nothing.
- `native-sound`: a tab playing sound gets a speaker on its row; it goes about two seconds after the sound stops.
- `native-media`: the playing tab is in `getMedia`; `mediaAction` pause and play switch it like the page's controls.
- `native-extensions`: `getExtensions` lists installed extensions with their toolbar icon and pinned state; the
  sidebar's Extensions panel shows the same ones.
- `native-downloads`: `getDownloads` lists real downloads; `downloads-changed` fires as they progress.
- `native-scheme`: `setColorScheme` light or dark changes `prefers-color-scheme` for pages.
- `native-pinning`: `setSidebarPinned(false)` lets the sidebar slide away; `getSidebarPinned` reads it back.
- `native-suggest`: `suggest(query)` answers through the `suggestions` event, a search first for plain words.
- `native-window`: the window is titled "<tab> - Loka", chrome.exe's ProductName is "Loka", never Chromium or
  Helium; no horizontal tab strip or toolbar.
- `native-alpha-import`: `...` > `Import spaces (JSON)` takes a 0.1.0 alpha export and leaves out the alpha's own
  extension pages.
- `native-messages`: every `chrome.send` name the page uses is in `webui/src/messages.ts`, checked against the
  handler by `webui/src/messages.test.ts`.

## How to get to it (user POV)

- `bun run browser:run` (profile `C:\src\loka\profile-dev`), or `bun run verify:browser` for a throwaway profile.
- After changing `webui/`: `bun run webui:build` copies the page into the build checkout; the next
  `bun run browser:build` packs it.

## Driving it

Preconditions: a built `chrome.exe`. While a build runs, `out\Default` is busy (linking fails on a running binary):
use the copy `C:\src\loka\dist\snapshot\chrome.exe` through `LOKA_CHROME`. `bun run build:status` says whether a
build is running.

- **Recipe.** `LOKA_CHROME=C:\src\loka\dist\snapshot\chrome.exe bun run verify:browser` covers every sub-feature
  above; add `-- --no-first-run` to check setup stays away. It prints `PASS`/`FAIL`/`NOTE` per
  check and leaves `checks.json`, `startup-targets.json`, `rows.json`, `setup.png`, `sidebar.png`, `window.png` and
  `chrome.log` in `.agents/verify-runs/<time>-browser/`. It stops only its own process tree and deletes its profile.
- **User flows.** `LOKA_CHROME=C:\src\loka\dist\snapshot\chrome.exe bun run verify:flows` drives what a user does,
  in order on one fresh profile: setup's Spaces step, spaces (make, edit, delete, switch by planet, Ctrl+1..9 and the
  command bar, each space's tab group folding), tabs (command bar, rows, x, middle click, drag, move, Ctrl+L, back,
  forward, reload), hover, press and focus states, pinning, folders two deep, unload and reload, Essentials,
  extensions (a second test extension with a popup and a badge is loaded), Downloads, media card, Archive, Search,
  Settings, History, and a restart. Each check reads both the sidebar and the browser (getTabs, getGroups,
  getExtensions, targets). Evidence per flow in `.agents/verify-runs/<time>-flows/<flow>/`: a picture and the saved
  spaces per step, window pictures, `failed.png`/`failed.json` where a flow stopped, and `checks.json`. Its CDP
  helpers live in `scripts/browser-session.mjs`, shared with verify:browser.
- **Your webui changes, no browser build.** `bun run verify:flows -- --webui=checkout` runs the same flows with this
  checkout's `webui/src` in the sidebar (after each launch, the restart's too), the command bar, Settings and History,
  through `useCheckoutWebui`. Setup stays the build's. A failure here can be your webui or the build's handler.
- **Your own drive.** Start chrome.exe with `--user-data-dir` under `C:\src\loka\profile-verify`,
  `--remote-debugging-port=<free port>` and `--disable-features=CalculateNativeWinOcclusion`. The sidebar target
  (type `browser_ui`) appears in `/json/list` once the window has a normal tab; connect to its
  `webSocketDebuggerUrl` and use `Runtime.evaluate`. Playwright's `connectOverCDP` doesn't list it.
- **Real data from the handler.** In the sidebar, wrap `window.cr.webUIResponse` for one callback id and call
  `chrome.send("getTabs", [id])`; the `GET_TABS` snippet in `scripts/verify-browser.mjs` does this. Rows are
  `[role=treeitem]` elements inside the shadow roots of `loka-panel` and `loka-sidebar`.
- **Whole window.** `powershell -File scripts/window.ps1 -ProcId <pid> -Out <png>` lists the process's window
  titles and captures one with PrintWindow, which works with the screen off.

## Gotchas

- CDP's synthetic keys reach the page but skip the browser's own shortcuts, so a drive can't press Ctrl+T or Ctrl+L
  as accelerators: call `chrome.send("openCommandBar", ["new-tab"])`, which is the handler they both run. Keys the
  sidebar page handles itself (Ctrl+K, Ctrl+L, Ctrl+1..9, Ctrl+H, Escape) do arrive. The flip side: a real keyboard
  can behave differently from a drive. Escape closes the Downloads panel under CDP but not with a real key.
- A sidebar picture taken during a fade shows panels half see-through; verify:flows waits for animations first.

- Until a normal tab exists there is no sidebar target, so a drive that starts on setup must finish setup first.
- A file input opens its picker only from a user gesture: evaluate the click with `userGesture: true`, and catch the
  picker with `Page.setInterceptFileChooserDialog` plus `DOM.setFileInputFiles`. The import reports a bad file with
  `alert()`, which stalls the page until `Page.handleJavaScriptDialog` answers it.
- Downloads go to the user's Downloads folder unless `Browser.setDownloadBehavior` points them into the profile.
- Chrome gives a media session only to media of 5 s or more, so a test tone shorter than that never reaches
  `getMedia`.
- Setup's text credits Helium ("Loka is built on Helium and uses Helium's services"); verify:browser lists it as a
  NOTE for a person to judge.
- Each Chromium is about 0.4 GB. On the 16 GB laptop, never drive it while the build is linking.
