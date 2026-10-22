import { expect, test } from "bun:test";
import { SPACE_HUES } from "../features/sidebar/planet";
import { skyStyles } from "./sky";
import {
	contrast,
	hslToRgb,
	INK,
	type InkRole,
	inkRgb,
	oklchToRgb,
	type Rgb,
	resolveScheme,
	rgbToOklch,
	type Scheme,
} from "./theme.logic";

test("a space's own choice wins; system follows the computer", () => {
	expect([resolveScheme("light", true), resolveScheme("dark", false)]).toEqual(["light", "dark"]);
	expect([resolveScheme("system", true), resolveScheme("system", false)]).toEqual(["dark", "light"]);
});

const round = (rgb: Rgb) => rgb.map(Math.round);

test("contrast is WCAG's: 21:1 black on white, 1:1 a color on itself, #767676 on white just passes 4.5:1", () => {
	expect(contrast([0, 0, 0], [255, 255, 255])).toBe(21);
	expect(contrast([120, 40, 200], [120, 40, 200])).toBe(1);
	expect(contrast([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2);
	expect(contrast([0x77, 0x77, 0x77], [255, 255, 255])).toBeCloseTo(4.48, 2);
});

test("hsl and OKLCH convert the way the browser draws them", () => {
	expect(round(hslToRgb(200, 80, 50))).toEqual([25, 161, 230]);
	expect(round(hslToRgb(30, 62, 93))).toEqual([248, 237, 226]);
	// The same color there and back.
	const [l, c, h] = rgbToOklch([25, 161, 230]);
	expect(round(oklchToRgb(l, c, h))).toEqual([25, 161, 230]);
	// What Chrome drew for these inks, read from the contrast recipe's screenshots.
	expect(round(inkRgb(260, "light", "ink-3"))).toEqual([75, 75, 93]);
	expect(round(inkRgb(90, "dark", "ink-3"))).toEqual([172, 180, 167]);
	expect(round(inkRgb(175, "dark", "ink-3"))).toEqual([164, 181, 179]);
});

/**
 * The plain colors of each scheme's sky, read from sky.ts's own CSS: the stops of `.sky` (dark) and `.sky.light`,
 * for the eight space hues. The nebula, clouds, stars and panels on top are the contrast recipe's to measure.
 */
function skyStops(scheme: Scheme, hue: number): Rgb[] {
	const rule =
		scheme === "dark" ? /\.sky,\s*\.sky-was\s*\{([^}]*)\}/ : /\.sky\.light,\s*\.sky-was\.light\s*\{([^}]*)\}/;
	const body = skyStyles.cssText.match(rule)?.[1] ?? "";
	const stops = [...body.matchAll(/hsl\((?:var\(--hue\)|calc\(var\(--hue\) ([+-]) (\d+)\)) (\d+)% (\d+)%\)/g)];
	return stops.map(([, sign, shift, s, l]) =>
		hslToRgb(hue + (sign === "-" ? -1 : 1) * Number(shift ?? 0), Number(s), Number(l)),
	);
}

test("the sky's colors are where the test reads them", () => {
	expect(skyStops("dark", 200)).toHaveLength(3);
	expect(skyStops("light", 200)).toHaveLength(4);
});

test("every text color reaches 4.5:1 on its scheme's sky, for every space color", () => {
	const short: string[] = [];
	for (const scheme of ["dark", "light"] as const) {
		for (const role of Object.keys(INK[scheme]) as InkRole[]) {
			for (const hue of SPACE_HUES) {
				const worst = Math.min(...skyStops(scheme, hue).map((sky) => contrast(inkRgb(hue, scheme, role), sky)));
				if (worst < 4.5) short.push(`${scheme} ${role} hue ${hue}: ${worst.toFixed(2)}`);
			}
		}
	}
	expect(short).toEqual([]);
});

test("each scheme's text steps stay apart: names, then secondary, then the quietest", () => {
	for (const scheme of ["dark", "light"] as const) {
		const [ink, ink2, ink3] = (["ink", "ink-2", "ink-3"] as const).map((role) => INK[scheme][role].l);
		const sign = scheme === "dark" ? 1 : -1;
		expect(sign * ((ink ?? 0) - (ink2 ?? 0))).toBeGreaterThanOrEqual(0.05);
		expect(sign * ((ink2 ?? 0) - (ink3 ?? 0))).toBeGreaterThanOrEqual(0.05);
	}
});
