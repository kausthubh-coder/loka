// The sidebar's line to the browser. The sidebar is a built-in browser page (chrome://loka-sidebar.top-chrome),
// and LokaSidebarHandler (chrome/browser/ui/webui/loka_sidebar/) answers it: chrome.send carries a request, and the
// browser answers through cr.webUIResponse or pushes news through cr.webUIListenerCallback.

declare global {
	interface Window {
		cr: {
			webUIResponse(id: string, ok: boolean, value: unknown): void;
			webUIListenerCallback(event: string, ...args: unknown[]): void;
		};
	}
}

/** WebUI's chrome.send, which the extension typings (also loaded in this repo) don't describe. */
const send = (message: string, args: unknown[]) =>
	(globalThis as unknown as { chrome: { send(message: string, args: unknown[]): void } }).chrome.send(message, args);

/** A tab in this window, as the browser reports it. Ids are the browser's tab handles. */
export interface NativeTab {
	id: number;
	index: number;
	url: string;
	title: string;
	/** The tab's own favicon as a data: URL, or "" when it has none yet. */
	favicon: string;
	active: boolean;
	pinned: boolean;
	loading: boolean;
	audible: boolean;
	muted: boolean;
	/** -1 when the tab isn't in a group. */
	groupId: number;
	openerId?: number;
	lastAccessed: number;
}

export interface NativeGroup {
	id: number;
	title: string;
	collapsed: boolean;
}

export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

const pending = new Map<string, (value: unknown) => void>();
const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
let nextId = 0;

window.cr = {
	webUIResponse(id, _ok, value) {
		pending.get(id)?.(value);
		pending.delete(id);
	},
	webUIListenerCallback(event, ...args) {
		for (const listener of listeners.get(event) ?? []) listener(...args);
	},
};

function ask<T>(message: string, ...args: unknown[]): Promise<T> {
	const id = `loka-${nextId++}`;
	return new Promise((resolve) => {
		pending.set(id, resolve as (value: unknown) => void);
		send(message, [id, ...args]);
	});
}

function tell(message: string, ...args: unknown[]) {
	send(message, args);
}

function on(event: string, listener: (...args: unknown[]) => void): () => void {
	let set = listeners.get(event);
	if (!set) listeners.set(event, (set = new Set()));
	set.add(listener);
	return () => set.delete(listener);
}

export const browser = {
	tabs: () => ask<NativeTab[]>("getTabs"),
	groups: () => ask<NativeGroup[]>("getGroups"),
	/** Opens a tab and returns its id; an empty url opens the browser's new tab page. */
	createTab: (url: string, active = true) => ask<number | null>("createTab", url, active),
	activateTab: (id: number) => tell("activateTab", id),
	closeTab: (id: number) => tell("closeTab", id),
	navigateTab: (id: number, url: string) => tell("navigateTab", id, url),
	goBack: (id: number) => tell("goBack", id),
	goForward: (id: number) => tell("goForward", id),
	reload: (id: number) => tell("reload", id),
	setMuted: (id: number, muted: boolean) => tell("setMuted", id, muted),
	/** Puts the tabs in `groupId`, or in a new group when it's -1 or gone; returns the group's id. */
	groupTabs: (ids: number[], groupId: number) => ask<number | null>("groupTabs", ids, groupId),
	updateGroup: (groupId: number, look: { title?: string; color?: GroupColor; collapsed?: boolean }) =>
		tell("updateGroup", groupId, look.title ?? null, look.color ?? null, look.collapsed ?? null),
	ungroupTabs: (ids: number[]) => tell("ungroupTabs", ids),
	/** Searches with the user's own search engine. */
	search: (query: string, newTab: boolean) => tell("search", query, newTab),
	/** Opens one of the browser's own pages (chrome://settings, downloads, extensions), reusing a tab showing it. */
	openPage: (url: string) => tell("openPage", url),
	/** The window's own buttons: the sidebar is its title bar. "maximize" toggles back to restored. */
	windowAction: (action: "minimize" | "maximize" | "close") => tell("windowAction", action),
	/** Starts moving the window with the mouse press that's down now. */
	startWindowDrag: () => tell("startWindowDrag"),
	store: () => ask<Record<string, string>>("getStore"),
	/** Saves a value in the profile, shared by every window; null removes it. */
	setStore: (key: string, value: string | null) => tell("setStore", key, value),
	onTabsChanged: (listener: (tabs: NativeTab[]) => void) => on("tabs-changed", (t) => listener(t as NativeTab[])),
	onStoreChanged: (listener: (store: Record<string, string>) => void) =>
		on("store-changed", (s) => listener(s as Record<string, string>)),
};
