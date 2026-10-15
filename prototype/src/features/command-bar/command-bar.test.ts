import { expect, test } from "bun:test";
import { seedState } from "../sidebar/sidebar.seed";
import { commandResults, isSearch, toUrl } from "./command-bar.logic";

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

// Results as short lines so a whole list compares in one assertion.
const lines = (query: string) =>
	commandResults(seedState(), query).map((r) => `${r.kind}:${r.label}${r.kind === "tab" ? ` (${r.detail})` : ""}`);

test("typing a word offers the search first, then matching tabs from any space", () => {
	expect(lines("canvas")).toEqual(['go:Search for "canvas"', "tab:Canvas: CSC 281 (School)"]);
});

test("a site name finds tabs by their address too", () => {
	expect(lines("github")).toContain("tab:imputnet/helium-windows (Build)");
});

test("commands are found by their words, not only their label", () => {
	expect(lines("preferences")).toEqual(['go:Search for "preferences"', "action:Settings"]);
});

test("an empty bar lists this space's open tabs and every command, with nothing to search", () => {
	const empty = lines("");
	expect(empty.slice(0, 3)).toEqual([
		"tab:Hacker News (Build)",
		"tab:Arc: what we learned (Build)",
		"tab:Zen Browser (Build)",
	]);
	expect(empty.filter((l) => l.startsWith("go:"))).toEqual([]);
	expect(empty.filter((l) => l.startsWith("action:")).length).toBe(7);
});
