import { expect, test } from "bun:test";
import { shownAddress, startsEmpty } from "./new-tab.logic";

const tab = (url: string, active = false) => ({ url, active });

test("a window that starts on Loka's empty page opens the command bar", () => {
	expect(startsEmpty([tab("chrome://loka-newtab/", true)])).toBe(true);
	// The address the browser shows for it, and Chrome's own page in builds before Loka's.
	expect(startsEmpty([tab("chrome://newtab/", true)])).toBe(true);
	expect(startsEmpty([tab("chrome://new-tab-page/", true)])).toBe(true);
});

test("a window that starts on a page doesn't, even with an empty tab behind it", () => {
	expect(startsEmpty([tab("chrome://loka-newtab/"), tab("https://example.org/", true)])).toBe(false);
	expect(startsEmpty([tab("chrome://history/", true)])).toBe(false);
});

test("until the tab on screen has a page, it's too early to say", () => {
	expect(startsEmpty([tab("about:blank", true)])).toBeNull();
	expect(startsEmpty([tab("", true)])).toBeNull();
	expect(startsEmpty([])).toBeNull();
});

test("Ctrl+L on an empty tab starts empty, not on the empty page's address", () => {
	expect(shownAddress({ url: "chrome://loka-newtab/" })).toBe("");
	expect(shownAddress({ url: "https://example.org/a" })).toBe("https://example.org/a");
	expect(shownAddress(undefined)).toBe("");
});
