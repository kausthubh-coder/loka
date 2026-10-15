---
name: worktree-loka
description: Make a checkout of the Loka repo ready to work in. Use at the start of every task in a new worktree, when deps, .env.local, the port or the browser build checkout look wrong, and before giving a helper agent its own checkout.
---

# Worktree setup for Loka

Loka has two kinds of checkout. Know which one you are in before you touch anything.

| Checkout | Where | What it's for |
|---|---|---|
| Main | `C:\Users\kaust\OneDrive\Documents\dev\loka` | My checkout. Never edit it. |
| T3 worktrees | `C:\Users\kaust\.t3\worktrees\loka\<name>` | Your tasks: prototype, scripts, docs, patch files |
| Build | `C:\src\loka` (`LOKA_BUILD_DIR`) | The one Chromium tree (~100 GB). Shared, so ask before syncing it or building |

## 1. Set up

From the checkout's root:

```
bun run setup
```

It is safe to rerun. In order, it installs deps if they don't match `package.json`, copies `.env.local` from the main
checkout (without its `PORT`), claims a `PORT` no other worktree has claimed, links `.claude\skills` to
`.agents\skills`, fetches the `helium-chromium` submodule if missing (Windows only), then runs the doctor. In a
cloud session `scripts/cloud.mjs` runs it for you; see `## Cloud sessions` in AGENTS.md.

Done when the last line reads `setup: ... Prototype: bun run dev -> http://localhost:<port>/` and the doctor printed
`All checks passed.`

## 2. When something looks off

```
bun run doctor            # deps, PORT, skills link, git
bun run doctor --browser  # plus Visual Studio 2026, SDK, Python, 7-Zip, long paths, disk, build checkout
```

Each `FAIL` line prints its fix. Run the doctor before trusting a failing test or build.

## 3. Isolation

- The prototype has no backend. It saves to localStorage, which the browser keys by origin, so each worktree's
  own `PORT` keeps its data separate. Start it with `bun run dev`, which reads `PORT` from `.env.local`.
- There is one build checkout and it is shared. `bun run browser:setup` moves it to the current commit, so it
  touches every thread's browser work. Ask me before running it, before deleting `C:\src\loka\build\src`, or
  before a first build (hours).
- `bun run browser:run` uses `C:\src\loka\profile-dev`. Never point the dev build at a real browser profile.

## 4. A helper agent's checkout

```
git -C <this checkout> fetch origin
git -C <this checkout> worktree add C:\Users\kaust\.t3\worktrees\loka\<helper-name> -b <branch> origin/main
cd C:\Users\kaust\.t3\worktrees\loka\<helper-name>
bun run setup
```

If there is no `origin` remote yet, branch from `main`. Each helper gets one worktree. Never two agents in one
checkout.

## 5. Cleanup

```
bun run worktree:remove <path>          # add --force to discard uncommitted changes
```

It stops the process tree listening on that worktree's `PORT`, removes the `.claude\skills` junction without
following it, then runs `git worktree remove`. It refuses the main checkout and the build checkout.

- Stop only processes you started, by the PID you captured, with `taskkill /T /PID <pid>`.
- Remove a worktree only when its work is merged or I say so.
- Never remove one another live thread is using. Check `t3_thread_list` for the project first.
