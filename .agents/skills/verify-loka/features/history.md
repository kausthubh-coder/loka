# History

Loka's own History page (chrome://history, `webui/history.html`, its own handler through `history-bridge.ts`):
visits grouped by day under headings that stay put while the day scrolls, a search field, picking rows and deleting
them, and "Clear history" for the last hour, today or everything after a confirm. It loads 100 visits at a time as
you scroll.

## Sub-features

- `history-days`: Today, Yesterday, then dates; the year once it isn't this one.
- `history-search`: debounced; days off screen skip layout (content-visibility).
- `history-pick`: a row's box, Shift for a run, Space on the keyboard, Ctrl+A for all; Delete removes every visit to
  those pages, `Cancel selection` drops the pick.
- `history-remove`: each row's `Remove <title> from history` button.
- `history-clear`: the menu and its confirm (it can't be undone). The menu takes focus and moves with the arrows;
  the confirm focuses its Clear button, makes the page behind it inert, and gives focus back to "Clear history".
- `history-keys`: arrows, Home and End, Enter (Ctrl for a new tab), Delete, Escape, `/` or Ctrl+F to search.
- `history-header`: full width; clear over the sky at the top and frosted once the list scrolls under it (always
  frosted where `scroll-state` queries aren't supported). A stuck day heading sits on a glass pill.

## How to get to it (user POV)

- Ctrl+H, the sidebar's `...` menu > History, or the command bar's History.

## Driving it with loka.mjs

Preconditions: the fake history (`prototype/src/demo/fake-history.ts`), about 1,800 seeded visits over 45 days.

- **Open.** Ctrl+H: the page shows `loka://history` with a `Today` heading.
- **Search.** Fill the `searchbox` "Search history" with `lit:`: every row's text contains `Lit:`.
- **Delete.** Click the first row's checkbox, Shift-click the third: "3 selected"; click `Delete`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs history`.
- **In the browser.** `bun run verify -- --ux history` runs it and verify:flows `settings`: "Ctrl+H opens
  chrome://history", "History search finds a visited page", "Remove from history deletes it", "Clear history: today
  empties it". Not checked in the browser: picking rows, the last hour and everything, Cancel on the confirm,
  loading more, and the keys.

## Gotchas

- Read rows with `allTextContents()`, not `allInnerTexts()`: days off screen aren't rendered, so their innerText is
  empty.
- Deleting removes every visit to a page, so more rows can go than were picked.
