import type { BrowserCommand, NativeSuggestion } from "../../../../webui/src/bridge";
import { hostOf } from "../sidebar/favicon";
import type { BrowserState, TabId } from "../sidebar/sidebar.logic";

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

/**
 * Where an address picked in the bar opens: a new tab (Ctrl+T, Ctrl+K, New tab) or the tab on screen (Ctrl+L, the
 * address field). The same names as the browser's own commands.
 */
export type CommandMode = BrowserCommand;

export type ActionId =
	| "new-space"
	| "edit-space"
	| "new-folder"
	| "toggle-sidebar"
	| "settings"
	| "downloads"
	| "extensions"
	| "search-sidebar"
	| "archive"
	| "onboarding";

export type ResultGroup = "" | "Tabs" | "Suggestions" | "Spaces" | "Commands";

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
	{ action: "downloads", label: "Downloads", detail: "Recent files", words: "files" },
	{ action: "extensions", label: "Extensions", detail: "Run, pin or manage them", words: "addons plugins" },
	{ action: "search-sidebar", label: "Search the sidebar", detail: "Ctrl+Shift+F", words: "find tabs everywhere" },
	{ action: "archive", label: "Archived tabs", detail: "Bring back an archived tab", words: "old closed restore" },
	{ action: "onboarding", label: "Show the welcome tour", detail: "Onboarding", words: "intro welcome tour" },
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
}

function fromSuggestion(s: NativeSuggestion, group: ResultGroup): CommandResult {
	const icon =
		s.kind === "search" ? "search" : s.kind === "history" ? "history" : s.kind === "bookmark" ? "bookmark" : "globe";
	const label = s.title || (s.kind === "url" ? `Open ${hostOf(s.url)}` : s.url);
	return { kind: "go", url: s.url, icon, label, detail: s.kind === "search" ? "Search" : hostOf(s.url), group };
}

const SUGGESTION_LIMIT = 6;

/**
 * What the bar shows for a query, in groups:
 * 1. What was typed: the browser's own first answer (an address or a search with the user's engine) once it has
 *    answered these exact words, else Loka's guess from toUrl.
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

	if (q) {
		const first = native[0];
		if (fresh && first && (first.kind === "url" || first.kind === "search")) {
			results.push(fromSuggestion(first, ""));
			native = native.slice(1);
		} else {
			const url = toUrl(query);
			results.push(
				isSearch(url)
					? {
							kind: "go",
							url,
							icon: "search",
							search: query.trim(),
							label: `Search for "${query.trim()}"`,
							detail: "Search",
							group: "",
						}
					: { kind: "go", url, icon: "globe", label: `Open ${hostOf(url)}`, detail: url, group: "" },
			);
		}
	}

	const current = state.spaces.find((s) => s.id === state.activeSpaceId);
	const tabIds = q ? Object.keys(state.tabs) : (current?.open ?? []);
	const tabs = tabIds
		.map((id) => state.tabs[id])
		// A new tab page is where the bar itself is showing; offering to go there goes nowhere.
		.filter((tab) => tab && !tab.url.startsWith("chrome://newtab"))
		.filter((tab) => tab && (!q || tab.title.toLowerCase().includes(q) || hostOf(tab.url).includes(q)))
		.slice(0, 6);
	for (const tab of tabs) {
		if (!tab) continue;
		const spaceId = spaceOf(state, tab.id);
		const spaceName = state.spaces.find((s) => s.id === spaceId)?.name ?? "";
		results.push({ kind: "tab", tabId: tab.id, spaceId, label: tab.title, detail: spaceName, group: "Tabs" });
	}

	const listed = new Set(
		results.flatMap((r) => (r.kind === "go" ? [r.url] : r.kind === "tab" ? [state.tabs[r.tabId]?.url ?? ""] : [])),
	);
	const listedTabs = new Set(results.flatMap((r) => (r.kind === "tab" ? [r.tabId] : [])));
	const lokaTabOf = (browserId: number) =>
		Object.entries(context.links ?? {}).find(([id, linked]) => linked === browserId && state.tabs[id])?.[0];
	let suggested = 0;
	for (const s of native) {
		if (suggested >= SUGGESTION_LIMIT || listed.has(s.url)) continue;
		if (s.kind === "tab" && s.tabId !== undefined) {
			const lokaId = lokaTabOf(s.tabId);
			if (lokaId && listedTabs.has(lokaId)) continue;
			if (lokaId) {
				const spaceId = spaceOf(state, lokaId);
				const detail = state.spaces.find((x) => x.id === spaceId)?.name ?? "";
				results.push({ kind: "tab", tabId: lokaId, spaceId, label: s.title, detail, group: "Suggestions" });
				listedTabs.add(lokaId);
			} else {
				results.push({
					kind: "browser-tab",
					tabId: s.tabId,
					url: s.url,
					label: s.title,
					detail: "Open tab",
					group: "Suggestions",
				});
			}
		} else {
			results.push(fromSuggestion(s, "Suggestions"));
		}
		listed.add(s.url);
		suggested++;
	}

	if (q) {
		for (const [i, space] of state.spaces.entries()) {
			if (space.id === state.activeSpaceId || !space.name.toLowerCase().includes(q)) continue;
			results.push({ kind: "space", spaceId: space.id, label: space.name, detail: `Ctrl+${i + 1}`, group: "Spaces" });
		}
	}

	for (const a of ACTIONS) {
		const label = a.action === "toggle-sidebar" && context.pinned === false ? "Keep the sidebar open" : a.label;
		const detail = a.action === "toggle-sidebar" && context.pinned === false ? "Pin it back in place" : a.detail;
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
