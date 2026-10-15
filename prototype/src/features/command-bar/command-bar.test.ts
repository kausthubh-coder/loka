import { expect, test } from "bun:test";
import type { NativeSuggestion } from "../../../../webui/src/bridge";
import { seedState } from "../sidebar/sidebar.seed";
import { commandResults, isActionId, isSearch, toUrl } from "./command-bar.logic";

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
	expect(empty.filter((l) => l.startsWith("action:")).length).toBe(11);
});

test("new tab pages aren't offered as tabs to go to", () => {
	const state = seedState();
	const withBlank = {
		...state,
		tabs: { ...state.tabs, blank: { id: "blank", title: "New tab", url: "chrome://newtab/" } },
		spaces: state.spaces.map((s) => (s.id === "s-build" ? { ...s, open: ["blank", ...s.open] } : s)),
	};
	expect(commandResults(withBlank, "").some((r) => r.kind === "tab" && r.tabId === "blank")).toBe(false);
});

const HISTORY: NativeSuggestion[] = [
	{ kind: "search", title: "git rebase", url: "https://search.example/?q=git+rebase" },
	{ kind: "history", title: "Git - git-rebase Documentation", url: "https://git-scm.com/docs/git-rebase" },
	{ kind: "bookmark", title: "Pro Git book", url: "https://git-scm.com/book" },
	{ kind: "tab", title: "imputnet/helium-windows", url: "https://github.com/imputnet/helium-windows", tabId: 41 },
	{ kind: "tab", title: "Gitea", url: "https://gitea.example/", tabId: 77 },
];
const withBrowser = (query: string, suggestionsFor: string, links = {}) =>
	commandResults(seedState(), query, { suggestions: HISTORY, suggestionsFor, links }).map(
		(r) => `${r.group}|${r.kind}:${r.label}`,
	);

test("once the browser answers, its first suggestion is what was typed and its others follow the tabs", () => {
	expect(withBrowser("git rebase", "git rebase", { "t-helium": 41 })).toEqual([
		"|go:git rebase",
		"Suggestions|go:Git - git-rebase Documentation",
		"Suggestions|go:Pro Git book",
		"Suggestions|tab:imputnet/helium-windows",
		"Suggestions|browser-tab:Gitea",
	]);
});

test("a browser tab Loka already lists isn't suggested twice", () => {
	const lines = withBrowser("helium", "helium", { "t-helium": 41 });
	expect(lines.filter((l) => l.includes("imputnet/helium-windows"))).toEqual(["Tabs|tab:imputnet/helium-windows"]);
});

test("suggestions for earlier words stay while typing, but only the ones that still match, under Loka's own guess", () => {
	const lines = withBrowser("git-scm.com", "git");
	expect(lines[0]).toBe("|go:Open git-scm.com");
	expect(lines).toContain("Suggestions|go:Git - git-rebase Documentation");
	expect(lines).not.toContain("Suggestions|go:git rebase");
	expect(lines).not.toContain("Suggestions|browser-tab:Gitea");
});

test("suggestions for other words are dropped", () => {
	expect(withBrowser("canvas", "git").filter((l) => l.startsWith("Suggestions"))).toEqual([]);
});

test("Loka's own search remembers the words, so the browser can search with the user's engine", () => {
	const [first] = commandResults(seedState(), "  arc spaces ");
	expect(first?.kind === "go" && first.search).toBe("arc spaces");
	const [address] = commandResults(seedState(), "lit.dev");
	expect(address?.kind === "go" && address.search).toBeUndefined();
});

test("other spaces are found by name", () => {
	expect(lines("scho").filter((l) => l.startsWith("space:"))).toEqual(["space:School"]);
	expect(lines("build").filter((l) => l.startsWith("space:"))).toEqual([]);
});

test("the sidebar command says hide while pinned and keep open while it isn't", () => {
	const label = (pinned: boolean) =>
		commandResults(seedState(), "sidebar", { pinned }).find((r) => r.kind === "action" && r.action === "toggle-sidebar")
			?.label;
	expect([label(true), label(false)]).toEqual(["Hide the sidebar", "Keep the sidebar open"]);
});

test("only the bar's own commands are taken from a relayed pick", () => {
	expect([isActionId("downloads"), isActionId("format-disk")]).toEqual([true, false]);
});

test("a suggestion for a page already listed as a tab isn't shown again, trailing slash or not", () => {
	const suggestions: NativeSuggestion[] = [
		{ kind: "search", title: "zen", url: "https://search.example/?q=zen" },
		{ kind: "bookmark", title: "Zen Browser", url: "https://zen-browser.app/" },
	];
	const results = commandResults(seedState(), "zen", { suggestions, suggestionsFor: "zen" });
	expect(results.filter((r) => r.label === "Zen Browser").map((r) => r.kind)).toEqual(["tab"]);
});
