# Browser build

The real browser is Helium built in the build checkout (`C:\src\loka`) with Loka's patches (`patches/loka/`, at the
end of `patches/series`): the Loka name, the native sidebar and its handler, and the sidebar-only window layout.
The portable alpha zips that build with a `Loka.exe` launcher. What the sidebar does inside it is
[native-sidebar.md](./native-sidebar.md).

## Sub-features

- `browser-launch`: the dev build on a throwaway profile, with Loka's first-run defaults (`initial_preferences`).
- `browser-patches`: every C++ edit in `build\src` is captured in `patches/loka`; `bun run patches:check` proves it.
- `browser-status`: `bun run build:status` says whether an incremental build is running, its last error, and recent
  build times (`build-status.json`, `build-times.log` in the build checkout).
- `browser-alpha`: the portable zip from `bun run browser:package`: `Loka.exe`, `app\` and a README.

## How to get to it (user POV)

- `bun run browser:run` once `bun run browser:build` has finished. See `docs/browser-build.md`.
- The alpha: unzip `C:\src\loka\dist\Loka-<version>-windows-x64.zip`, run `Loka.exe`.

## Driving it

Preconditions: a built `chrome.exe`, and no build writing it (`bun run build:status`; during a build use
`C:\src\loka\dist\snapshot\chrome.exe` through `LOKA_CHROME`).

- **Gate.** `bun run verify:browser` (see [native-sidebar.md](./native-sidebar.md)): first run, sidebar, icons,
  sound, window titles, with screenshots.
- **Patches.** `bun run patches:check` exits 0 with `match patches/loka`, or lists each un-exported file and the
  `scripts/export_patch.py` command that captures it. `bun run browser:setup` runs the same check and refuses to
  sync on a difference.
- **Version.** Open `chrome://version` in a drive: Chromium 155 and the command line flags.
- **Alpha.** Unzip into two different folders and start each `app\chrome.exe` with Loka.exe's flags and a
  throwaway `--user-data-dir`. Check `devtools://devtools/bundled/devtools_app.html` loads, since the package leaves
  out `gen/`.

## Gotchas

- `browser:run` refuses to start without a finished build. A first build takes hours. Ask before starting one.
- Never point it at a real profile. `browser:run` uses `C:\src\loka\profile-dev`, `verify:browser` a fresh folder
  under `C:\src\loka\profile-verify` that it deletes.
- Don't test the alpha through `Loka.exe` with an extra `--user-data-dir`: Chrome keeps the first one, so it would
  use the real `%LOCALAPPDATA%\Loka\User Data`. Start `app\chrome.exe` directly instead.
- The screen is often off or locked during overnight runs, so a desktop screenshot is black. Use CDP page
  screenshots and `scripts/window.ps1` (PrintWindow).
- The build is a component build (about 550 DLLs). With 6 compile jobs on the 16 GB laptop it builds fastest; 8
  swaps and runs at half the speed. The measured incremental rebuild after a small C++ edit was 81 s; read
  `build-times.log` before quoting a build time.
