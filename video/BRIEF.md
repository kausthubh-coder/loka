---
workflow: product-launch-video
flow: automation
storyboard: no
message: "loka is a calm, Arc-style browser for Windows where every space is its own world"
destination: embed
aspect: 1920x1080
language: en
length: 40s
angle: product-reveal
audience: Windows users with too many tabs, Arc users on Windows, people who want a private Chromium browser
---

## Intent

The launch video for loka, an open-source Arc-style browser built on Helium (ungoogled-chromium), Windows first.
It plays on the launch page (`site/`), above the fold's next section, with controls, so it starts only when
someone presses play. 30 to 45 seconds, 16:9. It shows the real product: screenshots of the sidebar
prototype, the night sky and the planets, and ends on the "loka" wordmark plus the waitlist URL.

The signature to land: the sky changes color with the space you're in (Build blue 200, School amber 30, Home
green 150). Tagline: "Every space is its own world."

## Assets

- ../site/public/product/build.png, school.png, home.png: the whole window in each space, 2x, 2560x1600.
- ../site/public/product/sidebar-build.png, sidebar-school.png, sidebar-home.png: the sidebar alone in each space, 2x.
- ../site/public/product/folders.png: Build's pinned tree, two folders deep, 2x.
- ../site/public/product/command-bar.png: Ctrl+K finding a tab in another space, 2x.
- ../site/public/product/search.png: sidebar search finding a tab in a closed folder, 2x.
- ../site/public/product/media.png: the now-playing card above the horizon, 2x.
- ../site/public/product/archive.png: the archived tabs panel, 1x.
- ../site/public/product/import.png: the first-run import step (Chrome, Edge, Arc), 1x.
- The planet art and the mark (a lit planet with a moon) are drawn in SVG from the prototype's `planet.ts`.

## Customizations

- No narration. Short on-screen words carry the message.
- Music: a quiet ambient bed if HeyGen's library has one; otherwise silent.
- The waitlist URL is a placeholder until the site has a domain: `loka.example/waitlist`. It lives in one place
  in `compositions/frames/07-cta.html` so the owner can change it and re-render.

## Notes

- No invented numbers, testimonials or user counts.
- Not yet a downloadable browser: never say "download now". The call is "Join the waitlist".
- Decisions made without asking (autonomous run): no capture (the site isn't deployed; the brief supplies the
  screenshots), a bespoke `frame.md` from loka's own direction instead of a preset (all shipped presets are
  light editorial looks, and loka's look already exists), system UI type to match the product.
