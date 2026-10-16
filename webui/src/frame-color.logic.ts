// The color of the window frame around the page: the space's sky, so the sidebar reads as the whole window (Arc's
// look). The browser paints its frame with it (setThemeColor).

/** HSL (h in degrees, s and l in 0..1) as "#rrggbb". */
export function hslToHex(h: number, s: number, l: number): string {
	const a = s * Math.min(l, 1 - l);
	const channel = (n: number) => {
		const k = (n + h / 30) % 12;
		const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(value * 255)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** The frame for a space of this hue: the deep end of its sky when dark, a soft wash of it when light. */
export function frameColor(hue: number, scheme: "light" | "dark"): string {
	return scheme === "dark" ? hslToHex(hue, 0.34, 0.1) : hslToHex(hue, 0.42, 0.88);
}
