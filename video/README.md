# loka launch video

A HyperFrames project for the launch video on the site: about 42 seconds, 1920x1080, eight frames on the night
sky, built from real prototype screenshots, with a music bed and no narration. It ends on the loka wordmark,
"Join the waitlist" and the waitlist URL.

| File | What it is |
| --- | --- |
| `BRIEF.md` | what the video must say and the decisions made without asking |
| `frame.md` | the look, from `site/.critly/direction.md` |
| `STORYBOARD.md` | the eight frames, each a time-coded shot |
| `compositions/frames/NN-*.html` | one composition per frame |
| `index.html` | the assembled video (written by the assemble step below) |
| `scripts/prepare-assets.mjs` | copies the screenshots from `site/public/product/` and draws the planets, the mark and the stars as SVG |

`capture/assets/`, `assets/` and `renders/` are gitignored; the commands below rebuild them. The music bed
(`assets/bgm/track.mp3`) comes from HeyGen's music library through the HyperFrames audio step; it needs a
HeyGen sign-in (`npx hyperframes auth status`).

## The waitlist URL

It's a placeholder, `loka.example/waitlist`, set in one line at the top of the script in
`compositions/frames/08-cta.html` (`const WAITLIST_URL`). Change it and re-render once the site has a domain.

## Build and render

`SKILL` is the product-launch-video workflow's folder (`C:\Users\kaust\.skills-parked\product-launch-video` on
this machine). Run from `video/`:

```
node scripts/prepare-assets.mjs
node $SKILL/scripts/stage-assets.mjs --storyboard ./STORYBOARD.md --hyperframes .
node $SKILL/scripts/audio.mjs --storyboard ./STORYBOARD.md --hyperframes . --out ./audio_meta.json   # only if assets/bgm/ is empty
node $SKILL/scripts/assemble-index.mjs --storyboard ./STORYBOARD.md --hyperframes .
node $SKILL/scripts/transitions.mjs inject --storyboard ./STORYBOARD.md --hyperframes .
node $SKILL/scripts/transitions.mjs verify --storyboard ./STORYBOARD.md --index ./index.html
npx --yes hyperframes@0.8.160 lint
```

These start a headless browser, so on this laptop run them only with at least 3 GB free or after the Chromium
build has finished:

```
npx --yes hyperframes@0.8.160 check
npx --yes hyperframes@0.8.160 snapshot --at 2.5,7,12,15,20,25,30,35,40
npx --yes hyperframes@0.8.160 render --skill=product-launch-video --quality high --output renders/video.mp4
```

Then put it on the site, with a poster from the space-switch frame:

```
cp renders/video.mp4 ../site/public/launch.mp4
ffmpeg -y -ss 12 -i renders/video.mp4 -frames:v 1 -q:v 3 ../site/public/launch-poster.jpg
```

The page shows its video section only when both files exist.

The fonts are the Windows system faces (Segoe UI Variable, declared with `local()`), so render on Windows, not on
Lambda or Cloud Run.
