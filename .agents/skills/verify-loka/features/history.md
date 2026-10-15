# History

Loka's own History page (chrome://history, `webui/history.html`, its own handler through `history-bridge.ts`):
the sky with two glass cards on it. A rail on the left (a header over the list when the page is under 820px wide)
has the title, search, the date filters and "Clear history…". The list card shows visits grouped by day under
headings that stay put while the day scrolls. It loads 100 visits at a time as you scroll.

## Sub-features

- `history-days`: Today, Yesterday, then dates; the year once it isn't this one.
- `history-search`: debounced; days off screen skip layout (content-visibility). `/` can be typed in the field.
- `history-filter`: All, Today, Yesterday, This week (the last seven days) and Older. The browser is asked from the
  filter's end, and loading stops at its start (`dateSpan`, `takeSpan` in `history.logic.ts`).
- `history-rows`: icon, title and site only; time and × show on hover or focus; the full address is the row's
  tooltip. Redirect links (youtube.com/redirect, google.com/url, l.facebook.com/l.php...) are named for where they
  went (`redirectTarget`, `displayHost`, `visitTitle`). A page with no title is named by its path, or its host.
- `history-sites`: three or more back-to-back visits to one site on one day fold into a row ("github.com, 3
  visits", `groupRuns`). Click, Enter or Right opens it; its visits hang under it. Left closes it.
- `history-pick`: a row's box, Shift for a run, Space on the keyboard; a site row picks all its visits. A bar at the
  bottom says "N selected" with Cancel and Delete. Delete removes every visit to those pages.
- `history-clear`: the menu and its confirm (it can't be undone). The menu takes focus and moves with the arrows;
  the confirm focuses its Clear button, makes the page behind it inert, and gives focus back to "Clear history…".
- `history-keys`: arrows, Home and End, Enter (Ctrl for a new tab), Right/Left into and out of a site, Delete,
  Escape, `/` to search.
- `history-look`: glass cards (blur only on the two cards, solid with reduced transparency); light and dark. The sky
  is Loka blue (hue 200): the History handler can't read the profile store yet, so it can't follow the space.

## How to get to it (user POV)

- Ctrl+H, the sidebar's `...` menu > History, or the command bar's History.

## Driving it with loka.mjs

Preconditions: the fake history (`prototype/src/demo/fake-history.ts`), about 1,800 seeded visits over 45 days, with
runs on one site, redirect links and a page with no title mixed in.

- **Open.** Ctrl+H: the page shows `loka://history` with a `Today` heading.
- **Rows.** `[role="tree"] > [role="treeitem"]` are a day's top rows; a folded site has `aria-expanded` and the label
  `<host>, <n> visits`, its visits in its `[role="group"]`.
- **Filter.** Click the `Yesterday` button: the only day heading is Yesterday.
- **Search.** Fill the `searchbox` "Search history" with `lit:`: every row is a Lit page or lit.dev folded.
- **Delete.** Click the first row's checkbox, Shift-click the third: "N selected"; click `Delete`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs history`.

## Gotchas

- Read rows with `allTextContents()`, not `allInnerTexts()`: days off screen aren't rendered, so their innerText is
  empty.
- Deleting removes every visit to a page, so more rows can go than were picked.
- The list scrolls inside `loka-history`'s `.scroller`, not the window: scroll that element.
- In the real browser, a redirect that hops on by itself (YouTube's) leaves only its target in history; one with an
  interstitial (Google's "Redirect Notice") stays, and is shown named for its target.
