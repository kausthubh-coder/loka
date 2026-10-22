import type { SpaceScheme } from "../features/sidebar/sidebar.logic";

export type Scheme = "light" | "dark";

/** The scheme a space shows: its own choice, or the computer's when it follows the system. */
export function resolveScheme(scheme: SpaceScheme, systemDark: boolean): Scheme {
	if (scheme === "system") return systemDark ? "dark" : "light";
	return scheme;
}

/** An sRGB color, each channel 0-255. */
export type Rgb = [number, number, number];

/** The three text colors: names, then secondary text (New tab, unloaded tabs), then the quietest (Clear, counts). */
export type InkRole = "ink" | "ink-2" | "ink-3";

/**
 * Text colors by perceptual lightness (OKLCH L) and a faint chroma, in the space's hue. A fixed L keeps each role's
 * contrast nearly the same for every hue, where a fixed HSL lightness makes a yellow or green space's text much
 * brighter than a blue one's. ink-3 is about as quiet as it can be and still keep 4.5:1 for all of SPACE_HUES, on
 * each scheme's sky (theme.test.ts) and on the nebula, clouds and panels behind the sidebar's text (the verify-loka
 * `contrast` recipe: the empty address field on a green space's dark sky is the tightest); ink-2 and ink keep their
 * steps from it.
 */
export const INK: Record<Scheme, Record<InkRole, { l: number; c: number }>> = {
	dark: {
		ink: { l: 0.94, c: 0.006 },
		"ink-2": { l: 0.82, c: 0.018 },
		"ink-3": { l: 0.76, c: 0.02 },
	},
	light: {
		ink: { l: 0.24, c: 0.035 },
		"ink-2": { l: 0.36, c: 0.032 },
		"ink-3": { l: 0.42, c: 0.03 },
	},
};

/**
 * A text color as CSS, for a page that sets --hue. The hue is the OKLCH hue of the space's color at full strength
 * (hsl(hue 80% 50%), the color light's accent starts from too), so the tint matches the space.
 */
export function inkCss(scheme: Scheme, role: InkRole): string {
	const { l, c } = INK[scheme][role];
	return `oklch(from hsl(var(--hue) 80% 50%) ${l} ${c} h)`;
}

/** The color inkCss() draws for this hue. */
export function inkRgb(hue: number, scheme: Scheme, role: InkRole): Rgb {
	const { l, c } = INK[scheme][role];
	const [, , h] = rgbToOklch(hslToRgb(hue, 80, 50));
	return oklchToRgb(l, c, h);
}

/** hsl(h s% l%) as sRGB. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
	const sat = s / 100;
	const light = l / 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = sat * Math.min(light, 1 - light);
	const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
	return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const toLinear = (c: number) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** OKLCH (L 0-1, chroma, hue in degrees) of an sRGB color. */
export function rgbToOklch(rgb: Rgb): [number, number, number] {
	const [r, g, b] = rgb.map(toLinear) as Rgb;
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

/** An OKLCH color as sRGB, clipped to sRGB's range (the inks are well inside it). */
export function oklchToRgb(L: number, C: number, h: number): Rgb {
	const A = C * Math.cos((h * Math.PI) / 180);
	const B = C * Math.sin((h * Math.PI) / 180);
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	return linear.map((v) => Math.min(255, Math.max(0, fromLinear(v)))) as Rgb;
}

/**
 * A color written as hex (#rgb, #rrggbb) or rgb()/rgba() (with spaces or commas), as sRGB; null for anything else.
 * The browser sends extension badge colors as rgb(r g b), the demo as hex.
 */
export function parseRgb(css: string): Rgb | null {
	const color = css.trim().toLowerCase();
	const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)?.[1];
	if (hex) {
		const full = hex.length === 3 ? [...hex].map((d) => d + d).join("") : hex;
		return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16)) as Rgb;
	}
	const rgb = color.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
	if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
	return null;
}

/** WCAG relative luminance. */
export function luminance(rgb: Rgb): number {
	const [r, g, b] = rgb.map(toLinear) as Rgb;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
	const [x, y] = [luminance(a), luminance(b)];
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
