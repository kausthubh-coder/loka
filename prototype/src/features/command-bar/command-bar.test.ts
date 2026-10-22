import { expect, test } from "bun:test";
import type { NativeSuggestion } from "../../../../webui/src/bridge";
import { seedState } from "../sidebar/sidebar.seed";
import {
	commandResults,
	continueAnswer,
	dotCom,
	engineName,
	inlineCompletion,
	isActionId,
	isSearch,
	keepAnswer,
	type ResultContext,
	type SuggestionAnswer,
	toUrl,
} from "./command-bar.logic";

test("an address without a scheme gets https", () => {
	expect(toUrl("lit.dev/playground")).toBe("https://lit.dev/playground");
});

test("a full URL is kept as typed", () => {
	expect(toUrl("http://localhost:5173/")).toBe("http://localhost:5173/");
});

test("localhost, an IP address or a name with a port opens over http, before the browser has answered", () => {
	expect(toUrl("localhost:5173/settings")).toBe("http://localhost:5173/settings");
	expect(toUrl("localhost")).toBe("http://localhost");
	expect(toUrl("127.0.0.1:9555/qa")).toBe("http://127.0.0.1:9555/qa");
	expect(toUrl("192.168.1.20")).toBe("http://192.168.1.20");
	expect(toUrl("nas:8080")).toBe("http://nas:8080");
	expect(toUrl("example.com?q=1")).toBe("https://example.com?q=1");
	expect(isSearch(toUrl("version 1.2"))).toBe(true);
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
	expect(lines("csc 281")).toEqual(["go:csc 281", "tab:Canvas: CSC 281 (School)"]);
});

test("typing the start of an open tab's site switches to it first, from any space, with the search second", () => {
	expect(lines("canvas")).toEqual(["tab:Canvas: CSC 281 (Switch to tab · School)", "go:canvas"]);
});

test("a site name finds tabs by their address too; its front page is the one Enter switches to", () => {
	expect(lines("github")).toEqual(["tab:GitHub (Switch to tab)", "go:github", "tab:imputnet/helium-windows (Build)"]);
});

test("commands are found by their words, not only their label", () => {
	expect(lines("preferences")).toEqual(["go:preferences", "action:Settings"]);
});

test("an empty bar lists this space's open tabs and every command, with nothing to search", () => {
	const empty = lines("");
	expect(empty.slice(0, 3)).toEqual([
		"tab:Hacker News (Build)",
		"tab:Arc: what we learned (Build)",
		"tab:Zen Browser (Build)",
	]);
	expect(empty.filter((l) => l.startsWith("go:"))).toEqual([]);
	expect(empty.filter((l) => l.startsWith("action:")).length).toBe(22);
});

test("the Library is a command, found by what it holds", () => {
	expect(lines("library")).toContain("action:Library");
	expect(lines("archive")).toContain("action:Library");
});

test("the mute command says what it will do: mute while sounds are on, unmute once they're off", () => {
	const labels = (sound: boolean) =>
		commandResults(seedState(), "sounds", { sound })
			.filter((r) => r.kind === "action")
			.map((r) => r.label);
	expect(labels(true)).toEqual(["Mute sounds"]);
	expect(labels(false)).toEqual(["Unmute sounds"]);
});

test("new tab pages aren't offered as tabs to go to", () => {
	const state = seedState();
	const withBlank = {
		...state,
		tabs: {
			...state.tabs,
			blank: { id: "blank", title: "New tab", url: "chrome://newtab/" },
			empty: { id: "empty", title: "New tab", url: "chrome://loka-newtab/" },
		},
		spaces: state.spaces.map((s) => (s.id === "s-build" ? { ...s, open: ["blank", "empty", ...s.open] } : s)),
	};
	const offered = commandResults(withBlank, "").flatMap((r) => (r.kind === "tab" ? [r.tabId] : []));
	expect(offered.filter((id) => id === "blank" || id === "empty")).toEqual([]);
	expect(offered.length).toBeGreaterThan(0);
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

test("once the browser answers, its first suggestion is what was typed; the rest go into tabs, history, bookmarks", () => {
	expect(withBrowser("git rebase", "git rebase", { "t-helium": 41 })).toEqual([
		"|go:git rebase",
		"Tabs|tab:imputnet/helium-windows",
		"Tabs|browser-tab:Gitea",
		"History|go:Git - git-rebase Documentation",
		"Bookmarks|go:Pro Git book",
	]);
});

test("the first row says what Enter does: search with the user's engine, or go to the address", () => {
	const first = (suggestion: NativeSuggestion, query: string) =>
		commandResults(seedState(), query, { suggestions: [suggestion], suggestionsFor: query })[0];
	const search = first({ kind: "search", title: "rust", url: "https://www.google.com/search?q=rust" }, "rust");
	expect([search?.label, search?.detail]).toEqual(["rust", "Search with Google"]);
	const url = first({ kind: "url", title: "", url: "https://lit.dev/docs/" }, "lit.dev/docs");
	expect(url?.label).toBe("Go to lit.dev/docs");
});

test("Ctrl+Enter on one word goes to its .com", () => {
	expect([dotCom("Wikipedia"), dotCom("two words"), dotCom("lit.dev")]).toEqual([
		"https://www.wikipedia.com/",
		null,
		null,
	]);
});

test("a browser tab Loka already lists isn't suggested twice", () => {
	const lines = withBrowser("helium", "helium", { "t-helium": 41 });
	expect(lines.filter((l) => l.includes("imputnet/helium-windows"))).toEqual(["Tabs|tab:imputnet/helium-windows"]);
});

test("suggestions for earlier words stay while typing, but only the ones that still match, under Loka's own guess", () => {
	const lines = withBrowser("git-scm.com", "git");
	expect(lines[0]).toBe("|go:Go to git-scm.com");
	expect(lines).toContain("History|go:Git - git-rebase Documentation");
	expect(lines).not.toContain("History|go:git rebase");
	expect(lines).not.toContain("Tabs|browser-tab:Gitea");
});

test("suggestions for other words are dropped", () => {
	expect(withBrowser("canvas", "git").filter((l) => /^(History|Bookmarks)/.test(l))).toEqual([]);
});

test("Loka's own search remembers the words, so the browser can search with the user's engine", () => {
	const [first] = commandResults(seedState(), "  arc spaces ");
	expect(first?.kind === "go" && first.search).toBe("arc spaces");
	const [address] = commandResults(seedState(), "example.org");
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

test("a search address names its engine when it's a known one", () => {
	expect([
		engineName("https://duckduckgo.com/?q=a"),
		engineName("https://search.brave.com/search?q=a"),
		engineName("https://search.example/?q=a"),
	]).toEqual(["DuckDuckGo", "Brave Search", "search.example"]);
});

// The browser's answers as the handler sends them (OnResultChanged): its pick for Enter first, with what it completes
// the typed text with.
const YOUTU: SuggestionAnswer = {
	for: "youtu",
	list: [
		{ kind: "history", title: "YouTube", url: "https://www.youtube.com/", default: true, inline: "be.com" },
		{ kind: "search", title: "youtu", url: "https://duckduckgo.com/?q=youtu", default: false, inline: "" },
		{
			kind: "search",
			title: "youtube music",
			url: "https://duckduckgo.com/?q=youtube+music",
			default: false,
			inline: "",
		},
		{ kind: "history", title: "YouTube Music", url: "https://music.youtube.com/", default: false, inline: "" },
	],
};

/** The seed without its YouTube tab, so nothing open matches "youtu" by its site. */
function noYouTubeTab() {
	const state = seedState();
	const { "t-yt": _youtube, ...tabs } = state.tabs;
	return { ...state, tabs };
}

const answered = (answer: SuggestionAnswer, extra: ResultContext = {}): ResultContext => ({
	suggestions: answer.list,
	suggestionsFor: answer.for,
	...extra,
});
const rows = (state: ReturnType<typeof seedState>, query: string, context: ResultContext) =>
	commandResults(state, query, context).map((r) => `${r.group}|${r.kind}:${r.label}|${r.detail}`);

test("youtu: the address the browser completes to goes first, selected text completes it, search is second", () => {
	const state = noYouTubeTab();
	expect(rows(state, "youtu", answered(YOUTU))).toEqual([
		"|go:Go to youtube.com|YouTube",
		"|go:youtu|Search with DuckDuckGo",
		"Tabs|tab:Lo-fi beats|Home",
		"History|go:youtube music|Search with DuckDuckGo",
	]);
	expect(inlineCompletion(state, "youtu", answered(YOUTU))).toBe("be.com");
	const [enter] = commandResults(state, "youtu", answered(YOUTU));
	expect(enter?.kind === "go" && enter.url).toBe("https://www.youtube.com/");
});

test("youtu with a YouTube tab open: switching to it goes first, and the same site isn't listed again", () => {
	const state = seedState();
	expect(rows(state, "youtu", answered(YOUTU))).toEqual([
		"|tab:YouTube|Switch to tab",
		"|go:youtu|Search with DuckDuckGo",
		"Tabs|tab:Lo-fi beats|Home",
		"History|go:youtube music|Search with DuckDuckGo",
	]);
	expect(inlineCompletion(state, "youtu", answered(YOUTU))).toBe("be.com");
	// Loka knows its tabs at once: the same before the browser has answered.
	expect(rows(state, "youtu", {}).slice(0, 2)).toEqual(["|tab:YouTube|Switch to tab", "|go:youtu|Search the web"]);
	expect(inlineCompletion(state, "youtu")).toBe("be.com");
});

test("youtu when the browser's pick is an open tab: switch to it, as Loka's tab when it is one", () => {
	const tabPick: SuggestionAnswer = {
		for: "youtu",
		list: [
			{ kind: "tab", title: "YouTube", url: "https://www.youtube.com/", tabId: 7, default: true, inline: "be.com" },
			{ kind: "search", title: "youtu", url: "https://duckduckgo.com/?q=youtu", default: false, inline: "" },
		],
	};
	const state = noYouTubeTab();
	expect(rows(state, "youtu", answered(tabPick)).slice(0, 2)).toEqual([
		"|browser-tab:YouTube|Switch to tab",
		"|go:youtu|Search with DuckDuckGo",
	]);
	expect(inlineCompletion(state, "youtu", answered(tabPick))).toBe("be.com");
	const linked = rows(seedState(), "youtu", answered(tabPick, { links: { "t-yt": 7 } }));
	expect(linked.slice(0, 2)).toEqual(["|tab:YouTube|Switch to tab", "|go:youtu|Search with DuckDuckGo"]);
});

test("plain words: the browser's pick is a search, so the search stays first and nothing completes", () => {
	const rice: SuggestionAnswer = {
		for: "how to cook rice",
		list: [
			{
				kind: "search",
				title: "how to cook rice",
				url: "https://duckduckgo.com/?q=how+to+cook+rice",
				default: true,
				inline: "",
			},
			{
				kind: "search",
				title: "how to cook rice in a rice cooker",
				url: "https://duckduckgo.com/?q=how+to+cook+rice+in+a+rice+cooker",
				default: false,
				inline: "",
			},
		],
	};
	expect(rows(seedState(), "how to cook rice", answered(rice))).toEqual([
		"|go:how to cook rice|Search with DuckDuckGo",
		"History|go:how to cook rice in a rice cooker|Search with DuckDuckGo",
	]);
	expect(inlineCompletion(seedState(), "how to cook rice", answered(rice))).toBe("");
});

test("an answer from a browser without picks (no default or inline) keeps the search first, as before", () => {
	const old: SuggestionAnswer = {
		for: "youtu",
		list: [
			{ kind: "search", title: "youtu", url: "https://duckduckgo.com/?q=youtu" },
			{ kind: "history", title: "YouTube", url: "https://www.youtube.com/" },
		],
	};
	expect(rows(noYouTubeTab(), "youtu", answered(old))).toEqual([
		"|go:youtu|Search with DuckDuckGo",
		"Tabs|tab:Lo-fi beats|Home",
		"History|go:YouTube|youtube.com",
	]);
	expect(inlineCompletion(noYouTubeTab(), "youtu", answered(old))).toBe("");
});

test("a late answer for earlier words never picks or completes, and doesn't replace one for the current words", () => {
	const yo: SuggestionAnswer = {
		for: "yo",
		list: [
			{ kind: "history", title: "YouTube", url: "https://www.youtube.com/", default: true, inline: "utube.com" },
			{ kind: "search", title: "yo", url: "https://duckduckgo.com/?q=yo", default: false, inline: "" },
		],
	};
	const state = noYouTubeTab();
	expect(rows(state, "you", answered(yo))).toEqual([
		"|go:you|Search the web",
		"Tabs|tab:Lo-fi beats|Home",
		"History|go:YouTube|youtube.com",
	]);
	expect(inlineCompletion(state, "you", answered(yo))).toBe("");
	const you: SuggestionAnswer = { ...yo, for: "you" };
	expect(keepAnswer(you, yo, "you")).toBe(you);
	expect(keepAnswer(yo, you, "you")).toBe(you);
});

test("after Backspace, a fresh answer with a completion doesn't bring it back: what was typed is searched first", () => {
	const off = answered(YOUTU, { inlineOff: true });
	expect(rows(noYouTubeTab(), "youtu", off)).toEqual([
		"|go:youtu|Search with DuckDuckGo",
		"Tabs|tab:Lo-fi beats|Home",
		"History|go:YouTube|youtube.com",
		"History|go:youtube music|Search with DuckDuckGo",
	]);
	expect(inlineCompletion(noYouTubeTab(), "youtu", off)).toBe("");
	// The open YouTube tab needs completing too, so it isn't Enter's either until the person types again; typed in
	// full, it needs no completing and is.
	expect(rows(seedState(), "youtu", off)[0]).toBe("|go:youtu|Search with DuckDuckGo");
	expect(inlineCompletion(seedState(), "youtu", off)).toBe("");
	expect(rows(seedState(), "youtube.com", { inlineOff: true })[0]).toBe("|tab:YouTube|Switch to tab");
});

test("typing the next character of the completion keeps the pick and shortens the completion at once", () => {
	const next = continueAnswer(YOUTU, "youtub");
	expect(next).toEqual({
		for: "youtub",
		list: [
			{ kind: "history", title: "YouTube", url: "https://www.youtube.com/", default: true, inline: "e.com" },
			{ kind: "history", title: "YouTube Music", url: "https://music.youtube.com/", default: false, inline: "" },
		],
	});
	const state = noYouTubeTab();
	const context = next ? answered(next) : {};
	expect(rows(state, "youtub", context).slice(0, 2)).toEqual([
		"|go:Go to youtube.com|YouTube",
		"|go:youtub|Search the web",
	]);
	expect(inlineCompletion(state, "youtub", context)).toBe("e.com");
	expect(continueAnswer(YOUTU, "YouTube.com")?.list[0]?.inline).toBe("");
	expect([continueAnswer(YOUTU, "youtux"), continueAnswer(YOUTU, "yout"), continueAnswer(YOUTU, "youtu")]).toEqual([
		null,
		null,
		null,
	]);
});

test("moving to another row puts back exactly what was typed", () => {
	expect(inlineCompletion(noYouTubeTab(), "youtu", answered(YOUTU), 1)).toBe("");
});
