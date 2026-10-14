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
bun run browser:build   # first time: clones Chromium + deps (tens of GB) and compiles for hours
bun run browser:run     # opens the dev build with a throwaway profile
```

- `browser:setup` syncs the build checkout to the current **commit**, so commit before syncing.
- Helium 0.19.2.1's `build.py` clones Chromium with `helium-chromium/utils/clone.py` (a shallow `git clone` plus
  `gclient sync`); Helium's CI does the same at this tag. Later Helium versions download prepared tarballs instead.
- The first build is a component build without PGO (`build.py --dev`): fast to rebuild, slower to run than a
  release. `scripts/loka_build.py first` applies Helium's patches, then `patches/series`, which ends with Loka's.
- After that, `browser:build` runs an incremental `autoninja -C out\Default chrome`, usually minutes.
- Jobs default to 6 (`LOKA_JOBS` overrides). More runs out of RAM on a 16 GB laptop while linking.
- A new Helium release means a new Chromium version: delete `C:\src\loka\build\src` (keep
  `build\download_cache`) and run `browser:build` again.

## 4. Writing a Loka patch

Loka's patches live in `patches/loka/` and are listed at the end of `patches/series`, after Helium's.

1. In the build checkout, start a branch: `git -C C:\src\loka switch -c patch/<name>`.
2. Edit files under `C:\src\loka\build\src`, rebuild with `bun run browser:build`, and check the result in
   `bun run browser:run`.
3. Turn the change into a patch file with quilt, as Helium does: see "Updating patches" in
   `docs/helium-windows-README.md` (MSYS2 + quilt, `devutils/set_quilt_vars.sh`).
4. Add the file to `patches/series`, commit on the branch, and open a PR. CI runs Helium's patch linter.

## Release builds

`.github/workflows/main.yml` (inherited from Helium, started by hand) builds on GitHub's free `windows-2025`
runners, splitting the compile into chained jobs of up to 5.5 hours each. Expect 15 to 44 hours of wall time
per build. Signing secrets are optional; without them the build is unsigned.
