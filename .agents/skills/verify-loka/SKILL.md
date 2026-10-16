---
name: verify-loka
description: Prove a Loka change works by driving the prototype and the built browser, with screenshots, saved state and check results as evidence. Use after any change to the sidebar, webui/, the C++ patches or the scripts that build and test them, and before saying the browser does something.
---

# Verify Loka

Loka has two surfaces. Only the browser build proves what a user gets.

- **Browser build**: Helium plus Loka's patches, built in `C:\src\loka` (Windows only today). Its sidebar is the
  built-in page `chrome://loka-sidebar.top-chrome` (from `webui/`, answered by C++). A change to `webui/`, the patches
  or anything the sidebar shows is done only when the browser suites pass on a build that has the change.
- **Sidebar prototype**: the same components as a web page served by Vite, with seed data and a fake browser
  (`prototype/src/demo/`). It proves the sidebar's own behavior (folders, drags, menus), never the browser's. It runs
  everywhere, cloud sessions included.

## One command

```
bun run verify                       # check, patches:check, every prototype recipe, then the browser suites
bun run verify -- --ux <feature>     # one feature of features/: its recipes, verify:browser, its verify:flows flows
bun run verify -- --list             # what each feature runs
bun run verify -- --fast             # check and patches:check only
```

It ends with one line per stage (`PASS`, `FAIL`, `SKIP` with why, `WARN`), the evidence folders, and
`verify: PASS|FAIL; not run: ...`. A SKIP is not a pass: report it. `WARN` on patches:check means `build\src` has C++
that no patch holds yet, often someone's work in progress; it must pass before anything in `patches/` ships.

The browser suites run on `testBinary()` (`scripts/browser.mjs`): `LOKA_CHROME`, else `out\Default` when no build is
writing it, else `C:\src\loka\dist\snapshot\chrome.exe` (the last packaged alpha, which can be older than your
change). `bun run build:status` names it. Off Windows, or with no binary, they are skipped.

## The browser suites

| Command | What it drives | Time |
|---|---|---|
| `bun run verify:browser` | a fresh profile: setup, rows, icons, sound, media, extensions, downloads, scheme, pinning, suggestions, window identity, the WM_NCHITTEST hit test, a real posted click, the alpha's import | ~30 s |
| `bun run verify:flows` | what a user does, 9 flows on one profile (`-- --only <flow>[,<flow>]` for some) | minutes |
| `bun run verify:perf` | CPU, frames and memory of the real sidebar, against budgets (on branches that have it) | minutes |

Each starts the browser on its own throwaway profile and CDP port, stops only its own process tree, deletes its
profile, and writes evidence to `.agents/verify-runs/<time>-<suite>/` (`checks.json`, pictures, `chrome.log`).
`features/native-sidebar.md` has the recipes for your own drive.

**Real input.** CDP's Input events start inside the page: they skip Windows' hit test and Chromium's Win32 input
path, so a passing CDP click doesn't prove a real click. Anything about the top row, the frame, dragging or where a
mouse lands needs verify:browser's hit-test and real-click checks, or a drive with the helpers in
`features/layout.md` (`scripts/window-hittest.ps1`, `scripts/window-input.ps1`).

## The prototype

Run every script here with **node**, never bun: Playwright's browser launch hangs under bun on Windows.
`scripts/test-browser.mjs` picks Playwright's Chromium, else Google Chrome, else a cloud VM's Chromium; the doctor
names it.

**Launch.** `bun run verify` starts this checkout's dev server itself. By hand: `bun run dev` in the background, keep
its PID, ready when Vite prints `Local: http://localhost:<PORT>/` (`strictPort`; each worktree has its own `PORT`,
and data is per origin). Drive only a server you started.

**Doctor.** `node .agents/skills/verify-loka/scripts/doctor.mjs` checks the page at this checkout's port is the
Loka prototype and its listener was started from this checkout. Run it first, and again when a recipe fails oddly.

**Drive.** `node .agents/skills/verify-loka/scripts/run.mjs <recipe|all>` (recipes: the feature ids, plus
`make-folders`). Each opens a fresh browser, resets to the seed data, drives the UI as a user would, asserts the
saved state, and prints `PASS` or `FAIL` with its evidence folder. For a change no recipe covers, write a short
script that imports the driver:

```js
import { openLoka } from "<checkout>/.agents/skills/verify-loka/scripts/loka.mjs";
const loka = await openLoka("pin-from-command-bar");   // seed data, evidence folder created
await loka.row("Hacker News").click({ button: "right" });
await loka.menuItem("Pin to space").click();
console.log(await loka.outline());                     // { space, activeTab, essentials, pinned, open }
await loka.proof("after-pin");
await loka.close();                                    // throws if the page logged errors
```

| Handle | Finds |
|---|---|
| `loka.row(text)` | a pinned or open row (tab or folder) in the visible space |
| `loka.essential(title)` | an Essentials tile |
| `loka.space(name)` | a neighbouring planet on the horizon (only the spaces next to the current one) |
| `loka.menuItem(label)` | a context-menu item after a right-click |
| `loka.drag(source, target, "before" \| "after" \| "into")` | a real HTML5 drag onto the target's top edge, bottom edge or middle |
| `loka.outline()` / `loka.state()` | the saved state, readable / raw |
| `loka.proof(name)` | `<name>.png`, `<name>.aria.txt`, `<name>.outline.json` |

Other stable handles: the address field (`Address: github.com`), the command bar's combobox (`Search or enter
address`), `More` (the `...` menu), `New` (the `+` on the horizon), `Hide sidebar` / `Keep sidebar open`,
`Downloads`, `Extensions`, `Spaces: <current space>` (the big planet), `Clear`, and `Close <tab title>` buttons.
`window.lokaDemo.calls` lists every message the sidebar sent the fake browser.

## Evidence

Evidence goes to `.agents/verify-runs/<time>-<name>/` (gitignored, never deleted by cleanup). A proof:

- drives the real user path (clicks, drags, menus, keys), never app functions called from `evaluate`;
- captures the state before and after the action, not just the final screen;
- checks the stored result (the saved state, or what the browser did) and that it survives a reload or restart when
  persistence matters;
- fails on console errors (prototype `close()`).

Report the feature, the command you ran, PASS or FAIL, what was skipped, and the evidence folder.

## Cleanup

Stop the dev server you started, by its PID, with its children: `taskkill /T /F /PID <pid>` on Windows. On Linux
start it with `setsid bun run dev` and stop its group:

```
pgid=$(ps -o pgid= -p "$(lsof -nP -iTCP:<PORT> -sTCP:LISTEN -t | head -1)" | tr -d ' ')
kill -- -"$pgid"
```

Recipes and suites close their own browsers. Leave `.agents/verify-runs/` alone.

## Keeping the map true

`features/README.md` lists every user-facing feature; each file says how a user reaches it, how to drive it, and
which browser checks prove it. A proof that drives one entry point is incomplete when the map lists others. When a
feature changes, update in the same change: its feature file, its recipe in `scripts/run.mjs`, its flow checks, and
its row in the `UX` table of `scripts/verify.mjs`. `scripts/verify.test.ts` fails when the files and the table
disagree. After big changes, run `/maintain-verification-skill`.
