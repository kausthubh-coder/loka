# Media controls

When a tab is playing and isn't the one on screen, a now-playing card sits above the horizon, from the page's own
media session (`getMedia`, `media-changed`): its artwork (with a moving equalizer while playing), title and artist,
previous, play or pause, next (`mediaAction`), and mute (`setMuted`). Clicking the art or title goes to the playing
tab, in whatever space it is.

## Sub-features

- `media-card` shows only while the playing tab is off screen (`nowPlaying` in `media.logic.ts`).
- `media-controls`: play/pause, previous and next go to the page's media session; mute to the tab.
- `media-go` reveals the playing tab.

## How to get to it (user POV)

- Play something, then switch to another tab or space.

## Driving it with loka.mjs

Preconditions: seed data. The fake browser's media session plays in the `Lo-fi beats` tab (Home), browser tab 101,
starting on "Snowman" by Lofi Girl.

- **Controls.** In `getByRole("region", { name: /^Now playing: / })`, click `Next track` (the region becomes
  `Now playing: Coffee Break`), `Pause` (it becomes `Play`) and `Mute` (it becomes `Unmute`).
- **Go.** Click `Go to Lo-fi beats`: `space` is `Home`, `activeTab` is `Lo-fi beats`, and the card goes.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs media`.

## Gotchas

- The card's title is the media session's, not the tab's.
- Media state is runtime only, never saved.
