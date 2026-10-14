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
