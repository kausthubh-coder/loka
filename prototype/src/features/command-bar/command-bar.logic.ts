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

export type ActionId =
	| "new-space"
	| "edit-space"
	| "new-folder"
	| "toggle-sidebar"
	| "settings"
	| "downloads"
	| "onboarding";

export type CommandResult =
	| { kind: "go"; url: string; label: string; detail: string }
	| { kind: "tab"; tabId: TabId; spaceId: string; label: string; detail: string }
	| { kind: "action"; action: ActionId; label: string; detail: string };

const ACTIONS: { action: ActionId; label: string; detail: string; words: string }[] = [
	{ action: "new-space", label: "New space", detail: "Name it, pick a color and a planet", words: "create add world" },
	{
		action: "edit-space",
		label: "Edit this space",
		detail: "Rename, recolor, change planet",
		words: "rename color customize",
	},
	{ action: "new-folder", label: "New folder", detail: "In this space's pinned tabs", words: "create group" },
	{ action: "toggle-sidebar", label: "Hide or show the sidebar", detail: "Ctrl+S", words: "toggle collapse" },
	{ action: "settings", label: "Settings", detail: "loka://settings", words: "preferences options" },
	{ action: "downloads", label: "Downloads", detail: "loka://downloads", words: "files" },
	{ action: "onboarding", label: "Show the welcome tour", detail: "Onboarding", words: "intro welcome tour" },
];

/** Where a tab lives, for the result's label. Essentials belong to every space, so they go to the current one. */
function spaceOf(state: BrowserState, tabId: TabId): string {
	const pinnedIds = (nodes: BrowserState["spaces"][number]["pinned"]): TabId[] =>
		nodes.flatMap((n) => (n.kind === "tab" ? [n.id] : pinnedIds(n.children)));
	const owner = state.spaces.find((s) => s.open.includes(tabId) || pinnedIds(s.pinned).includes(tabId));
	return owner?.id ?? state.activeSpaceId;
}

/**
 * What the Ctrl+K bar shows for a query: first the address or search to open, then tabs in any space whose title
 * or site matches, then matching commands. An empty query lists this space's open tabs and the commands.
 */
export function commandResults(state: BrowserState, query: string): CommandResult[] {
	const q = query.trim().toLowerCase();
	const results: CommandResult[] = [];
	if (q) {
		const url = toUrl(query);
		results.push(
			isSearch(url)
				? { kind: "go", url, label: `Search for "${query.trim()}"`, detail: "DuckDuckGo" }
				: { kind: "go", url, label: `Open ${hostOf(url)}`, detail: url },
		);
	}

	const current = state.spaces.find((s) => s.id === state.activeSpaceId);
	const tabIds = q ? Object.keys(state.tabs) : (current?.open ?? []);
	const tabs = tabIds
		.map((id) => state.tabs[id])
		.filter((tab) => tab && (!q || tab.title.toLowerCase().includes(q) || hostOf(tab.url).includes(q)))
		.slice(0, 6);
	for (const tab of tabs) {
		if (!tab) continue;
		const spaceId = spaceOf(state, tab.id);
		const spaceName = state.spaces.find((s) => s.id === spaceId)?.name ?? "";
		results.push({ kind: "tab", tabId: tab.id, spaceId, label: tab.title, detail: spaceName });
	}

	for (const a of ACTIONS) {
		if (!q || `${a.label} ${a.words}`.toLowerCase().includes(q)) {
			results.push({ kind: "action", action: a.action, label: a.label, detail: a.detail });
		}
	}
	return results;
}
