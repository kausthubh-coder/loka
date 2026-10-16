# Browser build

The real browser is Helium built in the build checkout (`C:\src\loka`) with Loka's patches (`patches/loka/`, at the
end of `patches/series`): the Loka name, the native sidebar and its handler, the sidebar-only window layout, the setup
window and Loka's onboarding. The portable alpha zips that build with a `Loka.exe` launcher. What the sidebar does
inside it is [native-sidebar.md](./native-sidebar.md). Windows only today (`docs/cross-platform.md`).

## Sub-features

- `browser-launch`: the dev build on `profile-dev`, with Loka's first-run defaults (`initial_preferences`). It
  refuses while a build writes `out\Default`.
- `browser-patches`: every C++ edit in `build\src` is captured in `patches/loka`; `bun run patches:check` proves it.
- `browser-shared`: one build at a time (`build.lock`, held by the build's pid); `browser:build` refuses while
  browsers run from `out\Default` and lists them (`-- --stop-test-browsers` stops the ones on throwaway profiles);
  `browser:setup` refuses under a running build and on unexported edits.
- `browser-status`: `bun run build:status` says whether a build is running, its last error, recent build times, the
  lock, the browsers holding `out\Default`, and which binary tests drive.
- `browser-alpha`: `LOKA_VERSION=<v> bun run browser:package` makes `dist\Loka-<v>-windows-x64.zip` (`Loka.exe`,
  `app\`, README) and its `.sha256`, and points `dist\snapshot` at the new `app\`.
- `browser-release`: `bun run release:alpha -- --version <v>` checks the zip, the commit, the patches and the pages,
  and prints the `gh release create --prerelease` it would run; `--publish` runs it.

## How to get to it (user POV)

- `bun run browser:run` once `bun run browser:build` has finished. See `docs/browser-build.md`.
- The alpha: unzip `C:\src\loka\dist\Loka-<version>-windows-x64.zip`, run `Loka.exe`.

## Driving it

Preconditions: Windows, and a build checkout. `bun run build:status` first.

- **One command.** `bun run verify -- --ux browser-build` runs patches:check and verify:browser.
- **Gate.** verify:browser's identity checks: 'chrome.exe ProductName is "Loka"', 'the window is titled "<tab> -
  Loka"', "no window title says Chromium or Helium", "first run opens only Loka's setup".
- **Patches.** `bun run patches:check` exits 0 with `<n> files in C:\src\loka\build\src match patches/loka.`, or
  lists each un-exported file and the
  `scripts/export_patch.py` command that captures it.
- **Sharing.** `bun run build:status` ends with `Tests drive: <binary> (<why>)`. `scripts/build_log.test.ts`
  proves the lock (a live lock refuses, a stale one is taken over) and the binary choice.
- **Release dry run.** `bun run release:alpha -- --version <last packaged version>` prints every check and the
  command, and changes nothing.
- **Alpha.** Unzip into two different folders and start each `app\chrome.exe` with Loka.exe's flags and a
  throwaway `--user-data-dir`, or `LOKA_CHROME=<folder>\app\chrome.exe bun run verify:browser`. Check
  `devtools://devtools/bundled/devtools_app.html` loads, since the package leaves out `gen/`.

## Gotchas

- `browser:run` refuses without a finished build. A first build takes hours. Ask before starting one, and before
  `browser:setup`, which moves the tree everyone shares.
- Adding a `<message>` to a `.grdp` adds a resource ID and recompiles thousands of files (about 25 minutes);
  changing a message's text is cheap. Loka's own strings belong in the webui bundle.
- Never point it at a real profile. `browser:run` uses `C:\src\loka\profile-dev`, the suites fresh folders that they
  delete.
- Don't test the alpha through `Loka.exe` with an extra `--user-data-dir`: Chrome keeps the first one, so it would
  use the real `%LOCALAPPDATA%\Loka\User Data`. Start `app\chrome.exe` directly instead.
- The screen is often off or locked during overnight runs, so a desktop screenshot is black. Use CDP page
  screenshots and `scripts/window.ps1` (PrintWindow).
- The measured incremental rebuild after a small C++ edit was 81 s; read `build-times.log` (`build:status`) before
  quoting a build time.
