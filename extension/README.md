# Loka sidebar (browser extension)

The prototype's sidebar, command bar, space editor, Settings and tour, running inside a Chromium browser on real
tabs. Loka loads it into its own build; it also runs in Chrome, Edge or Helium as an unpacked extension.

```
bun run ext:build            # builds extension/dist
node extension/test/e2e.mjs  # drives it in Chromium against real tabs (needs `bun run dev` for stand-in sites)
```

Load it by hand: `chrome://extensions` > Developer mode > Load unpacked > `extension/dist`. Click the Loka button
(or Alt+L) to open the side panel.

## How it fits together

| Piece | What it does |
|---|---|
| `src/background.ts` | Keeps spaces and real tabs in step. Each space's live tabs sit in a tab group named after it; other spaces' groups fold away. |
| `src/live.logic.ts` | The pure part: browser events -> spaces, and spaces -> a plan of tab operations. Unit tested. |
| `src/panel.ts` | The side panel: the prototype's `<loka-sidebar>` plus command bar and space editor. |
| `src/pages.ts` | The new tab page (the command bar on the sky), Settings, and the tour. |
| `src/browser.ts` | Real downloads, installed extensions, bookmarks, search with the user's engine, browser settings pages. |
| `src/store.ts` | The spaces in `chrome.storage.local` (shared by every page); runtime links in `chrome.storage.session`. |

Two rules keep the browser and Loka from fighting (see the top of `background.ts`): only a Loka page moves the
browser's focus, and every background job saves from freshly read spaces before any slow browser call.

## Not done yet

- Hiding the browser's own tab strip needs a Chromium patch; for now Helium's vertical tabs sit collapsed on the
  right.
- Previous/next track: pages don't expose their media session to other pages; the real fix is a Loka mojo
  handler over Chromium's media sessions (see the first-release plan).
- Sync, and keyboard shortcuts outside the side panel beyond Alt+L.
