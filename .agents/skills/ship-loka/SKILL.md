---
name: ship-loka
description: Land verified Loka work and, on my go, release a browser alpha as a GitHub pre-release. Use only when I say ship, merge, release, or merge and deploy.
---

# Ship Loka

Loka is public: work lands through a pull request and CI, and my "ship" is the go to merge once CI passes.
Nothing deploys on push. A browser release (package the alpha, publish a GitHub pre-release) is part of the ship
when I say release, or when I say ship and the change touches the browser (`patches/` or `webui/`).

| Surface | What ships it | Gate |
|---|---|---|
| Source on `main` | the merged PR | `check` and `lint` in CI. The `Vercel` check is the landing site's preview and fails on every branch without the site; it doesn't gate |
| Browser alpha | `browser:build` → `browser:package` → `release:alpha --publish` | `release:alpha`'s own checks, then a read-back of the release |
| CI release build | `main.yml` (Helium's Windows build on CI runners, 15 to 44 hours) | Not how alphas ship today. Only when I ask for a CI build by name |

**Rules**

- "Ship" is the go for every step below, cleanup included; don't stop to ask between steps. Building in the build
  checkout and publishing a release need my go in this conversation ("ship" or "release" is that go).
- When a step fails because of this change (a failing check, a lint error, a broken build), fix it, rerun the checks
  and carry on. Stop and tell me only when the cause is outside the change or the fix needs my decision.
- Never end the turn while a CI run or a build you started is queued or running: watch it to the end.
- Never force-push, never skip a check, never edit a test or a check to get through.

## 1. Ready

1. `git status` is clean. Fetch, then merge the base in if it moved: `git fetch origin && git merge origin/<base>`.
   The base is `main`, unless the branch was cut from another feature branch (`git rev-parse --abbrev-ref @{upstream}`);
   then it is that branch, and that branch ships to `main` later.
2. `bun run verify` passes. It runs `check`, `patches:check`, every prototype recipe and the browser suites, and
   names what it skipped. A skipped browser suite is fine only when the change touches neither `patches/` nor
   `webui/`; otherwise get a binary that has the change (step 4) and rerun it.
3. Every changed feature was driven with `verify-loka` (`bun run verify -- --ux <feature>`), and you have the
   evidence folders.
4. If `patches/` or `webui/` changed, the build that verify drove has the change: `bun run build:status` names the
   binary and the last build. If not, it needs a build first (step 3 below), or say plainly that it wasn't proven in
   the browser.
5. List what's going out: `git log --oneline origin/<base>..HEAD`, and which surfaces it touches.
6. Write down the rollback: `git revert -m 1 <merge commit>` on a branch, then a PR. For a release, I turn it back
   into a draft and delete the tag (`gh release` is denied to agents).

## 2. Land

```
git push -u origin HEAD
gh pr create --base <base> --title "<title>" --body-file <file>   # body ends with the attribution line
gh pr checks --watch --interval 30                               # at most 20 minutes; Vercel's row always fails
gh pr checks --json name,bucket -q '.[] | select(.name == "check" or .name == "lint") | [.name, .bucket] | @tsv'
gh pr merge --merge                                              # a merge commit keeps Helium's history intact
```

Merge only when every `check` and `lint` row is `pass`. Don't pass `--delete-branch` inside a worktree; step 6
deletes the branch.

From a cloud session `gh pr` doesn't work; use the REST calls:

```
gh api repos/loka-browser/loka/pulls -f head=<branch> -f base=<base> -f title=<title> -f body=<body>   # note .number
gh api repos/loka-browser/loka/commits/<head sha>/check-runs -q '.check_runs[] | [.name, .status, .conclusion] | @tsv'
gh api -X PUT repos/loka-browser/loka/pulls/<pr>/merge -f merge_method=merge
```

## 3. Release the alpha (on my go; Windows only)

The build checkout (`C:\src\loka`) is shared: check `bun run build:status` first, and wait for a build someone else
is running.

```
git fetch origin && git checkout --detach origin/<base>    # the merged commit, in this worktree
bun run browser:setup                           # moves the build checkout to this commit; refuses on unexported C++
bun run webui:build                             # this commit's pages into the build
bun run browser:build                           # refuses while test browsers hold out\Default; add -- --stop-test-browsers
bun run verify                                  # now on the new build
LOKA_VERSION=<x.y.z-alpha.n> bun run browser:package   # zip + sha256, and dist\snapshot -> the new app folder
bun run release:alpha -- --version <x.y.z-alpha.n>              # dry run: every check, and the gh command
bun run release:alpha -- --version <x.y.z-alpha.n> --publish    # Claude Code asks me to confirm this one
```

The next version is one past the last `v*-alpha.*` tag (`git ls-remote --tags origin`) and past the zips in
`C:\src\loka\dist`. `release:alpha` tags the commit it runs from and checks the build was made from it. Raw
`gh release` and `gh workflow run` are denied in `.claude/settings.json`; `release:alpha` is the way.

## 4. Check production

`release:alpha --publish` ends with a read-back (`PASS <url>: pre-release true, <zip> <size>, <sha256>`). Then
download what a user gets, `curl -fLO https://github.com/loka-browser/loka/releases/download/v<v>/Loka-<v>-windows-x64.zip`
into a temp folder (`gh release` is denied), compare its sha256 with the release's `.sha256`, unzip it and run
`LOKA_CHROME=<temp>\Loka-<v>-windows-x64\app\chrome.exe bun run verify:browser`. For source-only ships, read the
merge commit on `origin/<base>` (`git log -1 origin/<base>`).

## 5. Update the main checkout

If `git -C C:\Users\kaust\OneDrive\Documents\dev\loka status --porcelain` is empty and its branch is `main`:

```
git -C C:\Users\kaust\OneDrive\Documents\dev\loka pull --ff-only
bun --cwd C:\Users\kaust\OneDrive\Documents\dev\loka run setup
```

If it is dirty or on another branch, leave it alone and tell me. In a cloud session, list it for my machine.

## 6. Clean up

```
git push origin --delete <branch>
git branch -D <branch>                          # from another checkout, after the worktree is gone
```

A thread can't remove its own worktree: list it for `bun run worktree:remove <path>`. Stop the dev servers and
browsers you started, by pid. Leave `.agents/verify-runs/` (evidence) alone.

## 7. Report

A few lines: the PR and merge commit, the surfaces, the evidence folders, the release URL and tag if any, and what
was skipped or left (with why).

## Walking it without shipping

To prove these steps without anything leaving the machine: run step 1 for real, print step 2's commands, run
`release:alpha` without `--publish` on the last packaged version, and stop.
