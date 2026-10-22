import type { BrowserCommand, NativeSuggestion } from "../../../../webui/src/bridge";
import { hostOf } from "../sidebar/favicon";
import type { BrowserState, TabId } from "../sidebar/sidebar.logic";
import { isEmptyTab } from "../tabs/live.logic";

const SEARCH_URL = "https://duckduckgo.com/?q=";

/**
 * Turns what was typed into a URL: an address if it looks like one, otherwise a search. A computer on this network
 * (localhost, an IP address, a name with a port) opens over http, as browsers do.
 */
export function toUrl(input: string): string {
	const text = input.trim();
	if (/^[a-z]+:\/\//i.test(text)) return text;
	if (/^(localhost|\d{1,3}(\.\d{1,3}){3}|[a-z0-9-]+(\.[a-z0-9-]+)*:\d{1,5})(:\d{1,5})?([/?#]\S*)?$/i.test(text)) {
		return `http://${text}`;
	}
	if (/^[^\s]+\.[a-z]{2,}([/?#]\S*)?$/i.test(text)) return `https://${text}`;
	return `${SEARCH_URL}${encodeURIComponent(text)}`;
}

export function isSearch(url: string): boolean {
	return url.startsWith(SEARCH_URL);
}

/**
 * Where an address picked in the bar opens: a new tab (Ctrl+T, Ctrl+K, New tab) or the tab on screen (Ctrl+L, the
 * address field). The same names as the browser's own commands.
 */
export type CommandMode = Extract<BrowserCommand, "new-tab" | "focus-location">;

export type ActionId =
	| "new-space"
	| "edit-space"
	| "new-folder"
	| "toggle-sidebar"
	| "settings"
	| "history"
	| "library"
	| "downloads"
	| "extensions"
	| "search-sidebar"
	| "archive"
	| "onboarding"
	| "toggle-sound"
	| ChromeMenuCommand;

/**
 * The browser's own commands, which Chrome reaches from its toolbar menu. Loka has no toolbar menu, so they're in the
 * sidebar's ... menu and the command bar; the browser runs each as Chrome's menu would (handler: browserCommand).
 */
export const CHROME_MENU_COMMANDS = [
	"new-window",
	"new-private-window",
	"find",
	"print",
	"zoom-in",
	"zoom-out",
	"zoom-reset",
	"clear-data",
	"about",
] as const;
export type ChromeMenuCommand = (typeof CHROME_MENU_COMMANDS)[number];

export function isChromeMenuCommand(action: string): action is ChromeMenuCommand {
	return (CHROME_MENU_COMMANDS as readonly string[]).includes(action);
}

export type ResultGroup = "" | "Tabs" | "History" | "Bookmarks" | "Spaces" | "Commands";

/**
 * One row of the bar. `go` opens an address; its `search` is the words when it's a search Loka made up itself (the
 * real browser runs those with the user's own engine). `browser-tab` is an open tab the browser suggested that the
 * sidebar doesn't hold.
 */
export type CommandResult = { label: string; detail: string; group: ResultGroup } & (
	| { kind: "go"; url: string; icon: "search" | "globe" | "history" | "bookmark"; search?: string }
	| { kind: "tab"; tabId: TabId; spaceId: string }
	| { kind: "browser-tab"; tabId: number; url: string }
	| { kind: "space"; spaceId: string }
	| { kind: "action"; action: ActionId }
);

const ACTIONS: { action: ActionId; label: string; detail: string; words: string }[] = [
	{ action: "new-space", label: "New space", detail: "Name it, pick a color and a planet", words: "create add world" },
	{
		action: "edit-space",
		label: "Edit this space",
		detail: "Rename, recolor, planet, light or dark",
		words: "rename color customize theme appearance light dark mode",
	},
	{ action: "new-folder", label: "New folder", detail: "In this space's pinned tabs", words: "create group" },
	{
		action: "toggle-sidebar",
		label: "Hide the sidebar",
		detail: "It slides back when the mouse reaches the window's edge",
		words: "toggle collapse show pin unpin",
	},
	{ action: "settings", label: "Settings", detail: "Loka's settings", words: "preferences options" },
	{ action: "history", label: "History", detail: "Ctrl+H", words: "visited past pages recent" },
	{
		action: "library",
		label: "Library",
		detail: "Every space, archived tabs, history and downloads",
		words: "spaces overview all tabs archive",
	},
	{ action: "downloads", label: "Downloads", detail: "Recent files", words: "files" },
	{ action: "extensions", label: "Extensions", detail: "Run, pin or manage them", words: "addons plugins" },
	{ action: "search-sidebar", label: "Search the sidebar", detail: "Ctrl+Shift+F", words: "find tabs everywhere" },
	{ action: "archive", label: "Archived tabs", detail: "Bring back an archived tab", words: "old closed restore" },
	{ action: "onboarding", label: "Show the welcome tour", detail: "Onboarding", words: "intro welcome tour" },
	{
		action: "toggle-sound",
		label: "Mute sounds",
		detail: "Loka's interface sounds",
		words: "sound effects audio quiet silence mute unmute volume",
	},
	{ action: "new-window", label: "New window", detail: "Ctrl+N", words: "open another window" },
	{
		action: "new-private-window",
		label: "New private window",
		detail: "Ctrl+Shift+N, nothing saved",
		words: "incognito private secret window",
	},
	{ action: "find", label: "Find on page", detail: "Ctrl+F", words: "search text in page" },
	{ action: "print", label: "Print", detail: "Ctrl+P", words: "pdf save paper" },
	{ action: "zoom-in", label: "Zoom in", detail: "Ctrl+Plus", words: "bigger larger magnify" },
	{ action: "zoom-out", label: "Zoom out", detail: "Ctrl+Minus", words: "smaller" },
	{ action: "zoom-reset", label: "Reset zoom", detail: "Ctrl+0", words: "actual size 100" },
	{
		action: "clear-data",
		label: "Clear browsing data",
		detail: "Ctrl+Shift+Delete",
		words: "delete history cookies cache privacy",
	},
	{ action: "about", label: "About Loka", detail: "Version and updates", words: "version help update" },
];

/** Where a tab lives, for the result's label. Essentials belong to every space, so they go to the current one. */
function spaceOf(state: BrowserState, tabId: TabId): string {
	const pinnedIds = (nodes: BrowserState["spaces"][number]["pinned"]): TabId[] =>
		nodes.flatMap((n) => (n.kind === "tab" ? [n.id] : pinnedIds(n.children)));
	const owner = state.spaces.find((s) => s.open.includes(tabId) || pinnedIds(s.pinned).includes(tabId));
	return owner?.id ?? state.activeSpaceId;
}

export interface ResultContext {
	/** What the browser's autocomplete last answered, and for which words. */
	suggestions?: NativeSuggestion[];
	suggestionsFor?: string;
	/** Which browser tab shows each loaded Loka tab, so the browser's open-tab suggestions map back to Loka's. */
	links?: Record<TabId, number>;
	/** Whether the sidebar is pinned open, for the hide-or-pin command's wording. */
	pinned?: boolean;
	/** Whether interface sounds are on, for the mute command's wording. */
	sound?: boolean;
	/**
	 * True after the person deleted text, until they type a character again. Chrome's rule: deleting the completion
	 * means they want what they typed, so nothing is completed and a pick that needed completing isn't Enter's.
	 */
	inlineOff?: boolean;
}

/** One answer from the browser's autocomplete: the words it was asked about and what it said. */
export interface SuggestionAnswer {
	for: string;
	list: NativeSuggestion[];
}

const ENGINES: [RegExp, string][] = [
	[/(^|\.)duckduckgo\./, "DuckDuckGo"],
	[/(^|\.)google\./, "Google"],
	[/(^|\.)bing\./, "Bing"],
	[/^search\.brave\./, "Brave Search"],
	[/(^|\.)startpage\./, "Startpage"],
	[/(^|\.)kagi\./, "Kagi"],
	[/(^|\.)ecosia\./, "Ecosia"],
];

/** The search engine a search address belongs to, by name when it's a known one, else its site. */
export function engineName(url: string): string {
	const host = hostOf(url);
	return ENGINES.find(([pattern]) => pattern.test(host))?.[1] ?? host;
}

/** An address as the bar shows it: no scheme, no trailing slash. */
function shortUrl(url: string): string {
	return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Ctrl+Enter on a single word goes to its .com, the way browsers have always done it. */
export function dotCom(query: string): string | null {
	const word = query.trim();
	return /^[a-z0-9-]+$/i.test(word) ? `https://www.${word.toLowerCase()}.com/` : null;
}

/** The first row: what Enter does with what was typed, said the way Zen says it. */
function typedRow(s: NativeSuggestion, query: string): CommandResult {
	if (s.kind === "search") {
		return {
			kind: "go",
			url: s.url,
			icon: "search",
			label: s.title || query,
			detail: `Search with ${engineName(s.url)}`,
			group: "",
		};
	}
	return { kind: "go", url: s.url, icon: "globe", label: `Go to ${shortUrl(s.url)}`, detail: "", group: "" };
}

/** Loka's own row for what was typed, before (or without) the browser's: a search, or an address it looks like. */
function guessRow(query: string): CommandResult {
	const url = toUrl(query);
	// A search goes to the user's engine, whichever it is.
	return isSearch(url)
		? {
				kind: "go",
				url,
				icon: "search",
				search: query.trim(),
				label: query.trim(),
				detail: "Search the web",
				group: "",
			}
		: { kind: "go", url, icon: "globe", label: `Go to ${shortUrl(url)}`, detail: "", group: "" };
}

/** An address the way the address bar completes it: no scheme, no www., no trailing slash. */
function bareUrl(url: string): string {
	return shortUrl(url).replace(/^www\./, "");
}

/** The row that goes first and that Enter runs, ahead of the search, and what it completes the typed text with. */
interface DefaultPick {
	row: CommandResult;
	inline: string;
	/** The browser's suggestion it came from, so it isn't listed again. */
	from?: NativeSuggestion;
}

function switchDetail(state: BrowserState, spaceId: string): string {
	const name = state.spaces.find((s) => s.id === spaceId)?.name;
	return spaceId === state.activeSpaceId || !name ? "Switch to tab" : `Switch to tab · ${name}`;
}

/**
 * Which row is Enter's when it isn't a search, in this order:
 * 1. The browser's own pick when it's an open tab ("youtu" with YouTube open): switch to it.
 * 2. A Loka tab whose site starts with what was typed, from any space; the shortest address wins, so a site's front
 *    page beats its deep pages. Loka knows its tabs at once, so this needs no answer from the browser.
 * 3. The browser's own pick when it's an address it knows (history, a bookmark): "Go to youtube.com".
 * The browser's picks count only in an answer for these exact words. A plain search, or a first answer without a
 * pick (builds before `default`), leaves no pick, and the search stays first.
 */
function defaultPick(
	state: BrowserState,
	query: string,
	fresh: NativeSuggestion[],
	context: ResultContext,
): DefaultPick | null {
	const q = query.trim().toLowerCase();
	const first = fresh[0];
	const browserPick =
		first?.default === true && first.kind !== "search" && !(context.inlineOff && first.inline) ? first : undefined;

	if (browserPick?.kind === "tab") {
		const same = (url: string) => url.replace(/\/$/, "") === browserPick.url.replace(/\/$/, "");
		const linked = Object.entries(context.links ?? {}).find(
			([id, browserId]) => browserId === browserPick.tabId && state.tabs[id],
		)?.[0];
		const lokaId = linked ?? Object.values(state.tabs).find((t) => same(t.url))?.id;
		const inline = browserPick.inline ?? "";
		if (lokaId) {
			const spaceId = spaceOf(state, lokaId);
			const detail = switchDetail(state, spaceId);
			const label = state.tabs[lokaId]?.title || browserPick.title;
			return { row: { kind: "tab", tabId: lokaId, spaceId, label, detail, group: "" }, inline, from: browserPick };
		}
		if (browserPick.tabId !== undefined) {
			const row: CommandResult = {
				kind: "browser-tab",
				tabId: browserPick.tabId,
				url: browserPick.url,
				label: browserPick.title || bareUrl(browserPick.url),
				detail: "Switch to tab",
				group: "",
			};
			return { row, inline, from: browserPick };
		}
	}

	// A trailing space or any space inside means words, not the start of an address.
	if (/^[a-z0-9.-]+$/.test(q) && query === query.trimEnd()) {
		const matches = Object.values(state.tabs)
			.filter((t) => /^https?:\/\//.test(t.url))
			.flatMap((t) => {
				const host = URL.parse(t.url)?.hostname.toLowerCase() ?? "";
				const site = [host, host.replace(/^www\./, "")].find((h) => h !== "" && h.startsWith(q));
				return site ? [{ tab: t, inline: site.slice(q.length) }] : [];
			})
			.sort((a, b) => a.tab.url.length - b.tab.url.length);
		const match = matches.find((m) => !context.inlineOff || m.inline === "");
		if (match) {
			const spaceId = spaceOf(state, match.tab.id);
			const detail = switchDetail(state, spaceId);
			const row: CommandResult = {
				kind: "tab",
				tabId: match.tab.id,
				spaceId,
				label: match.tab.title,
				detail,
				group: "",
			};
			// The browser's pick for the same site (www. or not) is this tab, so it isn't listed again under History.
			const from = browserPick && bareUrl(browserPick.url) === bareUrl(match.tab.url) ? browserPick : undefined;
			return { row, inline: match.inline, from };
		}
	}

	// An address without a completion is what was typed ("lit.dev/docs"); the first row already says it.
	if (browserPick && (browserPick.kind !== "url" || browserPick.inline)) {
		const icon = browserPick.kind === "bookmark" ? "bookmark" : browserPick.kind === "url" ? "globe" : "history";
		const row: CommandResult = {
			kind: "go",
			url: browserPick.url,
			icon,
			label: `Go to ${bareUrl(browserPick.url)}`,
			detail: browserPick.title,
			group: "",
		};
		return { row, inline: browserPick.inline ?? "", from: browserPick };
	}
	return null;
}

/** The browser's answer, when it's for exactly these words; any other answer can't say what Enter does. */
function freshAnswer(query: string, context: ResultContext): NativeSuggestion[] {
	const q = query.trim().toLowerCase();
	return q !== "" && context.suggestionsFor?.trim().toLowerCase() === q ? (context.suggestions ?? []) : [];
}

/**
 * The text shown selected after the caret, completing what was typed ("be.com" after "youtu"). Only while the first
 * row, the pick it completes to, is selected: moving to another row puts back exactly what was typed.
 */
export function inlineCompletion(
	state: BrowserState,
	query: string,
	context: ResultContext = {},
	selected = 0,
): string {
	if (selected !== 0 || context.inlineOff || !query.trim()) return "";
	return defaultPick(state, query, freshAnswer(query, context), context)?.inline ?? "";
}

/**
 * The person typed the next character of the completion ("b" over "youtu|be.com"): the same answer, now for the
 * longer words with a shorter completion, so the pick and its completion stay put instead of flickering until the
 * browser answers again. The answer's other rows keep only what still matches, and its old search is left out.
 * Null when the typed text doesn't continue the completion.
 */
export function continueAnswer(answer: SuggestionAnswer, typed: string): SuggestionAnswer | null {
	const [first, ...rest] = answer.list;
	if (!first?.default || !first.inline) return null;
	const full = `${answer.for}${first.inline}`;
	const text = typed.toLowerCase();
	if (typed.length <= answer.for.length || !full.toLowerCase().startsWith(text)) return null;
	const q = typed.trim().toLowerCase();
	const still = rest.filter(
		(s) => s.kind !== "search" && (s.title.toLowerCase().includes(q) || s.url.toLowerCase().includes(q)),
	);
	return { for: typed, list: [{ ...first, inline: full.slice(typed.length) }, ...still] };
}

/**
 * Which answer the bar keeps when one arrives. An answer for these exact words is kept until another one for the
 * current words replaces it, so a late answer for earlier words can't take away the pick or its completion.
 */
export function keepAnswer(current: SuggestionAnswer, incoming: SuggestionAnswer, query: string): SuggestionAnswer {
	return incoming.for !== query && current.for === query ? current : incoming;
}

const SUGGESTION_LIMIT = 6;

/**
 * What the bar shows for a query, in groups:
 * 1. What Enter does. When there's a pick (defaultPick: an open tab for the site typed, or the address the browser
 *    completes to) it goes first and the search second. Otherwise what was typed goes first: the browser's own
 *    first answer (an address or a search with the user's engine) once it has answered these exact words, else
 *    Loka's guess from toUrl.
 * 2. Tabs in any space whose title or site matches. An empty query lists this space's open tabs instead.
 * 3. The browser's other suggestions (history, bookmarks, open tabs), minus anything already listed. Suggestions
 *    for earlier words stay while the person keeps typing, but only the ones that still match.
 * 4. Spaces whose name matches, then matching commands (every command for an empty query).
 */
export function commandResults(state: BrowserState, query: string, context: ResultContext = {}): CommandResult[] {
	const q = query.trim().toLowerCase();
	const results: CommandResult[] = [];
	const answered = context.suggestionsFor?.trim().toLowerCase();
	const fresh = q !== "" && answered === q;
	const stillFits = q !== "" && answered !== undefined && answered !== "" && q.startsWith(answered);
	let native = fresh || stillFits ? (context.suggestions ?? []) : [];
	if (!fresh) {
		native = native.filter(
			(s) =>
				(s.kind === "history" || s.kind === "bookmark" || s.kind === "tab") &&
				(s.title.toLowerCase().includes(q) || s.url.toLowerCase().includes(q)),
		);
	}

	const pick = q ? defaultPick(state, query, fresh ? native : [], context) : null;
	if (pick) {
		results.push(pick.row);
		native = native.filter((s) => s !== pick.from);
	}
	if (q) {
		const first = native[0];
		// After a pick, the browser's search for these words is the second row; without one, its first answer is
		// the first row when that's an address or a search.
		const typed = !fresh
			? undefined
			: !pick && first && (first.kind === "url" || first.kind === "search")
				? first
				: native.find((s) => s.kind === "search" && s.title.trim().toLowerCase() === q);
		results.push(typed ? typedRow(typed, query.trim()) : guessRow(query));
		native = native.filter((s) => s !== typed);
	}

	const current = state.spaces.find((s) => s.id === state.activeSpaceId);
	const tabIds = q ? Object.keys(state.tabs) : (current?.open ?? []);
	const tabs = tabIds
		.map((id) => state.tabs[id])
		// An empty tab is where the bar itself is showing; offering to go there goes nowhere.
		.filter((tab) => tab && !isEmptyTab(tab.url))
		.filter((tab) => tab && !(pick?.row.kind === "tab" && pick.row.tabId === tab.id))
		.filter((tab) => tab && (!q || tab.title.toLowerCase().includes(q) || hostOf(tab.url).includes(q)))
		.slice(0, 6);
	for (const tab of tabs) {
		if (!tab) continue;
		const spaceId = spaceOf(state, tab.id);
		const spaceName = state.spaces.find((s) => s.id === spaceId)?.name ?? "";
		results.push({ kind: "tab", tabId: tab.id, spaceId, label: tab.title, detail: spaceName, group: "Tabs" });
	}

	// The same page with and without a trailing slash is one result.
	const same = (url: string) => url.replace(/\/$/, "");
	const listed = new Set(
		results.flatMap((r) =>
			r.kind === "go" ? [same(r.url)] : r.kind === "tab" ? [same(state.tabs[r.tabId]?.url ?? "")] : [],
		),
	);
	const listedTabs = new Set(results.flatMap((r) => (r.kind === "tab" ? [r.tabId] : [])));
	const lokaTabOf = (browserId: number) =>
		Object.entries(context.links ?? {}).find(([id, linked]) => linked === browserId && state.tabs[id])?.[0];
	// The browser's other suggestions, sorted into their sections: open tabs join the tabs, then history, then
	// bookmarks. A search suggestion (other words) counts as history: it's what was searched before.
	const sections: Record<"Tabs" | "History" | "Bookmarks", CommandResult[]> = { Tabs: [], History: [], Bookmarks: [] };
	let suggested = 0;
	for (const s of native) {
		if (suggested >= SUGGESTION_LIMIT || listed.has(same(s.url))) continue;
		if (s.kind === "tab" && s.tabId !== undefined) {
			const lokaId = lokaTabOf(s.tabId);
			if (lokaId && listedTabs.has(lokaId)) continue;
			if (lokaId) {
				const spaceId = spaceOf(state, lokaId);
				const detail = state.spaces.find((x) => x.id === spaceId)?.name ?? "";
				sections.Tabs.push({ kind: "tab", tabId: lokaId, spaceId, label: s.title, detail, group: "Tabs" });
				listedTabs.add(lokaId);
			} else {
				sections.Tabs.push({
					kind: "browser-tab",
					tabId: s.tabId,
					url: s.url,
					label: s.title,
					detail: "Switch to tab",
					group: "Tabs",
				});
			}
		} else if (s.kind === "bookmark") {
			sections.Bookmarks.push({
				kind: "go",
				url: s.url,
				icon: "bookmark",
				label: s.title || shortUrl(s.url),
				detail: hostOf(s.url),
				group: "Bookmarks",
			});
		} else {
			const icon = s.kind === "search" ? "search" : "history";
			const detail = s.kind === "search" ? `Search with ${engineName(s.url)}` : hostOf(s.url);
			sections.History.push({
				kind: "go",
				url: s.url,
				icon,
				label: s.title || shortUrl(s.url),
				detail,
				group: "History",
			});
		}
		listed.add(same(s.url));
		suggested++;
	}
	results.push(...sections.Tabs, ...sections.History, ...sections.Bookmarks);

	if (q) {
		for (const [i, space] of state.spaces.entries()) {
			if (space.id === state.activeSpaceId || !space.name.toLowerCase().includes(q)) continue;
			results.push({ kind: "space", spaceId: space.id, label: space.name, detail: `Ctrl+${i + 1}`, group: "Spaces" });
		}
	}

	for (const a of ACTIONS) {
		const unpinned = a.action === "toggle-sidebar" && context.pinned === false;
		const muted = a.action === "toggle-sound" && context.sound === false;
		const label = unpinned ? "Keep the sidebar open" : muted ? "Unmute sounds" : a.label;
		const detail = unpinned ? "Pin it back in place" : a.detail;
		if (!q || `${label} ${a.label} ${a.words}`.toLowerCase().includes(q)) {
			results.push({ kind: "action", action: a.action, label, detail, group: "Commands" });
		}
	}
	return results;
}

/** Whether a string the browser relayed is one of the bar's commands. */
export function isActionId(value: string): value is ActionId {
	return ACTIONS.some((a) => a.action === value);
}
