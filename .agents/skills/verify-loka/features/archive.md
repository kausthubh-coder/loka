# Archive

Opt-in: open tabs not shown for a set time move to Archived tabs. Pinned tabs, Essentials and the tab a space is
showing never do. Archived tabs can be searched and brought back to the top of their own space.

## Sub-features

- `archive-setting`: Settings > Tabs > Archive open tabs: Never (default), 12 hours, a day, a week, 30 days.
- `archive-run`: runs when the setting changes, on load, and every minute.
- `archive-panel`: `...` > `Archived tabs (N)`, or Ctrl+K > `Archived tabs`: search, click to restore, Clear.
- `archive-restore`: puts the tab at the top of its space's open tabs, switches there and shows it.

## How to get to it (user POV)

- Settings > Tabs. The sidebar's `...` menu. Ctrl+K `archived`.

## Driving it with loka.mjs

Preconditions: seed data. The seed's open tabs were last shown: Arc 3 days ago, Zen 26 hours ago, Hacker News 2 hours
ago.

- **Turn on.** Settings, `combobox` "Archive open tabs", select `After a day`. Arc and Zen leave `open`; `state().archive`
  holds them, newest first.
- **Restore.** `...` > `Archived tabs (2)`, click the `Zen Browser` row. `open[0]` and `activeTab` are `Zen Browser`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs archive`.

## Gotchas

- `loka.ui()` returns what was saved; a fresh run saves only `{ onboarded: true }`, so `archiveAfterHours` is absent
  there, not null. Check behavior (tabs still open), not the raw pref.
- Tabs without `lastActiveAt` (data from before the archive existed) are never archived.
- The archive keeps the newest 200.
