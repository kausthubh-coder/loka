// A page's icon from the browser's favicon cache, which every Loka page's CSP allows (img-src chrome://favicon2).
// No bridge here, so any page can use it: the sidebar's, the command bar's and the History page's.

/** Loka's own pages. The browser keeps no history (so no cached icon) for chrome:// pages, which left a globe. */
const LOKA_PAGE = /^chrome:\/\/(history|loka-settings)(\/|$)/;

/**
 * An unloaded page's icon, from the browser's favicon cache. A loaded tab's own icon comes with its tab data.
 * Loka's own pages get the Loka mark, which ships next to every page in this bundle (webui/public/loka.svg).
 */
export function faviconUrl(pageUrl: string): string {
	if (LOKA_PAGE.test(pageUrl)) return new URL("loka.svg", location.href).href;
	const url = new URL("chrome://favicon2/");
	url.searchParams.set("size", "32");
	url.searchParams.set("scaleFactor", `${window.devicePixelRatio}x`);
	url.searchParams.set("pageUrl", pageUrl);
	url.searchParams.set("allowGoogleServerFallback", "0");
	// Another page on the same site lends its icon; and a page the cache doesn't know gets nothing, not the default
	// globe (a white dot on a dark sky), so its tile can show the site's letter instead.
	url.searchParams.set("fallbackToHost", "1");
	url.searchParams.set("forceEmptyDefaultFavicon", "1");
	return url.toString();
}
