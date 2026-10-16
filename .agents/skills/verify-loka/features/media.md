# Media controls

When a tab off screen has a media session (playing, or else the first one that's paused), a now-playing card sits
above the horizon, from the page's own
media session (`getMedia`, `media-changed`): its artwork (with a moving equalizer while playing), title and artist,
previous, play or pause, next (`mediaAction`), and mute (`setMuted`). Clicking the art or title goes to the playing
tab, in whatever space it is.

## Sub-features

- `media-card` shows while a tab with a media session is off screen, and stays after Pause (`nowPlaying` in
  `media.logic.ts`).
- `media-controls`: play/pause, previous and next go to the page's media session; mute to the tab.
- `media-go` reveals the playing tab.

## How to get to it (user POV)

- Play something, then switch to another tab or space.

## Driving it with loka.mjs

Preconditions: seed data. The fake browser's media session plays in the `Lo-fi beats` tab (Home), browser tab 101,
starting on "Snowman" by "Lofi Girl, WYS".

- **Controls.** In `getByRole("region", { name: /^Now playing: / })`, click `Next track` (the region becomes
  `Now playing: Coffee Break`), `Pause` (it becomes `Play`) and `Mute` (it becomes `Unmute`).
- **Go.** Click the first `Go to Lo-fi beats` (the art and the title both have that name): `space` is `Home`,
  `activeTab` is `Lo-fi beats`, and the card goes.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs media`.
- **In the browser.** `bun run verify -- --ux media` runs it, verify:browser ("getMedia lists the playing tab",
  "mediaAction pause stops it within 3 s", "mediaAction play starts it again") and verify:flows `panels`: "the media
  card shows what's playing in another tab", "Pause pauses it", "Play plays it again", "Next track reaches the page's
  handler", "Mute mutes its tab". Not checked in the browser: Go, Unmute, and the card hiding while its tab shows.

## Gotchas

- The card's title is the media session's, not the tab's.
- Media state is runtime only, never saved.
