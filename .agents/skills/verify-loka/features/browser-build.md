# Browser build

The real browser is Helium built in the build checkout (`C:\src\loka`), with the Loka sidebar built in (`webui/`).
The portable alpha zips that build with a `Loka.exe` launcher.

## Sub-features

- `browser-launch` opens the dev build with a throwaway profile, the sidebar loaded and the first-run defaults.
- `browser-alpha` is the portable zip from `bun run browser:package`: `Loka.exe`, `app\` and a README.
- `browser-patches` applies Loka's patches on top of Helium's (none yet).

## How to get to it (user POV)

- `bun run browser:run` once `bun run browser:build` has finished. See `docs/browser-build.md`.
- The alpha: unzip `C:\src\loka\dist\Loka-<version>-windows-x64.zip`, run `Loka.exe`.

## Driving it with loka.mjs

Preconditions: `C:\src\loka\build\src\out\Default\chrome.exe` exists and `bun run webui:build` ran before the build.

- **Launch.** `bun run browser:run -- --remote-debugging-port=9340` starts it with `C:\src\loka\profile-dev`.
- **Drive.** `chromium.connectOverCDP("http://127.0.0.1:9340")` from Playwright. The sidebar is the WebUI page
  `chrome://loka-sidebar.top-chrome/`; it shows up as its own CDP target, so attach to it and drive it like the
  prototype (same accessible names). Real tabs are what the sidebar's own handles show.
- **Proof.** `chrome://version` shows Chromium 155 and the flags. On a fresh profile the sidebar lists every tab in a
  `Personal` space, Ctrl+T opens the command bar, and the Extensions panel lists uBlock Origin.
- **Alpha.** Unzip into a folder and start `app\chrome.exe` with Loka.exe's flags and a throwaway
  `--user-data-dir`: the sidebar must load. Check `devtools://devtools/bundled/devtools_app.html` loads, since the
  package leaves out `gen/`.

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
