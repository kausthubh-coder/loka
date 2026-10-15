---
name: verify-loka
description: Launch and drive Loka to prove a change works, with screenshots, ARIA snapshots and saved state as evidence. Use after any change to the sidebar prototype (spaces, folders, tabs, Essentials, export/import), and for the browser build once one exists.
---

# Verify Loka

Loka has two surfaces:

- **Sidebar prototype** (primary today): a web page served by Vite. Drive it with Playwright through
  `scripts/loka.mjs`. Every recipe below is for this surface.
- **Browser build**: Helium plus Loka patches in `C:\src\loka`. It has no Loka patches yet, so there is nothing
  Loka-specific to drive. See `features/browser-build.md` for the state of that and how to launch it.

Run every script here with **node**, never bun. Playwright's browser launch hangs under bun on Windows.

## Launch

From the checkout root, after `bun run setup` (it writes this checkout's `PORT` to `.env.local`):

```
bun run dev
```

Run it in the background and keep its PID. It is ready when Vite prints `Local: http://localhost:<PORT>/`.
`strictPort` is on, so if the port is taken it exits instead of moving. Then run the doctor.

Each worktree has its own port, and the browser stores data per origin, so runs in different worktrees don't share
state. Two agents driving one checkout's server would overwrite each other's localStorage, so drive only a server
you started.

## Doctor

```
node .agents/skills/verify-loka/scripts/doctor.mjs
```

It checks that the page at this checkout's port is the Loka prototype and that the listening process was started
from this checkout. Run it first, and again whenever a recipe fails strangely.

## Drive

Run the mapped recipes:

```
node .agents/skills/verify-loka/scripts/run.mjs <folders|spaces|tabs|essentials|export-import|all>
```

Each one opens a fresh browser, resets the app to the seed data, drives the UI the way a user would (clicks,
drags, right-click menus, keyboard), asserts the saved state, and prints `PASS` or `FAIL` with its evidence folder.

For a change the recipes don't cover, write a short script next to your work that imports the driver:

```js
import { openLoka } from "<checkout>/.agents/skills/verify-loka/scripts/loka.mjs";
const loka = await openLoka("pin-from-command-bar");   // seed data, evidence folder created
await loka.row("Hacker News").click({ button: "right" });
await loka.menuItem("Pin to space").click();
console.log(await loka.outline());                     // { space, activeTab, essentials, pinned, open }
await loka.proof("after-pin");
await loka.close();                                    // throws if the page logged errors
```

Driver handles, all by accessible name:

| Handle | Finds |
|---|---|
| `loka.row(text)` | a pinned or open row (tab or folder) in the visible space |
| `loka.essential(title)` | an Essentials tile |
| `loka.space(name)` | a neighbouring planet on the horizon (only the spaces next to the current one) |
| `loka.menuItem(label)` | a context-menu item after a right-click |
| `loka.drag(source, target, "before" \| "after" \| "into")` | a real HTML5 drag onto the target's top edge, bottom edge or middle |
| `loka.outline()` / `loka.state()` | the saved state, readable / raw |
| `loka.proof(name)` | `<name>.png`, `<name>.aria.txt`, `<name>.outline.json` |

Other stable handles: the URL pill button (`github.com Ctrl K`), the Ctrl+K textbox (`Search or enter address`),
`More` (the `...` menu), `New folder`, `Spaces: <current space>` (the big planet), `Clear`, and
`Close <tab title>` buttons.

## Evidence

Evidence goes to `.agents/verify-runs/<time>-<name>/` (gitignored, never deleted by cleanup). A proof:

- drives the real user path: clicks, drags, menus and keys, never calling app functions from `page.evaluate`;
- captures the state before and after the action (`proof("before")`, `proof("after")`), not just the final screen;
- checks the stored result (`outline()` reads what the app saved to localStorage) and that it survives a reload
  when persistence matters;
- ends with `close()`, which fails the run if the page logged a console error.

Report the feature, the recipe or script you ran, PASS or FAIL, and the evidence folder.

## Cleanup

Stop the dev server you started, by its PID, with its children: `taskkill /T /F /PID <pid>`. Never kill by name.
Recipes close their own browsers. Leave `.agents/verify-runs/` alone. If you need the seed data back in a
browser you use by hand, choose `...` > `Reset demo data`.

## Feature map

`features/README.md` lists every user-facing feature and how to prove each. A proof that drives one entry point is
incomplete when the map lists others. After a feature changes, update its map file and its recipe in
`scripts/run.mjs` in the same change.
