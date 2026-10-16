# Loka

Loka is an open-source browser in the style of Arc and Zen, built on [Helium](https://github.com/imputnet/helium)
(ungoogled-chromium). Tabs live in spaces. Each space has pinned tabs in folders that can hold more folders, and
its own list of open tabs. An Essentials grid at the top is shared by every space.

Status: early, Windows first. The sidebar is built into the browser (Loka's patches in `patches/loka/`) and also
runs as a clickable web prototype.

## Try the sidebar prototype

Needs [bun](https://bun.sh).

```
bun run setup   # install deps, pick a free port
bun run dev     # open the printed localhost URL
```

Drag tabs between Essentials, pinned folders and open tabs. Right-click for more. `Ctrl K` opens a tab and
`Ctrl 1` to `Ctrl 9` switch spaces. The prototype saves to localStorage, and the `...` menu exports or imports
spaces as JSON.

## Coming from the 0.1.0 alpha

The alpha's sidebar was an extension, and the built-in sidebar can't read an extension's storage. To keep your
spaces, open the alpha's sidebar first, choose `...` > `Export spaces (JSON)`, then in the new build choose `...` >
`Import spaces (JSON)` and pick that file. The import keeps your spaces, folders and tabs and drops the alpha's own
pages (its sidebar, tour and settings tabs), which don't exist in the new build.

## Build the browser

See [docs/browser-build.md](docs/browser-build.md). The short version: Visual Studio 2026, about 100 GB free
outside OneDrive, then `bun run browser:setup` and `bun run browser:build`. The first build takes hours.

## How this repo is laid out

This repo is a fork of [helium-windows](https://github.com/imputnet/helium-windows) and keeps its history, so
each new Helium release merges in (see [docs/upstream.md](docs/upstream.md)). Helium's files (`build.py`,
`patches/`, `helium-chromium/`) stay where Helium has them. Loka adds `patches/loka/`, `prototype/`,
`scripts/` and `docs/`.

## License

GPL-3.0, like Helium. See [LICENSE](LICENSE). Code imported unchanged from ungoogled-chromium keeps its BSD
license ([LICENSE.ungoogled_chromium](LICENSE.ungoogled_chromium)).
