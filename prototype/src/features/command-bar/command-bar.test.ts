import { expect, test } from "bun:test";
import { isSearch, toUrl } from "./command-bar.logic";

test("an address without a scheme gets https", () => {
	expect(toUrl("lit.dev/playground")).toBe("https://lit.dev/playground");
});

test("a full URL is kept as typed", () => {
	expect(toUrl("http://localhost:5173/")).toBe("http://localhost:5173/");
});

test("words become a search", () => {
	const url = toUrl("arc browser spaces");
	expect(url).toBe("https://duckduckgo.com/?q=arc%20browser%20spaces");
	expect(isSearch(url)).toBe(true);
});
