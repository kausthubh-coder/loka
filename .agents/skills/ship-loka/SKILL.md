---
name: ship-loka
description: Land verified Loka work on main and, when asked, cut a browser release. Use only when I say ship, merge, release, or merge and deploy.
---

# Ship Loka

Loka is public. Work lands on `main` through a pull request with CI, and my "ship" is the go to merge once CI passes.

Surfaces:

| Surface | What ships it |
|---|---|
| Source on `main` | Merging the PR. Nothing deploys on push. |
| CI | `check.yml` (prototype: lint, types, tests, build) and Helium's `lint.yml` (patch series), on every push and PR |
| Browser release | `main.yml`, started by hand. Builds on free `windows-2025` runners in chained 5.5-hour jobs (15 to 44 hours), and publishes a GitHub release when `do-release` is true |

**Rules.**
- Production needs my go in this conversation. "Ship" is that go for every step below, including cleanup: don't stop
  to ask between steps. The browser release (step 3) is the one exception: it runs when I say release, because it
  starts a 15 to 44 hour CI build.
- When a step fails because of this change (a failing check, a lint error, a broken build), fix it, rerun the
  checks and carry on. Stop and tell me only when the cause is outside the change or the fix needs my decision.
- Never end the turn while a CI run or build you started is queued or running. Watch it to success or failure. The
  browser release is too long to watch in one turn: schedule check-ins and say when the next one is.
- Never force-push, never skip a check, never edit a test or a check to get through.

In a cloud session `gh pr` doesn't work. Use the `gh api` lines below; if `gh api` is refused, the GitHub MCP tools
do the same (`create_pull_request`, `pull_request_read` with `get_status`, `merge_pull_request`). There's no main
checkout in the cloud, so step 4 goes in the report for my machine.

## 1. Ready

1. `git status` is clean, and the branch contains `origin/main` (`git fetch origin && git merge-base --is-ancestor origin/main HEAD`).
   If it doesn't, `git merge origin/main` and resolve.
2. `bun run check` passes.
3. Every changed feature was driven with `verify-loka`, and you have its evidence (screenshots, outline JSON).
4. List what's going out with `git log --oneline origin/main..HEAD`. Say which surfaces it touches: prototype,
   scripts, docs, or `patches/` (the browser).
5. If `patches/` changed, the change was built and run in the build checkout (`bun run browser:build`,
   `bun run browser:run`), or say plainly that it wasn't. A cloud session can't build the browser; say so.
6. Write down the rollback: `git revert <merge commit>` on a branch, then a PR.

## 2. Land

```
git push -u origin HEAD
gh pr create --base main --fill            # or --title/--body; end the body with the attribution line
gh pr checks --watch --interval 30         # bounded: stop and report if it runs past 20 minutes
gh pr merge --merge                        # a merge commit keeps Helium's history intact
```

From the cloud:

```
git push -u origin HEAD
gh api repos/kausthubh-coder/loka/pulls -f head=<branch> -f base=main -f title=<title> -f body=<body>   # note .number
gh api repos/kausthubh-coder/loka/commits/<head sha>/check-runs -q '.check_runs[] | [.name, .status, .conclusion] | @tsv'
gh api -X PUT repos/kausthubh-coder/loka/pulls/<pr>/merge -f merge_method=merge
```

Rerun the check-runs call until every run is `completed` (at most 20 minutes), then merge only if all are `success`
(or `skipped`). On a failure caused by this change, fix it, rerun step 1's checks, push, and watch again.

Don't pass `--delete-branch` inside a worktree. Delete the branch in step 5.

## 3. Release the browser (only when I say release)

```
gh workflow run main.yml -f do-release=true
gh run list --workflow main.yml --limit 1  # note the run id
gh run watch <run-id> --interval 600       # 15 to 44 hours; schedule check-ins, don't block a thread on it
```

From the cloud: `gh api -X POST repos/kausthubh-coder/loka/actions/workflows/main.yml/dispatches -f ref=main -f inputs[do-release]=true`,
then `gh api repos/kausthubh-coder/loka/actions/workflows/main.yml/runs -q '.workflow_runs[0] | [.id, .status, .conclusion] | @tsv'`.

When it finishes, check it read-only: `gh release view --json tagName,assets` (cloud:
`gh api repos/kausthubh-coder/loka/releases/latest -q '.tag_name, .assets[].name'`) shows the new tag and the x64
installer and zip. The build is unsigned until SignPath is set up, so Windows SmartScreen will warn. Say so in the
release notes.

## 4. Update the main checkout

If `git -C C:\Users\kaust\OneDrive\Documents\dev\loka status --porcelain` is empty and its branch is `main`:

```
git -C C:\Users\kaust\OneDrive\Documents\dev\loka pull --ff-only
bun --cwd C:\Users\kaust\OneDrive\Documents\dev\loka run setup
```

If it is dirty or on another branch, leave it alone and tell me. In a cloud session, list "pull the main checkout"
for my machine.

## 5. Clean up

```
git push origin --delete <branch>
git branch -D <branch>                     # from another checkout, after the worktree is gone
```

This thread can't remove its own worktree. List it for removal with `bun run worktree:remove <path>`. A cloud VM is
thrown away on its own; stop the dev server you started (`verify-loka`, Cleanup) and nothing else is left.

## 6. Report

A few lines: what shipped (PR link, merge commit), which surfaces, the evidence, the release run and tag if any,
and anything skipped or left over.
