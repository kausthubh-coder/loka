// Draws Loka's mark (a lit planet with its moon, the reports' brand mark) as the PNG icons the extension needs.
//   node scripts/make-icons.mjs
// Run with node: Playwright's browser launch hangs under bun on Windows.

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const out = resolve(import.meta.dirname, "..", "extension", "public", "icons");
mkdirSync(out, { recursive: true });

// On a dark disc so the icon reads on light and dark toolbars alike.
/** @param {number} size */
const mark = (size) => `<!doctype html><html><body style="margin:0;background:transparent">
<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="disk"><circle cx="30" cy="34" r="22"/></clipPath>
    <radialGradient id="sky" cx="0.3" cy="0.2" r="1">
      <stop offset="0" stop-color="hsl(205 55% 22%)"/><stop offset="1" stop-color="hsl(210 50% 8%)"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#sky)"/>
  <circle cx="30" cy="34" r="22" fill="hsl(200 45% 24%)"/>
  <circle cx="20" cy="25" r="27" fill="hsl(200 85% 72%)" clip-path="url(#disk)"/>
  <circle cx="51" cy="12.5" r="4.5" fill="hsl(200 85% 72%)"/>
</svg></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(mark(size));
	await page.locator("svg").screenshot({ path: join(out, `${size}.png`), omitBackground: true });
}
await browser.close();
console.log(`icons written to ${out}`);
