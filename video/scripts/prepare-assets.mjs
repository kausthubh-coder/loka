// Fills capture/assets/ with what the frames use, from the repo's own sources:
//   - the product screenshots, copied from site/public/product/ (taken from the prototype)
//   - planets, the mark and the star field as SVG, drawn with the prototype's numbers
//     (prototype/src/features/sidebar/planet.ts, prototype/src/app/loka-app.ts)
//
//   node scripts/prepare-assets.mjs        (from video/)
//
// capture/ and assets/ are gitignored: this script is how they come back on a fresh checkout.

import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const VIDEO = resolve(import.meta.dirname, "..");
const OUT = join(VIDEO, "capture", "assets");
const SVGS = join(OUT, "svgs");
const SHOTS = resolve(VIDEO, "..", "site", "public", "product");
mkdirSync(SVGS, { recursive: true });

for (const name of readdirSync(SHOTS).filter((f) => f.endsWith(".png"))) {
	copyFileSync(join(SHOTS, name), join(OUT, name));
}

/** A space's planet in a 100x100 box, body radius 46, lit from the top left. Same as planet.ts (not the horizon form). */
function planet(kind, hue) {
	const id = `pl-${kind}-${hue}`;
	const ring = (front) =>
		kind === "ringed"
			? `<g transform="rotate(-16 50 50)"${front ? ` clip-path="url(#${id}-front)"` : ""}>
		<ellipse cx="50" cy="50" rx="76" ry="15" fill="none" stroke="hsl(${hue + 30} 70% 82% / 0.7)" stroke-width="5"/>
		<ellipse cx="50" cy="50" rx="66" ry="13" fill="none" stroke="hsl(${hue + 30} 60% 75% / 0.45)" stroke-width="2"/>
	</g>`
			: "";
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -30 160 160" width="320" height="320">
	<defs>
		<clipPath id="${id}-body"><circle cx="50" cy="50" r="46"/></clipPath>
		<clipPath id="${id}-front" clipPathUnits="userSpaceOnUse"><rect x="-60" y="50" width="220" height="120"/></clipPath>
		<radialGradient id="${id}-lit" cx="0.35" cy="0.28" r="0.85">
			<stop offset="0" stop-color="hsl(${hue} 90% 82%)"/>
			<stop offset="0.38" stop-color="hsl(${hue} 62% 55%)"/>
			<stop offset="1" stop-color="hsl(${hue} 55% 18%)"/>
		</radialGradient>
		<radialGradient id="${id}-shade" cx="0.3" cy="0.24" r="0.95">
			<stop offset="0.5" stop-color="#000" stop-opacity="0"/>
			<stop offset="1" stop-color="#000" stop-opacity="0.7"/>
		</radialGradient>
	</defs>
	${ring(false)}
	<circle cx="50" cy="50" r="46" fill="url(#${id}-lit)"/>
	<g clip-path="url(#${id}-body)">${surface(kind, hue)}</g>
	<circle cx="50" cy="50" r="46" fill="url(#${id}-shade)"/>
	<circle cx="50" cy="50" r="45.5" fill="none" stroke="hsl(${hue} 90% 88% / 0.3)" stroke-width="1"/>
	${ring(true)}
</svg>
`;
}

function surface(kind, hue) {
	if (kind === "banded" || kind === "ringed") {
		const light = `hsl(${hue + 20} 75% 80% / 0.32)`;
		const dark = `hsl(${hue - 15} 60% 28% / 0.38)`;
		return `<g transform="rotate(-14 50 50)">
		<rect x="-10" y="18" width="120" height="6" fill="${light}"/>
		<rect x="-10" y="31" width="120" height="9" fill="${dark}"/>
		<rect x="-10" y="47" width="120" height="5" fill="${light}"/>
		<rect x="-10" y="58" width="120" height="11" fill="${dark}"/>
		<rect x="-10" y="76" width="120" height="6" fill="${light}"/>
		${kind === "banded" ? `<ellipse cx="64" cy="62" rx="8" ry="4" fill="hsl(${hue + 35} 85% 82% / 0.55)"/>` : ""}
	</g>`;
	}
	if (kind === "cratered") {
		const craters = [
			[32, 38, 8],
			[61, 28, 5],
			[62, 61, 10],
			[38, 70, 4.5],
			[78, 46, 3.5],
			[22, 58, 3],
		];
		return craters
			.map(
				([x, y, r]) =>
					`<circle cx="${x}" cy="${y}" r="${r}" fill="hsl(${hue} 45% 22% / 0.42)" stroke="hsl(${hue} 85% 86% / 0.28)" stroke-width="1"/>`,
			)
			.join("");
	}
	const land = `hsl(${hue + 70} 45% 46% / 0.75)`;
	return `<path d="M18 36 C26 24 44 26 46 38 S36 58 26 54 S12 46 18 36 Z" fill="${land}"/>
	<path d="M57 55 C65 47 82 51 80 63 S66 80 58 72 S51 62 57 55 Z" fill="${land}"/>
	<path d="M60 18 C66 14 77 19 72 27 S59 29 60 18 Z" fill="${land}"/>
	<g transform="rotate(-10 50 50)" fill="#fff" fill-opacity="0.5">
		<ellipse cx="42" cy="30" rx="17" ry="2.6"/><ellipse cx="66" cy="47" rx="12" ry="2.2"/><ellipse cx="34" cy="65" rx="15" ry="2.4"/>
	</g>`;
}

/** The mark from the look report: a lit planet and its moon. */
function mark(hue) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">
	<clipPath id="disk"><circle cx="30" cy="34" r="25"/></clipPath>
	<circle cx="30" cy="34" r="25" fill="hsl(${hue} 45% 24%)"/>
	<circle cx="19" cy="24" r="31" fill="hsl(${hue} 85% 72%)" clip-path="url(#disk)"/>
	<circle cx="55" cy="10" r="4.5" fill="hsl(${hue} 85% 72%)"/>
</svg>
`;
}

/** The prototype's star field: 160 stars from seed 7919 in a 1280x800 box. */
function stars() {
	let seed = 7919;
	const rand = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	const circles = Array.from({ length: 160 }, () => {
		const bright = rand() > 0.92;
		const x = (rand() * 1280).toFixed(1);
		const y = (rand() * 800).toFixed(1);
		const r = (bright ? 1 + rand() * 0.8 : 0.35 + rand() * 0.6).toFixed(2);
		const fill = rand() > 0.8 ? "hsl(200 90% 88%)" : "#fff";
		const opacity = (0.25 + rand() * 0.65).toFixed(2);
		return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
	});
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800" width="1920" height="1200" preserveAspectRatio="xMidYMid slice">\n${circles.join("\n")}\n</svg>\n`;
}

const SPACES = [
	{ name: "build", hue: 200, kind: "ringed" },
	{ name: "school", hue: 30, kind: "banded" },
	{ name: "home", hue: 150, kind: "ocean" },
];
for (const s of SPACES) {
	writeFileSync(join(SVGS, `planet-${s.name}.svg`), planet(s.kind, s.hue));
	writeFileSync(join(SVGS, `mark-${s.name}.svg`), mark(s.hue));
}
writeFileSync(join(SVGS, "planet-moon.svg"), planet("cratered", 260));
writeFileSync(join(SVGS, "stars.svg"), stars());
console.log(
	`prepared ${readdirSync(OUT).length - 1} screenshots and ${readdirSync(SVGS).length} SVGs in capture/assets/`,
);
