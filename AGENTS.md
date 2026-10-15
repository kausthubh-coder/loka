# Loka

An open-source, Arc/Zen-style browser on Helium (ungoogled-chromium) for Windows first. Users care that sorting many
tabs into spaces and nested folders feels fast and calm, and that the browser stays as quick and private as Helium.
The sidebar is being designed as a web prototype (bun + Vite + Lit + TypeScript). It will move into Chromium as a WebUI
page with a C++ model behind it. The browser build is Helium's Python build plus Loka patches.

## Words we use

- **you**: the agent reading this file.
- **me**: the developer you are working for.
- **user**: the person who uses the browser. Not me.
- **space**: a named set of tabs with its own color (`hue`), pinned tree, open list and active tab.
- **essentials**: the icon grid at the top of the sidebar. It is shared by every space.
- **pinned**: a space's saved tabs and folders. Folders can hold folders. Closing a pinned tab unloads it.
- **open tabs**: a space's temporary tabs, under the divider. Closing one deletes it.
- **Helium**: the upstream browser (`upstream` remote, tags like `0.19.2.1`). **helium-chromium**: its core
  patch submodule.
- **build checkout**: `C:\src\loka`, a git worktree of this repo where Chromium is unpacked and built.

## Map

| Where | What lives there |
|---|---|
| `prototype/src/features/sidebar/` | sidebar model (`sidebar.logic.ts`), seed data, `<loka-sidebar>`, tests |
| `prototype/src/features/command-bar/` | Ctrl+K bar and URL parsing |
| `prototype/src/features/page/` | stand-in for the web view |
| `prototype/src/app/loka-app.ts` | window shell: owns state, saves it, global shortcuts, space theme |
| `extension/` | the sidebar in the real browser: prototype components on real tabs (`extension/README.md`) |
| `scripts/` | `setup`, `doctor`, `browser.mjs` (build checkout), `loka_build.py` (dev builds), `loka_brand.py` (name, icons) |
| `resources/loka/` | Loka's brand images, drawn by `loka_brand.py assets` |
| `patches/loka/` + end of `patches/series` | Loka's Chromium patches, applied after Helium's (folder appears with the first patch; Helium's linter rejects any file not in the series) |
| `build.py`, `patches/`, `helium-chromium/`, `.github/` | Helium's, kept where Helium has them so merges stay clean |
| `docs/` | `browser-build.md`, `upstream.md`, Helium's original README |

Each feature lives in one folder with its UI, logic and tests. Pure logic goes in `*.logic.ts`, tested directly.
No barrel files. The sidebar model is the spec for the future C++ model, so keep it pure and keep its rules tested.

## Commands

- Install: `bun install`
- Setup a fresh worktree: `bun run setup` (installs deps, copies `.env.local` from the main checkout, picks a free port)
- Doctor: `bun run doctor` (add `--browser` for the Chromium toolchain). Run it first when anything looks off.
- Remove a worktree: `bun run worktree:remove <path>` (stops its dev server, removes the skills junction safely)
- Dev: `bun run dev` (port from `PORT` in `.env.local`; ready when Vite prints `Local: http://localhost:<port>/`)
- Test one file: `bun test prototype/src/features/sidebar/sidebar.test.ts`
- Typecheck and lint the files you changed: `bunx tsc --noEmit` and `bunx biome check <files>`
- Full check (CI runs this; run it only when asked): `bun run check`
- Browser: `bun run browser:setup`, `bun run browser:build`, `bun run browser:run`. See `docs/browser-build.md`.

## Start and ship

- Every task in a new worktree starts with the `worktree-loka` skill. It runs setup and the doctor.
- Helpers get their own worktree through the same skill. Never two agents in one checkout, and never edit the main
  checkout.
- Ship only with the `ship-loka` skill, and only when I say ship or release.
- Only one build checkout exists (`C:\src\loka`, ~100 GB). Ask before syncing it, deleting `build\src`, or starting a
  first build. They cost hours.

## Proving a change works

- Done means you saw it work, not that it compiles. Run the feature the way a user would and look at the result.
- Use the `verify-loka` skill to launch, drive and capture evidence.
- Test with real-shaped data: `sidebar.seed.ts` (three spaces, folders two deep). The `...` menu's "Reset demo data"
  restores it. An empty sidebar is a bad test.
- A test calls the code the way its users do and asserts the exact result. Delete tests that would pass if every
  function returned undefined.
- Never edit or delete a test to make it pass. If the test is wrong, say so and explain why.
- A skipped check is not a pass. Report what you ran, what you saw, and what you did not check.
- Done means: verified, with evidence, and committed.

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
- Don't edit Helium's files (`build.py`, `helium-chromium/`, Helium's patches) unless the change can't live in
  `scripts/` or `patches/loka/`. Every edit there conflicts on the next Helium merge.

## Rules and what enforces them

| Rule | Enforced by |
|---|---|
| The UI is native WebUI + C++ patches; extensions are never the delivery mechanism. In `webui/` and `prototype/src/features/`: no `chrome.*` extension APIs, no `chrome-extension://` URLs (tests may name one), no imports from `extension/` or `prototype/src/demo/` | Biome override in `biome.json` (`noRestrictedGlobals`, `noRestrictedImports`, `scripts/lint/no-extension-urls.grit`) |
| No `any`, no `!` non-null assertions, no unused code | Biome (`biome.json`) |
| Strict types, checked index access | `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`) |
| A tab sits in exactly one place; a folder never goes inside itself | `sidebar.test.ts`, `importState` |
| Build checkout outside OneDrive | `scripts/browser.mjs` refuses, doctor checks |
| Every file in `patches/` is listed in a series | Helium's `lint.yml` in CI (Linux only: on Windows it fails on path separators) |

When I correct you for the same thing twice, add the rule here and make something enforce it (`/correct`).

## Safety

- Never touch my real browser profiles (Helium, Chrome, Edge, the Studi nightly profile). `browser:run` uses
  `C:\src\loka\profile-dev`.
- Releases and CI release builds (`main.yml`, `do-release`) need my explicit go.
- Stop only processes you started, by the PID you captured. Never kill by name.
- No secrets in code, logs, screenshots or commits. Release signing keys live only in GitHub secrets. The legacy
  extension's private key is `C:\src\loka\keys\loka-extension.pem`, ignored by git (`/keys/`); never read, copy or
  move it. Its public half is the `key` in `extension/public/manifest.json`.
- Git: open a PR and wait for CI and my review. Merge Helium releases, never rebase `main`.
