# History

Loka's own History page (chrome://history, `webui/history.html`, its own handler through `history-bridge.ts`):
visits grouped by day under headings that stay put while the day scrolls, a search field, picking rows and deleting
them, and "Clear history" for the last hour, today or everything after a confirm. It loads 100 visits at a time as
you scroll.

## Sub-features

- `history-days`: Today, Yesterday, then dates; the year once it isn't this one.
- `history-search`: debounced; days off screen skip layout (content-visibility).
- `history-pick`: a row's box, Shift for a run, Space on the keyboard; Delete removes every visit to those pages.
- `history-clear`: the menu and its confirm (it can't be undone).
- `history-keys`: arrows, Home and End, Enter (Ctrl for a new tab), Delete, Escape, `/` to search.

## How to get to it (user POV)

- Ctrl+H, the sidebar's `...` menu > History, or the command bar's History.

## Driving it with loka.mjs

Preconditions: the fake history (`prototype/src/demo/fake-history.ts`), about 1,800 seeded visits over 45 days.

- **Open.** Ctrl+H: the page shows `loka://history` with a `Today` heading.
- **Search.** Fill the `searchbox` "Search history" with `lit:`: every row's text contains `Lit:`.
- **Delete.** Click the first row's checkbox, Shift-click the third: "3 selected"; click `Delete`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs history`.

## Gotchas

- Read rows with `allTextContents()`, not `allInnerTexts()`: days off screen aren't rendered, so their innerText is
  empty.
- Deleting removes every visit to a page, so more rows can go than were picked.
