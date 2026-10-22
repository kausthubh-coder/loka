# Loka

An open-source, Arc/Zen-style browser on Helium (ungoogled-chromium), on Windows now and macOS next. Users care that
sorting many tabs into spaces and nested folders feels fast and calm, and that the browser stays as quick and private
as Helium. The sidebar is a built-in WebUI page (`chrome://loka-sidebar.top-chrome`, from `webui/`) answered by C++
in `patches/loka/`. Its components and rules are built and tested first in a web prototype (bun + Vite + Lit +
TypeScript). The browser build is Helium's Python build plus Loka's patches.

## Words we use

- **you**: the agent reading this file.
- **me**: the developer you are working for.
- **user**: the person who uses the browser. Not me.
- **space**: a named set of tabs with its own color (`hue`), scheme, pinned tree, open list and active tab.
- **essentials**: the icon grid at the top of the sidebar. It is shared by every space.
- **pinned**: a space's saved tabs and folders. Folders can hold folders. Closing a pinned tab unloads it.
- **open tabs**: a space's temporary tabs, under the divider. Closing one deletes it.
- **Helium**: the upstream browser (the `helium` remote, tags like `0.19.2.1`). **helium-chromium**: its core
  patch submodule.
- **build checkout**: `C:\src\loka`, a git worktree of this repo where Chromium is unpacked and built. One, shared
  by every worktree.
- **snapshot**: `C:\src\loka\dist\snapshot\chrome.exe`, the last packaged alpha. Tests drive it while a build runs.

## Map

| Where | What lives there |
|---|---|
| `webui/src/` | Loka's pages in the real browser, one bundle: the sidebar (`main.ts`), the floating command bar (`command.ts`), History (`history.ts`, `history-bridge.ts`), Settings (`settings.ts`), the empty tab at chrome://newtab (`newtab.ts`); `bridge.ts` (chrome.send to the C++ handler), `messages.ts` (every message name), `store.ts`, `sync.ts` |
| `prototype/src/features/<feature>/` | one folder per feature: its Lit component, `*.logic.ts`, tests. `sidebar/` holds the model (`sidebar.logic.ts`), seed data and `<loka-sidebar>`; `tabs/live.logic.ts` maps browser tabs to spaces and back |
| `prototype/src/app/` | the window shell (`loka-app.ts`: state, saving, shortcuts, theme) |
| `prototype/src/demo/` | the fake browser behind `bun run dev`, the same shape as `bridge.ts`. Sample data lives only here |
| `patches/loka/` + end of `patches/series` | Loka's Chromium patches, after Helium's: name, native sidebar and handler, sidebar-only layout, setup window, onboarding |
| `scripts/` | `setup`, `doctor`, `remove-worktree`, `cloud.mjs`; `browser.mjs` (build checkout, `testBinary`, `build:status`); `loka_build.py` + `build_log.py` (builds, `build.lock`, timings); `verify.mjs` and the suites `verify-browser.mjs`, `verify-flows.mjs`, `browser-session.mjs`, `window*.ps1`; `alpha/` (package and release); `export_patch.py`, `patches_check.py`, `webui.mjs`, `loka_brand.py`, `lint/` |
| `.agents/skills/` | `worktree-loka`, `verify-loka` (with the feature map), `ship-loka`. `.claude/skills` links here |
| `.agents/plans/` | plans as HTML; `2026-10-15-optimize.html` has the restructure checklist |
| `docs/` | `browser-build.md`, `cross-platform.md` (Windows-only parts, the macOS port), `decisions.md`, `upstream.md` |
| `build.py`, `patches/` (except `loka/`), `helium-chromium/`, `.github/` (except `check.yml`) | Helium's, kept where Helium has them so merges stay clean |

Pure logic goes in `*.logic.ts`, tested directly. No barrel files. The sidebar model is the spec for the future C++
model, so keep it pure and keep its rules tested.

## Commands

- Setup a worktree: `bun run setup`. Doctor: `bun run doctor` (`--browser` for the Windows toolchain). Remove one:
  `bun run worktree:remove <path>`.
- Dev: `bun run dev` (this worktree's `PORT` from `.env.local`).
- Test one file: `bun test <file>`. Lint and types for what you changed: `bunx biome check <files>`, `bunx tsc --noEmit`.
- Full check (CI runs it): `bun run check`.
- Prove it: `bun run verify`, or `bun run verify -- --ux <feature>` for one feature (`--list` for the map).
- Browser (Windows): `bun run browser:setup`, `browser:build`, `browser:run`; `bun run build:status` for what is
  building, how long builds take, and which binary tests drive. After editing `webui/`: `bun run webui:build`.
- C++: edit in `C:\src\loka\build\src`, export with `python scripts/export_patch.py`, check with
  `bun run patches:check`.
- Model: the C++ model (`components/loka/core`, `patches/loka/loka-core.patch`) must answer the cases in
  `prototype/src/features/sidebar/model-cases.json` as the TypeScript model does. After changing either model:
  `bun run model:cases` (rewrites the file), then `bun run model:cases -- --cpp` (builds and runs the C++ tests,
  minutes).
- Alpha: `LOKA_VERSION=<v> bun run browser:package`, then `bun run release:alpha -- --version <v>` (dry run).

## Start and ship

- Every task in a new worktree starts with the `worktree-loka` skill.
- Ship only with the `ship-loka` skill, when I say ship or release.
- Helpers get their own worktree through `worktree-loka`. Never two agents in one checkout, and never edit the main
  checkout (`C:\Users\kaust\OneDrive\Documents\dev\loka`).
- The build checkout is shared. Ask before `browser:setup`, a build, or deleting `build\src`; a first build costs
  hours.

## Cloud sessions

A cloud VM (Claude Code on the web, Codex Cloud) is Linux with a bare clone. The SessionStart hook in
`.claude/settings.json` runs `node scripts/cloud.mjs` (Codex: the environment's setup script is
`CLOUD=1 node scripts/cloud.mjs`). It loads my global skills and rules, installs bun if missing, runs setup, and
makes sure Playwright has a browser; outside the cloud it exits at once. Its last line says ready or what failed.

- Works there: `bun run setup`, `doctor`, `dev`, `check`, `bun run verify` (check and every prototype recipe,
  headless on the VM's Chromium; the browser suites report SKIP), single tests, and `ship-loka` up to the merge
  (with the REST calls in it; `gh pr` doesn't work there).
- Only on my machine: the browser build and its suites, packaging and releases, the main checkout, T3 tools.
- Env vars: none. The prototype has no secrets.

## Proving a change works

- Done means you saw it work: verified with `verify-loka`, with evidence, and committed. "It compiles" and "tests
  pass" are not proof.
- A change the browser shows is done when its `bun run verify -- --ux <feature>` passes on a build that has the
  change. The prototype proves the sidebar's own behavior, never the browser's.
- CDP input skips Windows' hit test, so a passing CDP click doesn't prove a real one. Anything about the top row, the
  frame, dragging or input needs verify:browser's hit-test and real-click checks.
- Test with real-shaped data: `sidebar.seed.ts` (three spaces, folders two deep). An empty sidebar is a bad test.
- A test calls the code the way its users do and asserts the exact result. Never edit or delete a test to make it
  pass; if the test is wrong, say so and why.
- A skipped check is not a pass. Report what you ran, what you saw, and what you did not check.

## Working with me

- A question gets an answer, not an action.
- When I ask for a plan, plan. Don't start building until I say go.
- Extend what exists. Propose a rewrite only in a plan, and wait.
- Edit files with your edit tool, not shell one-liners (Windows quoting breaks them).

## How we write code

- Boring and explicit over clever. If it is not written where it happens, you cannot see it.
- One way to do each thing. Finish migrations and delete the old way in the same change.
- A wrapper with one caller is just another file to open. Inline it.
- Names you can grep. Comments say why, never what.
- Smallest change that solves the real problem. No scope creep.
- Loka's own strings go in the webui bundle. Adding a `<message>` to a `.grdp` adds a resource ID and recompiles
  thousands of files (about 25 minutes); changing a message's text is cheap.
- Don't edit Helium's files unless the change can't live in `scripts/` or `patches/loka/`. Every edit there
  conflicts on the next Helium merge.
- Decisions that look odd but are on purpose are in `docs/decisions.md`.

## Rules and what enforces them

| Rule | Enforced by |
|---|---|
| The UI is native WebUI + C++ patches, never an extension. In `webui/` and `prototype/src/features/`: no `chrome.*` extension APIs, no `chrome-extension://` URLs, no imports from `prototype/src/demo/` (sample data stays there) | Biome override in `biome.json` (`noRestrictedGlobals`, `noRestrictedImports`, `scripts/lint/no-extension-urls.grit`) |
| No `any`, no `!` non-null assertions, no unused code | Biome |
| Strict types, checked index access | `tsconfig.json` |
| A tab sits in exactly one place; a folder never goes inside itself | `sidebar.test.ts`, `importState` |
| Every message the page sends is one the handler answers | `webui/src/messages.test.ts` |
| The TypeScript and C++ models give the same results | `model-cases.test.ts` (the case file is current); `bun run model:cases -- --cpp` (C++ against it) |
| Every C++ edit in `build\src` is in a `patches/loka` patch | `bun run patches:check`; `browser:setup` and `release:alpha` refuse until it passes |
| One build at a time; no browser runs from `out\Default` during a build | `build.lock` (`build_log.py`); `browser:build` and `browser:run` refuse; tests switch to the snapshot |
| A real mouse reaches the sidebar (the column is page, not title bar) | verify:browser's hit-test and real-click checks |
| Every feature in the verify map says how it is proven, and the commands exist | `scripts/verify.test.ts` |
| Build checkout outside OneDrive | `scripts/browser.mjs` refuses, the doctor checks |
| Agents never run `gh release` or workflows, push to `main`, or read real profiles and keys; publishing an alpha asks me first | deny and ask rules in `.claude/settings.json` |
| Every file in `patches/` is listed in a series | Helium's `lint.yml` in CI |

When I correct you for the same thing twice, add the rule here and make something enforce it (`/correct`).

## Safety

- Never touch my real browser profiles (Helium, Chrome, Edge, the Studi nightly profile). `browser:run` uses
  `C:\src\loka\profile-dev`; the suites make and delete their own.
- Releases and CI release builds need my explicit go.
- Stop only processes you started, by the PID you captured. Never kill by name.
- No secrets in code, logs, screenshots or commits. Release signing keys live only in GitHub secrets. The legacy
  extension's private key is `C:\src\loka\keys\loka-extension.pem`, ignored by git (`/keys/`); never read, copy or
  move it.
- Git: open a PR and wait for CI and my review. Merge Helium releases, never rebase `main`.
