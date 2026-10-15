// A page's icon from the browser's favicon cache, which every Loka page's CSP allows (img-src chrome://favicon2).
// No bridge here, so any page can use it: the sidebar's, the command bar's and the History page's.

/** An unloaded page's icon, from the browser's favicon cache. A loaded tab's own icon comes with its tab data. */
export function faviconUrl(pageUrl: string): string {
	const url = new URL("chrome://favicon2/");
	url.searchParams.set("size", "32");
	url.searchParams.set("scaleFactor", `${window.devicePixelRatio}x`);
	url.searchParams.set("pageUrl", pageUrl);
	url.searchParams.set("allowGoogleServerFallback", "0");
	return url.toString();
}
