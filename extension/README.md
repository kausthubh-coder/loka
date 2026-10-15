# Loka sidebar as a browser extension (legacy)

This folder is the sidebar the 0.1.0 alpha shipped: the prototype's components in Chromium's side panel and new tab
page, on real tabs. It is legacy and will be deleted. Loka's UI now ships inside the browser as
`chrome://loka-sidebar.top-chrome`, built from `webui/` with C++ in `patches/loka/`; an extension is never how Loka
delivers its UI. Nothing here proves anything about the browser. Use `bun run verify:browser` for that.

```
bun run ext:build            # builds extension/dist
node extension/test/e2e.mjs  # drives it in Playwright's Chromium (needs `bun run dev` for stand-in sites)
```

## How it fits together

| Piece | What it does |
|---|---|
| `src/background.ts` | Keeps spaces and real tabs in step, one tab group per space. |
| `src/panel.ts` | The side panel: the prototype's `<loka-sidebar>` plus command bar and space editor. |
| `src/pages.ts` | The new tab page, Settings and the tour. |
| `src/browser.ts` | Downloads, installed extensions, bookmarks and search through `chrome.*` APIs. |
| `src/store.ts` | The spaces in `chrome.storage.local` under `loka.state.v1`. |

The tab-sync rules it shares with the native sidebar live in `prototype/src/features/tabs/live.logic.ts`.

## Moving off it

The built-in sidebar can't read this extension's storage. Users export their spaces from this sidebar (`...` >
`Export spaces (JSON)`) and import them in the new build; the import drops this extension's own pages.
