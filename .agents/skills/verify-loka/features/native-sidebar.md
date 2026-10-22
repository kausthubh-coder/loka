# The sidebar in the real browser

The built browser's left column is a built-in page, `chrome://loka-sidebar.top-chrome`, built from `webui/` and
answered by `LokaSidebarHandler` (C++ in `patches/loka/loka-native-sidebar.patch`). It shows the window's real tabs
with their own icons and sound, and is the window's title bar. The spaces belong to `LokaSpacesService` in the
browser: it saves them in the profile ("Loka Spaces.json", the archive in "Loka Archive.json"; a first run takes them
from the old `state.v1` in the `loka.store` pref) and keeps every window's tabs in step. Pages read them with
`getSpaces` and change them with intents (`spacesDo`); settings stay in `ui.v1` in the `loka.store` pref. A first run opens Loka's setup (`chrome://setup`) in its own window
before any browser window. The UI is never delivered as an extension.

## Sub-features

- `native-first-run`: a fresh profile shows only setup ("Welcome to Loka"); "Use defaults" or Finish opens the normal
  window with the sidebar. `--no-first-run` skips setup.
- `native-setup-frame`: on Windows the setup window has no title bar. The page fills it and draws Minimize and Close
  in its top bar (`windowAction`), and the bar's empty space moves the window (`startWindowDrag`). Its top strip
  answers WM_NCHITTEST as page, and its top edge still resizes. On macOS, and for setup opened in a tab, the page asks
  `getWindowFrame`, gets "system" and draws none of these.
- `native-tabs`: every tab in the window is a row; tabs opened from outside the sidebar join the current space. The
  sidebar calls `syncTabs`, then hears only what changed (`tabs-changed`: changed tabs, removed ids, the order when it
  changes), at most once a frame.
- `native-spaces`: the sidebar gets the spaces and its window's links once (`getSpaces`), then only what changed
  (`spaces-changed`, `links-changed`). A click is drawn at once and sent as an intent; the browser's answer carries the
  intent's number (`ack`). `getSpaces().state` is what tests read for the saved spaces.
- `native-favicon`: a loaded tab's row shows its page's own icon, an image the sidebar's own host serves
  (`chrome://loka-sidebar.top-chrome/tab-icon/<tab>-<version>@<scale>.png`, the `favicon` in `getTabs`); an unloaded
  one asks the favicon cache (`chrome://favicon2`), which answers the default globe when it knows nothing.
- `native-sound`: a tab playing sound gets a speaker on its row; it goes about two seconds after the sound stops.
- `native-media`: the playing tab is in `getMedia`; `mediaAction` pause and play switch it like the page's controls.
- `native-extensions`: `getExtensions` lists installed extensions with their toolbar icon and pinned state; the
  sidebar's Extensions panel shows the same ones.
- `native-downloads`: `getDownloads` lists real downloads; `downloads-changed` fires as they progress.
- `native-scheme`: `setColorScheme` light or dark changes `prefers-color-scheme` for pages.
- `native-pinning`: `setSidebarPinned(false)` lets the sidebar slide away; `getSidebarPinned` reads it back.
- `native-suggest`: `suggest(query)` answers through the `suggestions` event, a search first for plain words.
- `native-window`: the window is titled "<tab> - Loka", chrome.exe's ProductName is "Loka", never Chromium or
  Helium.
- `native-hit-test`: every point of the sidebar column answers Windows' WM_NCHITTEST as page (HTCLIENT), so real
  mouse input reaches it; only the empty top row drags the window (`startWindowDrag`).
- `native-real-click`: a click posted to the window as WM_LBUTTONDOWN/UP lands on a row and switches tab.
- `native-alpha-import`: `...` > `Import spaces (JSON)` takes a 0.1.0 alpha export and leaves out the alpha's own
  extension pages.
- `native-restart`: spaces, pinned tabs, folders, Essentials, extension pins and settings survive quitting and
  starting again, and each reopened tab goes back to its own space.
- `native-messages`: every `chrome.send` name the page uses is in `webui/src/messages.ts`, checked against the
  handler by `webui/src/messages.test.ts` (in `bun run check`).

## How to get to it (user POV)

- `bun run browser:run` (profile `C:\src\loka\profile-dev`), or `bun run verify:browser` for a throwaway profile.
- After changing `webui/`: `bun run webui:build` copies the page into the build checkout; the next
  `bun run browser:build` packs it.

## Driving it

Preconditions: Windows and a built browser. The suites pick the binary themselves (`testBinary()` in
`scripts/browser.mjs`): `LOKA_CHROME`, else `out\Default` when no build is writing it, else
`C:\src\loka\dist\snapshot\chrome.exe`, the last packaged alpha (it can be older than the dev build). `bun run
build:status` says which, and why.

- **One command.** `bun run verify -- --ux native-sidebar` runs verify:browser, then all of verify:flows.
- **verify:browser.** `bun run verify:browser` (about 30 s) covers every sub-feature above except `native-restart`
  and `native-messages`; add `-- --no-first-run` to check setup stays away. It prints `PASS`/`FAIL`/`NOTE` per check
  and leaves `checks.json`, `version.json`, `startup-targets.json`, `rows.json`, `extensions.json`,
  `extensions-panel.txt`, `setup.png`, `sidebar.png`, `window.png`, `sidebar-pinned-*.png` and `chrome.log` in
  `.agents/verify-runs/<time>-browser/`. It stops only its own process tree and deletes its profile.
- **verify:flows.** `bun run verify:flows` (several minutes) drives what a user does, in order on one fresh profile:
  setup's Spaces step, spaces, tabs, hover/press/focus states, pinning and folders, extensions (with a test
  extension that has a popup and a badge), panels (Downloads, media card, Archive, Search), Settings and History,
  and a restart. `-- --only <flow>[,<flow>]` runs some after the flows they build on. Each check reads both the
  sidebar and the browser (getTabs, getGroups, getExtensions, targets). Evidence per flow in
  `.agents/verify-runs/<time>-flows/<flow>/`: a picture and the saved spaces per step, `failed.png`/`failed.json`
  where a flow stopped, and `checks.json`.
- **Your webui changes, no browser build.** `bun run verify:flows -- --webui=checkout` runs the same flows with this
  checkout's `webui/src` in the sidebar (after each launch, the restart's too), the command bar, Settings and History,
  through `useCheckoutWebui`. Setup stays the build's. A failure here can be your webui or the build's handler.
- **Performance.** `bun run verify:perf` (`-- --webui=checkout` for this checkout's pages, `--runs N`, `--trace`,
  `--blame` to pause each animation in turn) checks idle CPU, a 150-row scroll, space switches and the command bar
  against the budgets atop `scripts/verify-perf.mjs`. Read its machine-load line first: another Chromium skews it.
  `--heavy` is the 300-tab case (100 loaded pages over three spaces) and adds churn (20 background pages retitling)
  and clicks; every scenario counts the sidebar's messages, and `--bytes` sizes them in a run of its own (sizing
  costs CPU). A change to the sidebar model, the handler or the sync is proven on `--heavy`, not only the default.
- **Your own drive.** Start chrome.exe with `--user-data-dir` under `C:\src\loka\profile-verify`,
  `--remote-debugging-port=<free port>` and `--disable-features=CalculateNativeWinOcclusion`. The sidebar target
  (type `browser_ui`) appears in `/json/list` once the window has a normal tab; connect to its
  `webSocketDebuggerUrl` and use `Runtime.evaluate`. Playwright's `connectOverCDP` doesn't list it. The helpers are
  in `scripts/browser-session.mjs`.
- **Real data from the handler.** In the sidebar, `askExpression("getTabs")` from `scripts/browser-session.mjs`
  wraps `window.cr.webUIResponse` for one callback id and calls `chrome.send`. Rows are `[role=treeitem]` elements
  inside the shadow roots of `loka-panel` and `loka-sidebar`.
- **Real input.** `scripts/window-hittest.ps1 -ProcId <pid> -Points "x,y;..."` asks the window what Windows asks
  before every real mouse event (physical client px; 1 page, 2 title bar). `scripts/window-input.ps1 -ProcId <pid>
  -Kind move|click|rclick|drag -X -Y [-X2 -Y2]` posts mouse messages in client DIPs; post a `move` first and read the
  page's `mousemove` clientX/Y to find where the sidebar sits. See verify-browser's real-click check.
- **Whole window.** `powershell -File scripts/window.ps1 -ProcId <pid> -Out <png>` lists the process's window
  titles and captures one with PrintWindow, which works with the screen off.

## Gotchas

- CDP's Input events start inside the page: they skip Windows' hit test and Chromium's Win32 input path. A CDP click
  passes on a sidebar a real mouse would drag the window from. Anything about the top row, the frame or input needs
  the hit-test and real-click checks.
- CDP's synthetic keys reach the page but skip the browser's own shortcuts, so a drive can't press Ctrl+T or Ctrl+L
  as accelerators: call `chrome.send("openCommandBar", ["new-tab"])`, which is the handler they both run. Keys the
  sidebar page handles itself (Ctrl+K, Ctrl+L, Ctrl+1..9, Ctrl+H, Escape) do arrive. A real keyboard can still
  differ: Escape closes the Downloads panel under CDP but not with a real key.
- Not checked by any suite: `windowAction` (Minimize, Maximize, Close), dragging by the top row (`startWindowDrag`),
  `downloadAction`, `setThemeColor`, `ungroupTabs`, and tabs opened from outside the sidebar joining the space.
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
- Each Chromium is about 0.4 GB. On the 16 GB laptop, never drive it while the build is linking, and never leave a
  browser running from `out\Default`: the next link fails on its locked files.
