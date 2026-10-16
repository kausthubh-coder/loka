import { describe, expect, test } from "bun:test";
import { faviconBackground, faviconSrc, setFaviconSource } from "./favicon";

describe("which icon a tab's tile shows", () => {
	test("in the prototype there is no icon source, so a tile is a letter on a color", () => {
		expect(faviconSrc("https://www.youtube.com/")).toBeNull();
		expect(faviconBackground("https://www.youtube.com/")).toBe("hsl(246 70% 72%)");
	});

	test("the icon the page declared beats the browser's cache, whose early answer is the default globe", () => {
		setFaviconSource((url) => `cache:${url}`);
		const live = { icon: "https://www.youtube.com/s/desktop/favicon.ico" };
		expect(faviconSrc("https://www.youtube.com/", live)).toBe("https://www.youtube.com/s/desktop/favicon.ico");
		expect(faviconBackground("https://www.youtube.com/", live)).toBe("transparent");
	});

	test("a tab the browser hasn't loaded, or whose page declared no icon, asks the cache by its address", () => {
		setFaviconSource((url) => `cache:${url}`);
		expect(faviconSrc("https://en.wikipedia.org/")).toBe("cache:https://en.wikipedia.org/");
		expect(faviconSrc("https://en.wikipedia.org/", { loading: true })).toBe("cache:https://en.wikipedia.org/");
	});
});
