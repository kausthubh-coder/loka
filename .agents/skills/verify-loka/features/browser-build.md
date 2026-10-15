# Browser build

The real browser is Helium built in the build checkout (`C:\src\loka`), with the Loka sidebar loaded as an extension.
It carries no Loka patches yet. The portable alpha zips that build with a `Loka.exe` launcher.

## Sub-features

- `browser-launch` opens the dev build with a throwaway profile, the sidebar loaded and the first-run defaults.
- `browser-alpha` is the portable zip from `bun run browser:package`: `Loka.exe`, `app\` and a README.
- `browser-patches` applies Loka's patches on top of Helium's (none yet).

## How to get to it (user POV)

- `bun run browser:run` once `bun run browser:build` has finished. See `docs/browser-build.md`.
- The alpha: unzip `C:\src\loka\dist\Loka-<version>-windows-x64.zip`, run `Loka.exe`.

## Driving it with loka.mjs

Preconditions: `C:\src\loka\build\src\out\Default\chrome.exe` exists and `bun run ext:build` has run.

- **Launch.** `bun run browser:run -- --remote-debugging-port=9340` starts it with `C:\src\loka\profile-dev`.
- **Drive.** `chromium.connectOverCDP("http://127.0.0.1:9340")` from Playwright. The side panel isn't a page a test
  can open, so open `chrome-extension://<id>/sidebar.html` as a tab, as `extension/test/e2e.mjs` does, and read real
  state with `chrome.tabs.query` and `chrome.tabGroups.query` from it.
- **Proof.** `chrome://version` shows Chromium 155 and the flags. On a fresh profile the tour (`onboarding.html`)
  opens, the sidebar lists every tab in a `Personal` group, `chrome.management.getAll()` lists Loka and uBlock
  Origin, and `chrome://newtab` is the command bar.
- **Alpha.** Unzip into two different folders and start each `app\chrome.exe` with Loka.exe's flags and a
  throwaway `--user-data-dir`: both must load the sidebar as `kklllonkklkjgekkpeboddibgbjadkej` (pinned by `key` in
  `extension/public/manifest.json`). Check `devtools://devtools/bundled/devtools_app.html` loads, since the package
  leaves out `gen/`.

## Gotchas

- `browser:run` refuses to start without a finished build. A first build takes hours. Ask before starting one.
- Never point it at a real profile. It always uses `C:\src\loka\profile-dev`.
- Don't test the alpha through `Loka.exe` with an extra `--user-data-dir`: Chrome keeps the first one, so it would
  use the real `%LOCALAPPDATA%\Loka\User Data`. Start `app\chrome.exe` directly instead.
- The screen is often off or locked during overnight runs, so a desktop screenshot is black. Use CDP page
  screenshots.
- Helium's own first-run page (`chrome://setup`) opens beside Loka's tour.
- The build is a component build (about 550 DLLs). With 6 compile jobs on the 16 GB laptop it builds fastest; 8
  swaps and runs at half the speed.
