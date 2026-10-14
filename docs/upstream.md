# Taking a new Helium release

Loka's `main` is Helium's history plus Loka's commits. Helium tags a release about every four weeks, usually
with a new Chromium version. Merge each tag (never rebase: `main` is public).

```
git fetch upstream --tags
git tag --sort=-creatordate | head -5          # newest Helium tags
git switch -c helium/<tag> main
git merge <tag>                                # e.g. 0.19.3.1
git submodule update --init --recursive        # helium-chromium moves with the tag
```

Expected conflicts:

- `README.md`: keep Loka's. Copy any build-instruction changes into `docs/helium-windows-README.md`.
- `patches/series`: keep Helium's new list and put Loka's lines back at the end.
- `.gitignore`, `.gitattributes`: keep both sides.

Then:

1. Commit the merge, `bun run browser:setup`, delete `C:\src\loka\build\src` (keep `build\download_cache`),
   and `bun run browser:build`. Loka patches that no longer apply fail here with the file name.
2. Refresh the failing patches with quilt (see `docs/browser-build.md`, step 4) and commit them.
3. Run the browser, check spaces and folders still work, and open a PR titled `Helium <tag>`.
