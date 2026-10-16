# Loka on Windows, and what macOS needs

Loka ships on Windows today. This page lists everything that only works on Windows, so the macOS port can start from
a clear list instead of from failures. Linux matters for one thing now: cloud sessions (setup, checks and the
prototype run there).

## What runs where today

| | Windows | Linux (cloud VMs, CI) | macOS |
|---|---|---|---|
| `bun run setup`, `doctor`, `worktree:remove` | yes | yes | yes (untested) |
| `bun run check`, `bun run verify -- --fast` | yes | yes (CI runs `check` on Ubuntu) | yes (untested) |
| Prototype recipes (`verify-loka`, `bun run verify` prototype stage) | yes | yes, headless on the VM's Chromium | yes (untested) |
| `browser:setup/build/run`, `browser:package`, `release:alpha` | yes | exit 2: "Windows only today" | exit 2 |
| `verify:browser`, `verify:flows`, `verify:perf` | yes | skipped by `bun run verify` | skipped |

"Exit 2" is the repo's code for "couldn't run here": `bun run verify` reports it as SKIP, never as a pass.

## Windows-only today

**Repo and build**

- The repo is a fork of `imputnet/helium-windows`: `build.py`, `package.py`, `signing.py`, `installer/`,
  `downloads.ini` (winsparkle, gperf for Windows), `flags.windows.gn`, and `.github/workflows/build-*.yml` and
  `main.yml` (Windows runners) are Helium's Windows files.
- `scripts/loka_build.py` drives Helium's Windows `build.py`: `cmd.exe /k`, `vcvars`, `autoninja.py -C out\Default`.
- `scripts/browser.mjs`: the build checkout defaults to `C:\src\loka` (`~/src/loka` elsewhere), `browsersHoldingBuild`
  uses `Get-CimInstance` and `taskkill`. `requireWindowsBuild` makes setup, build, run and the drives exit 2 elsewhere.
- `bun run doctor --browser` checks Visual Studio 2026, the Windows SDK, long paths, Developer Mode and 7-Zip.
- `scripts/setup.mjs` fetches the `helium-chromium` submodule only on Windows.

**Packaging and release**

- `scripts/alpha/package_alpha.mjs`: `gn.exe desc`, `csc.exe` (.NET Framework) to build the launcher, `7z` for the
  zip, the `dist\snapshot` junction.
- `scripts/alpha/Loka.cs`: `Loka.exe`, a WinForms launcher that starts `app\chrome.exe` with the profile in
  `%LOCALAPPDATA%\Loka\User Data` and points Helium's updater at a Loka feed.
- `scripts/loka_brand.py` writes `.ico` files; `scripts/alpha/loka.ico`.
- `scripts/alpha/release_alpha.mjs` publishes `Loka-<version>-windows-x64.zip`.

**Verification**

- `scripts/window.ps1` (window titles, PrintWindow screenshots), `scripts/window-hittest.ps1` (WM_NCHITTEST), and
  `scripts/window-input.ps1` (posted WM_MOUSEMOVE/WM_LBUTTONDOWN, client DIPs).
- `scripts/browser-session.mjs`: `processTree` (PowerShell), `taskkill` cleanup, `chrome.exe` paths.
- `scripts/verify-browser.mjs`: the hit-test and real-click checks, `ProductName` read from `chrome.exe`.
- `.agents/skills/verify-loka/scripts/doctor.mjs` finds the port's owner with `Get-NetTCPConnection` (lsof on Linux).

**C++ (patches/loka)**

- `loka-native-sidebar.patch`, `HandleStartWindowDrag`: on Windows it hands the press to Windows' move loop
  (`ReleaseCapture` + `WM_NCLBUTTONDOWN, HTCAPTION`). The non-Windows branch uses views' `RunMoveLoop`; it has never
  been built or tried.
- The same patch's hit-test change (the sidebar column answers "page", its top row "caption") is written against the
  Windows frame. macOS has no WM_NCHITTEST; the window's draggable region comes from the frame view.
- `windowAction("minimize" | "maximize" | "close")` gives the sidebar its own window buttons; Windows has no native
  ones while the sidebar is the title bar.

**UI**

- 14 files under `webui/src` and `prototype/src` name `Segoe UI` first in their font stacks.
- Started already: `prototype/src/app/platform.ts` tells mac from Windows and Linux. On a Mac the sidebar's top row
  leaves 70 px for the traffic lights and draws no window buttons, and labels go through `keys()` ("Ctrl+H" shows
  as "⌘H"). The browser's own commands that the patch reroutes to the sidebar (new tab, focus location, in
  `browser_command_controller.cc`) follow Chrome's accelerators, which are already Cmd there. The sidebar page's key
  handler (`webui/src/main.ts`) accepts `metaKey` too. None of it has run on a Mac yet.

## What macOS needs

1. **A Helium base for macOS.** Helium's macOS build lives in `imputnet/helium-macos`, with its own build script,
   flags, signing and DMG packaging. Pick one: a second repo forked from `helium-macos` that takes `patches/loka`
   and `webui/` from this one (a submodule or a release artifact), or turn this repo into one Loka repo with a
   `platform/windows` and a `platform/macos` folder. Either way `patches/loka` stays the single home of Loka's C++.
2. **Build scripts.** A macOS branch in `loka_build.py` (Xcode toolchain, `autoninja -C out/Default`), a macOS
   `doctor --browser` (Xcode, the SDK, disk space, `xcode-select`), `BUILT_BINARY` = `out/Default/Loka.app/Contents/MacOS/Loka`
   (already in `scripts/browser.mjs`, unverified), and `requireWindowsBuild` widened per command as each one works.
3. **The window.** The page already hides its own buttons and leaves the traffic-light inset on a Mac. The frame
   still has to keep the traffic lights over the sidebar's top row, make that row the window's draggable region
   through the frame view, and drop the inset in full screen (where the lights hide). Build and try `RunMoveLoop`
   for `startWindowDrag`.
4. **Shortcuts.** The labels follow `keys()` already; check the page's own handlers take Cmd, and each rerouted
   browser command once on a mac build. Cmd+Q, Cmd+W and Cmd+, are macOS conventions to keep.
5. **Fonts.** `system-ui, -apple-system` ahead of `Segoe UI`.
6. **Packaging and release.** No `Loka.exe`: the `.app` bundle is the launcher, with `CFBundleName` Loka, an `.icns`
   from `loka_brand.py`, a DMG, codesigning and notarization (an Apple Developer ID, kept in GitHub secrets only),
   and the profile in `~/Library/Application Support/Loka`. Unsigned builds are blocked by Gatekeeper, so signing is
   not optional there the way SmartScreen is on Windows.
7. **Verification.** Mac equivalents of the PowerShell helpers: window titles and pictures (`screencapture -l
   <window id>` or CGWindowList), real input (CGEvent posted to the process), process trees (`ps -A -o pid,ppid`),
   and `kill` instead of `taskkill`. The hit-test check has no mac equivalent; check the draggable region instead.
8. **CI.** `macos-15` runners and Helium's macOS workflow, chained like the Windows build if it runs long.

Start with 1, since it decides where everything else lives.
