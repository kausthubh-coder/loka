---
version: alpha
name: loka night — Frame (video / frame layer)
description: >
  Video companion to loka's direction (site/.critly/direction.md). The ground is a night sky tinted by the
  space you're in: Build blue (hue 200), School amber (hue 30), Home green (hue 150). One system UI family
  (Segoe UI Variable), set heavy and tight for display. The product is the picture: real screenshots of the
  sidebar prototype, framed as a window on the sky. Planets and the mark are SVG, lit from the top left.
unit: the frame — 1920×1080
principle: the sky carries the brand · the product is the picture · words are few and plain

colors:
  canvas: "#06090d"
  ink: "#ececf1"
  muted: "#a7a8b4"
  accent-build: "#7fd0f5"
  accent-school: "#f5b77a"
  accent-home: "#7ff0b8"
  ring: "rgba(196, 222, 240, 0.16)"
  accent-fg: "#0d1a21"

hues:
  build: 200
  school: 30
  home: 150

radii:
  control: "8px"
  surface: "12px"
  window: "18px"
  circle: "50%"

typography:
  display:  { fontFamily: "Segoe UI Variable Display", px: 112, weight: 700, lineHeight: 1.0, tracking: "-0.035em", color: "ink" }
  h1:       { fontFamily: "Segoe UI Variable Display", px: 84, weight: 650, lineHeight: 1.04, tracking: "-0.03em", color: "ink" }
  h2:       { fontFamily: "Segoe UI Variable Display", px: 60, weight: 650, lineHeight: 1.08, tracking: "-0.025em", color: "ink" }
  label:    { fontFamily: "Segoe UI Variable Text", px: 34, weight: 600, lineHeight: 1.2, color: "ink" }
  body:     { fontFamily: "Segoe UI Variable Text", px: 30, weight: 400, lineHeight: 1.4, color: "muted" }
  key:      { fontFamily: "Segoe UI Variable Text", px: 28, weight: 600, lineHeight: 1, color: "ink" }
  wordmark: { fontFamily: "Segoe UI Variable Display", px: 168, weight: 650, lineHeight: 1, tracking: "-0.04em", color: "ink" }

spacing:
  pad-x: "120px"
  pad-y: "96px"
  gap: "32px"

components:
  sky:
    background: >
      radial-gradient(60% 50% at 6% 0%, hsl(H 58% 34% / .45), transparent 70%),
      radial-gradient(38% 34% at 26% 58%, hsl(H+40 45% 32% / .18), transparent 70%),
      radial-gradient(55% 55% at 100% 100%, hsl(H-35 42% 26% / .28), transparent 70%),
      linear-gradient(165deg, hsl(H 32% 8%), hsl(H 38% 4%))
    stars: "the prototype's seeded field: 160 stars, seed 7919, drawn in a 1280x800 box scaled to cover"
    description: "Full-bleed ground for every frame. H is the space hue. Changing H is the signature move."
  window:
    rounded: "{radii.window}"
    shadow: "0 40px 120px rgba(0,0,0,.6), 0 0 0 1px {colors.ring}"
    description: "A product screenshot shown as the browser window floating on the sky. Never cropped mid-sidebar."
  crop:
    rounded: "{radii.surface}"
    shadow: "0 24px 64px rgba(0,0,0,.55), 0 0 0 1px {colors.ring}"
    description: "A close crop of one feature (command bar, search, folders, media card)."
  key-cap:
    rounded: "{radii.control}"
    border: "1.5px solid rgba(255,255,255,.28), bottom 4px"
    typography: "{typography.key}"
    description: "Keyboard shortcut chips (Ctrl, K, 1–9). Used only where a shortcut is the point."
  cta-pill:
    backgroundColor: "accent of the current space"
    textColor: "{colors.accent-fg}"
    rounded: "{radii.control}"
    typography: "{typography.label}"
    description: "The one solid element, final frame only: Join the waitlist."
  planet:
    description: "The prototype's planets (ringed, banded, cratered moon, ocean), radial-lit from the top left, in the space hue."
  mark:
    description: "A lit planet and its small moon, top right. Lit side hsl(H 85% 72%), shade hsl(H 45% 24%)."

---

## Overview

loka's look is the night window from the prototype. Everything sits on a dark sky that takes the color of the
current space, and the sky changing color is what nobody else has. Keep it, use it the same way every time.

## The frame

- One idea per frame. A headline of five words or fewer, at most one line of body.
- The product screenshot is the hero whenever one is on screen: large, sharp, framed as a window.
- Text sits on the sky, never on the screenshot.

## Do

- Ease every move with a long tail (power3.out / expo.out). Calm, not bouncy.
- Shift the sky hue with the product's own curve: 420ms-ish, cubic-bezier(0.2, 0, 0, 1), stretched for video.
- Keep the stars still or drifting a few px; they are the ground, not a show.

## Don't

- No invented numbers, logos, testimonials, cursors or browser chrome that isn't in the screenshot.
- No gradients or glows beyond the sky itself and the planet glow.
- No uppercase tracking-heavy labels; loka's voice is plain sentence case.
