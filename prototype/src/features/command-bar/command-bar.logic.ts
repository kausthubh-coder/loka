const SEARCH_URL = "https://duckduckgo.com/?q=";

/** Turns what was typed into a URL: an address if it looks like one, otherwise a search. */
export function toUrl(input: string): string {
	const text = input.trim();
	if (/^[a-z]+:\/\//i.test(text)) return text;
	if (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(text)) return `https://${text}`;
	return `${SEARCH_URL}${encodeURIComponent(text)}`;
}

export function isSearch(url: string): boolean {
	return url.startsWith(SEARCH_URL);
}
