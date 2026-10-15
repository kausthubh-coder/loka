# Media controls

When a tab is playing and isn't the one on screen, a now-playing card sits above the horizon: artwork (with a moving
equalizer while playing), title and artist, previous, play or pause, next, and mute. Clicking the art or title goes to
the playing tab, in whatever space it is.

## Sub-features

- `media-card` shows only while the playing tab is off screen.
- `media-controls`: play/pause and mute change state; previous and next do nothing yet (the sample has one track).
  In the real browser the card follows the tab's sound and play or pause shows the tab; reaching the page's media
  session (`getMedia`, `mediaAction`) is planned in `webui/src/messages.ts`.
- `media-go` reveals the playing tab.

## How to get to it (user POV)

- Play something, then switch to another tab or space.

## Driving it with loka.mjs

Preconditions: seed data. The prototype starts with `Lo-fi beats` (Home) playing, so the card shows in Build.

- **Controls.** In `getByRole("region", { name: "Now playing: Lo-fi beats" })`, click `Pause` (it becomes `Play`) and
  `Mute` (it becomes `Unmute`).
- **Go.** Click `Go to Lo-fi beats`: `space` is `Home`, `activeTab` is `Lo-fi beats`, and the card is gone.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs media`.

## Gotchas

- Media state is runtime only, never saved. The real browser builds the card from a tab's `audible` flag
  (`webui/src/sync.ts`) until the media-session messages land.
