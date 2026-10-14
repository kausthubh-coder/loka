---
name: ship-loka
description: Land verified Loka work on main and, when asked, cut a browser release. Use only when I say ship, merge, release, or merge and deploy.
---

# Ship Loka

Loka is public. Work lands on `main` through a pull request with CI, and my "ship" is the go to merge once CI passes.
A browser release is a separate step that needs its own go in this conversation.

Surfaces:

| Surface | What ships it |
|---|---|
| Source on `main` | Merging the PR. Nothing deploys on push. |
| CI | `check.yml` (prototype: lint, types, tests, build) and Helium's `lint.yml` (patch series), on every push and PR |
| Browser release | `main.yml`, started by hand. Builds on free `windows-2025` runners in chained 5.5-hour jobs (15 to 44 hours), and publishes a GitHub release when `do-release` is true |

Every `gh` command names `-R kausthubh-coder/loka`. With the `upstream` remote present, a bare `gh` can resolve to imputnet/helium-windows and open a PR against Helium.

Stop at the first failure. Never force-push, never skip a check, never edit a test or a check to get through.

## 1. Ready

1. `git status` is clean, and the branch contains `origin/main` (`git fetch origin && git merge-base --is-ancestor origin/main HEAD`).
2. `bun run check` passes.
3. Every changed feature was driven with `verify-loka`, and you have its evidence (screenshots, outline JSON).
4. List what's going out with `git log --oneline origin/main..HEAD`. Say which surfaces it touches: prototype,
   scripts, docs, or `patches/` (the browser).
5. If `patches/` changed, the change was built and run in the build checkout (`bun run browser:build`,
   `bun run browser:run`), or say plainly that it wasn't.
6. Write down the rollback: `git revert <merge commit>` on a branch, then a PR.

## 2. Land

```
git push -u origin HEAD
gh pr create -R kausthubh-coder/loka --base main --fill            # or --title/--body; end the body with the attribution line
gh pr checks -R kausthubh-coder/loka --watch --interval 30         # bounded: stop and report if it runs past 20 minutes
gh pr merge -R kausthubh-coder/loka --merge                        # a merge commit keeps Helium's history intact
```

Don't pass `--delete-branch` inside a worktree. Delete the branch in step 5.

## 3. Release the browser (only with an explicit go)

```
gh workflow run main.yml -R kausthubh-coder/loka -f do-release=true
gh run list -R kausthubh-coder/loka --workflow main.yml --limit 1  # note the run id
gh run watch -R kausthubh-coder/loka <run-id> --interval 600       # 15 to 44 hours; check back, don't block a thread on it
```

When it finishes, check it read-only: `gh release view -R kausthubh-coder/loka --json tagName,assets` shows the new tag and the x64
installer and zip. The build is unsigned until SignPath is set up, so Windows SmartScreen will warn. Say so in the
release notes.

## 4. Update the main checkout

If `git -C C:\Users\kaust\OneDrive\Documents\dev\loka status --porcelain` is empty and its branch is `main`:

```
git -C C:\Users\kaust\OneDrive\Documents\dev\loka pull --ff-only
bun --cwd C:\Users\kaust\OneDrive\Documents\dev\loka run setup
```

If it is dirty or on another branch, leave it alone and tell me.

## 5. Clean up

```
git push origin --delete <branch>
git branch -D <branch>                     # from another checkout, after the worktree is gone
```

This thread can't remove its own worktree. List it for removal with `bun run worktree:remove <path>`.

## 6. Report

A few lines: what shipped (PR link, merge commit), which surfaces, the evidence, the release run and tag if any,
and anything skipped or left over.
