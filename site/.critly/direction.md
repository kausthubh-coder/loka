# Direction

Subject: loka, an open-source Arc-style browser on Helium, Windows first, for people who keep many tabs in work, school and home.
Job: say it's a calm, private, Arc-style browser for Windows, show the sidebar with its spaces, and get a waitlist sign-up.
Kept: the existing design, the prototype's night window (option B in `.agents/reports/2026-10-15-loka-look.html`), described here, not reinvented.
References: the prototype window (`prototype/src/app/loka-app.ts`), its onboarding, and the brand panel in the look report.

## Materials
- Type: one family, the system UI face (Segoe UI Variable on Windows). Headings and the wordmark 650 weight, -0.03em at display size. No web fonts.
- Palette: every color takes the active space's `--hue` (Build 200, School 30, Home 150). Ground `hsl(h 38% 4%)` to `hsl(h 32% 8%)` with a glow `hsl(h 58% 34% / .45)` top left and a faint band of light. Ink `#ececf1`, muted `#a7a8b4`. Accent `hsl(h 85% 72%)`, solid buttons in it with dark text `hsl(h 50% 10%)`.
- Shape: 8px controls, 12px surfaces and windows. Surfaces separate by a tinted fill and a 1px ring `hsl(h 40% 80% / .14)`; one shadow `0 12px 32px #0008`. Light comes from the top left.
- Imagery: real prototype screenshots, at 2x, framed as the window on the night sky. Planets drawn in SVG from `features/sidebar/planet.ts` (ringed, banded, moon, ocean), lit top left.
- Signature: the sky changes color with the space. On the page, picking a space recolors the whole page and swaps the screenshot. The mark: a lit planet with a moon, in the space's color.
- Voice: plain, calm, specific. Name the key or the feature, never a superlative. Errors and money: plain and calm.
- Density and pace: persuade surface, comfortable, 18px body. Color shifts ease over 420ms `cubic-bezier(.2,0,0,1)`; nothing moves on scroll. Reduced motion keeps the color fade and drops movement.

## Standard
Layout, navigation, controls and states follow the platform and Critly's concepts.
