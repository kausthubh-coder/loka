# Sound

Soft synthesized cues confirm sidebar actions: switching and creating spaces, opening and closing tabs and folders,
pinning and unpinning, dropping a tab into a folder, opening the command bar, and Clear. One module
(`prototype/src/features/sound/`) plays them for every page. On by default at half volume; Settings > Sound has the
switch and a volume slider.

## Sub-features

- `sound-cues`: each action above plays its cue from its own handler; the cue table and throttle are in
  `sound.logic.ts`, unit tested.
- `sound-gate`: nothing plays before the person has clicked or pressed a key in the page, while it's hidden, or with
  sound off; repeats within 120ms, cues within 40ms of another, and more than three in 600ms are dropped.
- `sound-settings`: the switch and volume save to the window prefs (`sound`, `soundVolume`); letting go of the slider
  plays a preview.

## How to get to it (user POV)

- Click a folder, press Ctrl+2, open Ctrl+K. Settings is in the `...` menu.

## Driving it with loka.mjs

Preconditions: seed data.

- **Count cues.** An init script wraps `OscillatorNode.prototype.start` and counts calls; reload so it's in place.
  Most cues start two oscillators.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs sound`: none on load, one per action, none for the
  space already shown, fewer cues than five quick clicks, none after the switch turns sound off.

## Gotchas

- Headless Chromium runs WebAudio silently, so a count is the evidence; listening needs a headed browser.
- Noise layers use `AudioBufferSourceNode`, which has its own `start`: the oscillator count leaves them out.
- A page that plays a cue is audible for about two seconds after it, as any tab is.
