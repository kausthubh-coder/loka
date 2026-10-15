# The sidebar in the real browser

`extension/`: the prototype's sidebar, command bar, space editor, Settings and tour in Chromium's side panel and new
tab page, on real tabs. A background worker keeps spaces and tabs in step: each space's live tabs sit in a tab group
named after it, other spaces' groups fold away, and switching to an empty space opens a new tab there.

## Sub-features

- `ext-adopt`: tabs already open when Loka starts join the current space; matching pinned tabs are linked by address.
- `ext-groups`: live tabs grouped by space; switching folds the others.
- `ext-command`: the command bar opens addresses and searches (with the user's search engine) in a new tab; on the
  new tab page, in that tab.
- `ext-close`: closing an open tab in the sidebar closes the browser tab; unloading a pinned tab closes it but keeps
  the row.
- `ext-panels`: real downloads, installed extensions, real favicons.
- `ext-sync`: Settings > Sync, a folder of encrypted per-computer files.

## How to get to it (user POV)

- In the Loka build: `bun run browser:run` (loads `extension/dist`). Anywhere else: `chrome://extensions` > Load
  unpacked > `extension/dist`, then the Loka button or Alt+L.

## Driving it

Preconditions: `bun run ext:build`, and the prototype's dev server running (its pages stand in for websites).

- **Recipe.** `node extension/test/e2e.mjs`. It launches Playwright's Chromium with the extension, opens two sites,
  opens `sidebar.html` as a tab (a test can't open the side panel), and checks: tabs listed, grouped as `Personal`,
  Ctrl+K opens a real tab, a new space `Work` folds `Personal` and opens a tab in a `Work` group, the close button
  closes a real tab, and the new tab page shows the command bar. Screenshots go to `.agents/verify-runs/<time>-extension/`.
- Inspect real state from any extension page with `chrome.tabs.query({})`, `chrome.tabGroups.query({})`, and
  `chrome.storage.local.get("loka.state.v1")` / `chrome.storage.session.get(null)` (the tab links).

## Gotchas

- Each headless Chromium is about 0.4 GB. On the 16 GB laptop, don't run the test while the Chromium build is
  linking: running browsers on top of a 6-job build took free RAM to about 0.2 GB and crashed the machine twice.
- The sidebar page opened as a tab is itself a tab, so it shows in its own open list ("Loka"). The side panel isn't.
- Folder sync can't be driven headless: the folder picker needs a real click. Its encryption is unit tested.
- `--load-extension` works in Loka (a non-Google build); Google Chrome ignores it.
- A tab's icon is the one its page declared (`favIconUrl`, fed to the sidebar as `LiveTab.icon` from `panel.ts`);
  the favicon cache (`_favicon?pageUrl=`) is only for tabs not loaded since the sidebar opened. To prove an icon is
  real, draw the row's `<img>` to a canvas and compare it with the cache's answer for an address never visited,
  which is the default globe.
