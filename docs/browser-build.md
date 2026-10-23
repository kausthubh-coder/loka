# Building the browser on Windows

Loka is Helium (`imputnet/helium-windows`) plus Loka's own patches. The Chromium tree is about 100 GB, so it is
built in a separate checkout at `C:\src\loka`, never inside OneDrive. `bun run doctor --browser` checks every
step below.

## 1. Visual Studio 2026 and the Windows SDK (once, admin)

Chromium needs Visual Studio 2026 (18.x). Visual Studio 2022 is too old.

1. Download Visual Studio 2026 Community from https://visualstudio.microsoft.com/downloads/ and run, from the
   folder it downloaded to:
   ```
   vs_community.exe --add Microsoft.VisualStudio.Workload.NativeDesktop --add Microsoft.VisualStudio.Component.VC.ATLMFC --includeRecommended
   ```
2. Install Windows SDK 10.0.28000 with every feature, including Debugging Tools (the link Helium's CI uses):
   https://go.microsoft.com/fwlink/?linkid=2370315

## 2. Windows settings (once, admin PowerShell)

```powershell
# Paths in the Chromium tree go past 260 characters.
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
# Defender scanning every object file makes the build far slower.
New-Item -ItemType Directory -Force C:\src | Out-Null
Add-MpPreference -ExclusionPath C:\src
```

Developer Mode (Settings > System > For developers) must be on for symlinks. Python 3.11+, `requests`, `Pillow`
and 7-Zip are also needed; the doctor tells you which are missing.

## 3. Build

```
bun run browser:setup   # git worktree of this repo at C:\src\loka, synced to the current commit
bun run browser:build   # first time: downloads ~3.7 GB and compiles for hours
bun run browser:run     # opens the dev build with a throwaway profile
```

- `browser:setup` syncs the build checkout to the current **commit**, so commit before syncing. It refuses while
  `build\src` has edits `patches/loka` doesn't capture (`bun run patches:check` lists them).
- The first build is a component build without PGO (`build.py --dev`): fast to rebuild, slower to run than a
  release. `scripts/loka_build.py first` applies Helium's patches, then `patches/series`, which ends with Loka's.
- After that, `browser:build` runs an incremental `autoninja -C out\Default chrome`, usually minutes.
- Jobs default to 6 (`LOKA_JOBS` overrides). More runs out of RAM on a 16 GB laptop while linking. On
  15 Oct 2026 the laptop crashed twice with 6 jobs plus a browser test running (free RAM near 0.2 GB); 4 jobs
  and nothing else heavy kept it stable.
- `bun run build:status` says whether an incremental build is running, its last error line, and the last few build
  times. The build writes them to `C:\src\loka\build-status.json` and `build-times.log`.

## 3a. The Loka sidebar and branding

The sidebar is a built-in browser page, `chrome://loka-sidebar.top-chrome`, in the window's left column. Its front
end is `webui/` (Lit, sharing the prototype's components); `webui/src/bridge.ts` talks to `LokaSidebarHandler`
(C++, in `patches/loka/loka-native-sidebar.patch`) with `chrome.send`, and `webui/src/messages.ts` lists every
message. Extensions are never how Loka's UI ships; the old `extension/` sidebar is legacy.

```
bun run webui:build                            # builds webui/dist, copies it to build\src\components\loka_sidebar\dist
bun run browser:build                          # packs it into the browser
python scripts/loka_brand.py apply             # in C:\src\loka, once after the first build: Loka name + icons
python scripts/loka_build.py incremental       # then rebuild to pick the branding up
```

- `browser:run` writes `initial_preferences` beside `chrome.exe`, Loka's first-run defaults for a new profile.
- `loka_brand.py assets` redraws the brand images in `resources/loka/branding` (committed); `apply` copies them
  wherever Helium's go and renames Chrome/Chromium/Helium to Loka in the UI strings.
- `bun run verify:browser` checks the result on a throwaway profile: first run, sidebar, icons, sound, media,
  extensions, downloads and window titles. Point `LOKA_CHROME` at a copy while a build is running.
- A new Helium release means a new Chromium version: export every edit first (`bun run patches:check` must pass),
  then delete `C:\src\loka\build\src` (keep `build\download_cache`) and run `browser:build` again.

## 4. Writing a Loka patch

Loka's patches live in `patches/loka/` and are listed at the end of `patches/series`, after Helium's.

1. Before editing a Chromium file under `C:\src\loka\build\src`, copy it to the same path under
   `C:\src\loka\patch-orig` (new Loka files need no copy).
2. Edit, rebuild with `bun run browser:build`, and check the result with `bun run verify:browser`.
3. Write the patch: `python scripts/export_patch.py <name> <file>...` diffs each file against its copy in
   `patch-orig` (or against nothing, for a new file), writes `patches/loka/<name>.patch` and adds it to
   `patches/series`. A patch is rewritten whole, so list every file it covers.
4. `bun run patches:check` must print `match patches/loka`. It lists any edit no patch captured, with the export
   command. Commit the patch and open a PR; CI runs Helium's patch linter.

## 3b. The portable alpha

```
bun run browser:package    # C:\src\loka\dist\Loka-<version>-windows-x64.zip and .sha256
```

- `scripts/alpha/package_alpha.mjs` copies what `gn desc out\Default //chrome:chrome runtime_deps` lists (every
  DLL, since the dev build is a component build; the sidebar is inside the browser's paks), `initial_preferences`,
  a README, the repo's `LICENSE` and `LICENSE.ungoogled_chromium`, and `scripts/alpha/NOTICE.txt` (Helium,
  ungoogled-chromium and Chromium, and chrome://credits for the rest). `LOKA_VERSION` sets the version (default
  `0.1.0-alpha.1`); `-- --list` prints the zip's top level without a build.
- `Loka.exe` is `scripts/alpha/Loka.cs`, compiled with the `csc.exe` that ships in Windows. It starts
  `app\chrome.exe` with the profile `%LOCALAPPDATA%\Loka\User Data` and `--custom-update-server-url` pointed at
  Loka's (not yet published) feed, so Helium's updater never offers Helium.
- The 0.1.0 alpha's sidebar was an extension. Its users keep their spaces by exporting them there and importing them
  in the new build (see the README).
- Don't run `gn desc` while a 6-job build is running on the 16 GB laptop: it needs about 1.5 GB of its own.
- The alpha is the dev build: component build, unsigned, and without the full Loka name in every string. A
  release build (below) is the efficient one, as a single `chrome.dll`.

## Release builds

`.github/workflows/main.yml` (inherited from Helium, started by hand) builds on GitHub's free `windows-2025`
runners, splitting the compile into chained jobs of up to 5.5 hours each. Expect 15 to 44 hours of wall time
per build. It doesn't make Loka: it skips `webui:build` and `loka_brand.py`, and `signing.py` stops without the
six `AZURE_*` secrets, which Loka doesn't have.

`.github/workflows/loka-build.yml` is Loka's: one job on a Depot Windows runner (`depot-windows-2025-64`, 64 CPUs
and 256 GB; the repo is in the `loka-browser` organization because Depot's runners need one). It runs
`loka_build.py first` and `browser:package` in `C:\src\loka`, as on this machine, and uploads the zip as the run's
artifact; it releases nothing. Depot bills it per minute. With `ssh` on, a failed run stays up to an hour for
`tmate`, which only the person who started it can join.
