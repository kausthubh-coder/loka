import { html, type TemplateResult } from "lit";

// Letter tiles stand in for favicons, so the prototype makes no network requests.

export function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export function faviconLetter(url: string): string {
	return (hostOf(url)[0] ?? "?").toUpperCase();
}

export function faviconColor(url: string): string {
	let hash = 0;
	for (const char of hostOf(url)) hash = (hash * 31 + char.charCodeAt(0)) % 360;
	return `hsl(${hash} 70% 72%)`;
}

// In the real browser the extension sets this to the browser's favicon cache; the prototype has no network, so it
// draws letter tiles.
let faviconSource: ((url: string) => string) | null = null;

export function setFaviconSource(source: (url: string) => string) {
	faviconSource = source;
}

/** What goes inside a favicon tile: the site's own icon when the browser can give one, else its first letter. */
export function faviconInner(url: string): TemplateResult | string {
	if (!faviconSource) return faviconLetter(url);
	return html`<img src=${faviconSource(url)} alt="" style="width: 100%; height: 100%; object-fit: contain" />`;
}

/** The tile's background: the letter tile's color, or none behind a real icon. */
export function faviconBackground(url: string): string {
	return faviconSource ? "transparent" : faviconColor(url);
}
