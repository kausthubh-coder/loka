---
name: worktree-loka
description: Make a checkout of the Loka repo ready to work in. Use at the start of every task in a new worktree, when deps, .env.local, the port or the build checkout look wrong, and before giving a helper agent its own checkout.
---

# Worktree setup for Loka

Know which checkout you are in before you touch anything.

| Checkout | Where | What it's for |
|---|---|---|
| Main | `C:\Users\kaust\OneDrive\Documents\dev\loka` | My checkout. Never edit it. |
| T3 worktrees | `C:\Users\kaust\.t3\worktrees\loka\<name>` | Your tasks: prototype, webui, scripts, docs, patch files |
| Build | `C:\src\loka` (`LOKA_BUILD_DIR`) | The one Chromium tree (~100 GB), shared by every worktree. Never edit `build\src` from a task |

## 1. Set up

```
bun run setup
```

Safe to rerun; seconds when nothing is missing. In order: installs deps when they don't match `package.json`, copies
`.env.local` from the main checkout (without its `PORT`), claims a `PORT` no other worktree has claimed (hashed from
the path, free on 127.0.0.1 and ::1), links `.claude/skills` to `.agents/skills` (a junction on Windows, a symlink
elsewhere), fetches the `helium-chromium` submodule (Windows only), then runs the doctor. T3 runs it for every new
worktree; a cloud session runs it through `scripts/cloud.mjs`.

Healthy ends with `All checks passed.` and `setup: ... Prototype: bun run dev -> http://localhost:<port>/`.

## 2. When something looks off

```
bun run doctor            # deps, PORT, skills link, test browser, git, the build checkout
bun run doctor --browser  # plus the Windows toolchain: Visual Studio 2026, SDK, Python, 7-Zip, long paths, disk
```

Each `FAIL` prints its fix. The build checkout section says whether a build is running, which browser binary the
browser suites will drive and why, and which browsers hold `out\Default`. Off Windows it says the browser build is
skipped there (`docs/cross-platform.md`).

## 3. Isolation

- **Prototype.** No backend: it saves to localStorage, which the browser keys by origin, so the worktree's own
  `PORT` is its own data. `bun run dev` reads `PORT` from `.env.local` with `strictPort`.
- **Build checkout.** One tree, shared. Who may do what:
  - Any worktree may *drive* a browser: the suites pick `testBinary()` (LOKA_CHROME, else `out\Default` when no
    build is writing it, else `C:\src\loka\dist\snapshot\chrome.exe`, the last packaged alpha). Each run gets its
    own throwaway profile and CDP port, so runs in parallel don't share state.
  - One build at a time. `build.lock` holds the running build's pid; `browser:build` and `loka_build.py` refuse
    while it is live.
  - A browser running from `out\Default` makes the next link fail about 25 minutes in. `browser:build` refuses
    while one runs and lists them; `-- --stop-test-browsers` stops the ones on throwaway profiles.
  - Ask me before `browser:setup` (it moves the tree to your commit, under everyone), before a build, and before
    deleting `build\src`.
- **Profiles.** `browser:run` uses `C:\src\loka\profile-dev`; the suites make and delete their own. Never point a
  build at a real browser profile.

## 4. A helper agent's checkout

```
git -C <this checkout> fetch origin
git -C <this checkout> worktree add C:\Users\kaust\.t3\worktrees\loka\<helper-name> -b <branch> origin/<base>
bun --cwd C:\Users\kaust\.t3\worktrees\loka\<helper-name> run setup
```

`<base>` is the branch the work builds on (`main`, or the feature branch it extends). One worktree and one port per
helper. Never two agents in one checkout.

## 5. Cleanup

```
bun run worktree:remove <path>          # add --force to discard uncommitted changes
```

It stops processes running from that worktree (Windows: their trees with `taskkill /T`; Linux and macOS: their
process groups), removes the `.claude/skills` link without following it, then runs `git worktree remove`. It refuses
the main checkout and the build checkout.

- Stop only processes you started, by the PID you captured, with their children.
- Remove a worktree only when its work is merged or I say so, and never one a live thread is using
  (`t3_thread_list` for the project).
