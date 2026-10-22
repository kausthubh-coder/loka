# Archive

Open tabs not shown for 12 hours (by default) move to Archived tabs, and so do open tabs closed by hand (the `x`, a
middle click, Ctrl+W, Clear, Close other tabs, or the browser closing the tab), newest first. Pinned tabs, Essentials,
the tab a space is showing and tabs playing sound never do. Archived tabs can be searched and brought back to the top of their own
space. Separately, the loaded tabs of spaces no window shows unload after 30 minutes out of sight (by default): they
keep their row, Back history, title and icon, and load again when opened.

## Sub-features

- `archive-setting`: Settings > Tabs > Archive open tabs: Never, After 12 hours (default), After a day, After a week,
  After 30 days. Saved as `archiveAfterHours` in `ui.v1`; 0 is Never. Off used to be saved as `null`, which now
  reads as the default.
- `archive-run`: in the prototype, runs when the setting changes, on load, and every minute. In the real browser it
  runs only on the sync's 60 s tick, so a new setting takes effect within a minute. Loaded tabs playing sound stay.
- `archive-panel`: `...` > `Archived tabs (N)`, or Ctrl+K > `Archived tabs`: search, click to restore, Clear.
- `archive-restore`: puts the tab at the top of its space's open tabs, switches there and shows it.
- `tab-sleep`: Settings > Tabs > Unload other spaces' tabs: After 15 minutes, After 30 minutes (default), After an
  hour, After 2 hours, Never. Saved as `sleepAfterMinutes` in `ui.v1`; 0 is Never. The browser does it
  (`LokaTabSleeper`, in `patches/loka/loka-native-sidebar.patch`): once a minute, and at once when the setting
  changes, it discards loaded tabs in folded tab groups (other spaces) that have been hidden that long, with
  Chromium's proactive-discard rules (no sound, capture, picture-in-picture, form input or notifications
  permission). `getTabs` reports `discarded`. The prototype only saves the setting.

## How to get to it (user POV)

- Settings > Tabs. The sidebar's `...` menu. Ctrl+K `archived`.

## Driving it with loka.mjs

Preconditions: seed data. The seed's open tabs were last shown: Arc 9 hours ago, Zen 5 hours ago, Hacker News 2
hours ago, all inside the 12-hour default.

- **Default.** Nothing is archived at load; Settings' `combobox` "Archive open tabs" reads `12`.
- **Time passes.** `page.clock.install()`, reload, `page.clock.fastForward("08:00:00")`: the minute tick archives Arc
  (17 h) and Zen (13 h); Hacker News (10 h) stays. `state().archive` holds them, newest first.
- **Restore.** `...` > `Archived tabs (2)`, click the `Zen Browser` row. `open[0]` and `activeTab` are `Zen Browser`.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs archive`.
- **In the browser.** `bun run verify -- --ux archive` runs it and verify:flows `panels` ("the Archive panel opens"),
  `settings` (both settings' defaults and that each saves) and `sleep` (a QA page in Research unloads while Play
  shows, keeps its row, and loads again in the same tab when clicked; the setting is set to 0.05 minutes there), and
  `tabs` ("closed tabs go to the top of the archive, so they can come back").
  Not checked in the browser: tabs archiving by age (it needs old `lastActiveAt` values or a 60 s wait), restoring,
  search and Clear, Reopen closed tab bringing a row back (CDP can't press browser shortcuts; the model cases cover
  the rule), and that Chromium's rules keep a tab playing sound loaded.

## Gotchas

- `loka.ui()` returns what was saved; a fresh run saves only `{ onboarded: true }`, so `archiveAfterHours` is absent
  there and reads as 12. Check behavior (tabs still open), not the raw pref.
- Tabs without `lastActiveAt` (data from before the archive existed) are never archived.
- The archive keeps the newest 200.
- The sleeper only looks at folded tab groups, so the space on screen and Essentials are left to Memory Saver.
