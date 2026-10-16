import { html, type TemplateResult } from "lit";
import type { TabId } from "./sidebar.logic";

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

/**
 * What the browser knows about a tab's page right now. Plain data so any source can feed it: the extension reads
 * chrome.tabs, the built-in sidebar will get it from the tab strip over Mojo. A missing field means "not known".
 */
export interface LiveTab {
	/** The icon the page declared, as an address this page can load. Kept after the tab unloads. */
	icon?: string;
	loading?: boolean;
	audible?: boolean;
	muted?: boolean;
}

export type LiveTabs = Record<TabId, LiveTab>;

// In the real browser the extension sets this to the browser's favicon cache; the prototype has no network, so it
// draws letter tiles.
let faviconSource: ((url: string) => string) | null = null;

export function setFaviconSource(source: (url: string) => string) {
	faviconSource = source;
}

/**
 * The image for a tab's tile: the icon its page declared, else the browser's cached icon for the address, else
 * null for a letter tile. The page's own icon comes first because the cache only answers for addresses it has
 * already stored: asked before a page finishes loading, it gives the default globe for good, since the address
 * never changes and the image is never asked for again.
 */
export function faviconSrc(url: string, live?: LiveTab): string | null {
	if (live?.icon) return live.icon;
	return faviconSource ? faviconSource(url) : null;
}

/**
 * What goes inside a favicon tile: the site's own icon when there is one, else its first letter. The letter is
 * there behind the image too, for when neither the page's icon nor the cache's can be drawn: the cache answers
 * nothing (an error) rather than a stand-in globe for a page it doesn't know, and the tile turns into the letter.
 */
export function faviconInner(url: string, live?: LiveTab): TemplateResult | string {
	const src = faviconSrc(url, live);
	if (!src) return faviconLetter(url);
	const cached = faviconSource?.(url);
	return html`<img
			src=${src}
			alt=""
			style="width: 100%; height: 100%; object-fit: contain"
			@load=${(e: Event) => {
				// A new icon after a letter (the page loaded one): the image comes back.
				const img = e.target as HTMLImageElement;
				if (!img.hidden) return;
				img.hidden = false;
				const letter = img.nextElementSibling;
				if (letter instanceof HTMLElement) letter.hidden = true;
				img.parentElement?.style.setProperty("--fav", "transparent");
			}}
			@error=${(e: Event) => {
				const img = e.target as HTMLImageElement;
				// A page's own icon can fail to load from here (blocked, gone); the cache's answer is the next best.
				if (cached && img.src !== cached) {
					img.src = cached;
					return;
				}
				img.hidden = true;
				const letter = img.nextElementSibling;
				if (letter instanceof HTMLElement) letter.hidden = false;
				img.parentElement?.style.setProperty("--fav", faviconColor(url));
			}}
		/><span hidden>${faviconLetter(url)}</span>`;
}

/** The tile's background: the letter tile's color, or none behind a real icon. */
export function faviconBackground(url: string, live?: LiveTab): string {
	return faviconSrc(url, live) ? "transparent" : faviconColor(url);
}
