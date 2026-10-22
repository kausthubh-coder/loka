// The sidebar's line to the browser. The sidebar is a built-in browser page (chrome://loka-sidebar.top-chrome),
// and LokaSidebarHandler (chrome/browser/ui/webui/loka_sidebar/) answers it: chrome.send carries a request, and the
// browser answers through cr.webUIResponse or pushes news through cr.webUIListenerCallback.

import type { BrowserEvent, Message } from "./messages";

declare global {
	interface Window {
		cr: {
			webUIResponse(id: string, ok: boolean, value: unknown): void;
			webUIListenerCallback(event: string, ...args: unknown[]): void;
		};
	}
}

/** WebUI's chrome.send, which the extension typings (also loaded in this repo) don't describe. */
const send = (message: Message, args: unknown[]) =>
	(globalThis as unknown as { chrome: { send(message: string, args: unknown[]): void } }).chrome.send(message, args);

/** A tab in this window, as the browser reports it. Ids are the browser's tab handles. */
export interface NativeTab {
	id: number;
	url: string;
	title: string;
	/**
	 * The tab's own favicon, an image the sidebar's host serves (chrome://loka-sidebar.top-chrome/tab-icon/...), or ""
	 * when it has none yet. The address changes only when the picture does.
	 */
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

/** What changed in the window's tabs since the page last heard (the handler's "tabs-changed"). */
interface TabChanges {
	/** Tabs that are new or changed, whole. */
	tabs?: NativeTab[];
	removed?: number[];
	/** Every tab's id in the window's order, when the order changed. */
	order?: number[];
	/** Every group, when any changed. */
	groups?: NativeGroup[];
}

export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

/** An installed, enabled extension, as its toolbar button would show it. */
export interface NativeExtension {
	id: string;
	name: string;
	/** Its action icon for the active tab, as a data: URL. */
	icon: string;
	/** Badge text for the active tab ("12"), or "". */
	badge: string;
	/** Badge background as a CSS color, or "". */
	badgeColor: string;
	/** Whether the user pinned it to the sidebar's toolbar. */
	pinned: boolean;
	/** Whether it has an options page, which its menu's Options opens. */
	hasOptions: boolean;
}

export type DownloadState = "running" | "paused" | "complete" | "failed" | "cancelled";

export interface NativeDownload {
	id: number;
	/** The file's name on disk, or the URL's last part while it's being named. */
	name: string;
	url: string;
	state: DownloadState;
	receivedBytes: number;
	/** -1 when the size isn't known. */
	totalBytes: number;
	/** ms since 1970. */
	startTime: number;
	canResume: boolean;
}

/** What a tab's media session says is playing. */
export interface NativeMedia {
	tabId: number;
	title: string;
	artist: string;
	/** The page's artwork as a data: URL, or "". */
	artwork: string;
	playing: boolean;
	/** Whether the page handles previous and next track (its media session's actions). */
	canPrevious: boolean;
	canNext: boolean;
}

/** One row of the address field's suggestions, from the browser's own autocomplete (history, bookmarks, tabs). */
export interface NativeSuggestion {
	kind: "url" | "search" | "history" | "bookmark" | "tab";
	title: string;
	/** Where it goes when picked. */
	url: string;
	/** The open tab it switches to, for kind "tab". */
	tabId?: number;
	/**
	 * The browser's pick for Enter, as its own address bar would choose: only ever on the first suggestion. Builds
	 * before this field leave it out, which reads as no pick.
	 */
	default?: boolean;
	/** What the address bar would complete the typed text with ("be.com" after "youtu"); "" or left out for none. */
	inline?: string;
}

export type ColorScheme = "light" | "dark" | "system";

/**
 * Browser shortcuts the sidebar answers: Ctrl+T and Ctrl+L open the command bar (there is no new tab page);
 * Ctrl+W closes the shown tab as the sidebar's x does; Ctrl+Tab and Ctrl+Shift+Tab step through the current
 * space's tabs; Ctrl+1..9 go to that space.
 */
export type BrowserCommand =
	| "new-tab"
	| "focus-location"
	| "close-tab"
	| "next-tab"
	| "previous-tab"
	| `space-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

/**
 * What was picked in the command bar page (command.html). The page hands it to its window's sidebar, which runs it
 * as if it had been picked there; the browser passes it on untouched.
 * - open: go to `url`, in a new tab or the current one. `search` is set when it's a search for those words, which the
 *   sidebar runs with the user's own search engine.
 * - tab: show a Loka tab (ids are the sidebar's own); browser-tab: switch to a browser tab Loka doesn't know.
 * - space: switch to a space. action: one of the command bar's commands ("new-space", "downloads", ...).
 */
export type CommandPick =
	| { kind: "open"; url: string; newTab: boolean; search?: string }
	| { kind: "tab"; tabId: string; spaceId: string }
	| { kind: "browser-tab"; tabId: number }
	| { kind: "space"; spaceId: string }
	| { kind: "action"; action: string };

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

function ask<T>(message: Message, ...args: unknown[]): Promise<T> {
	const id = `loka-${nextId++}`;
	return new Promise((resolve) => {
		pending.set(id, resolve as (value: unknown) => void);
		send(message, [id, ...args]);
	});
}

function tell(message: Message, ...args: unknown[]) {
	send(message, args);
}

function on(event: BrowserEvent, listener: (...args: unknown[]) => void): () => void {
	const set = listeners.get(event) ?? new Set();
	listeners.set(event, set);
	set.add(listener);
	return () => set.delete(listener);
}

/**
 * This window's tabs and groups as the page last heard, kept by "tabs-changed" once syncTabs has started it. Listening
 * here first means every other listener sees the copy with the change applied.
 */
const heard = { tabs: new Map<number, NativeTab>(), order: [] as number[], groups: [] as NativeGroup[] };

function heardTabs(): NativeTab[] {
	return heard.order.flatMap((id) => heard.tabs.get(id) ?? []);
}

on("tabs-changed", (c) => {
	const changes = c as TabChanges;
	for (const id of changes.removed ?? []) heard.tabs.delete(id);
	for (const tab of changes.tabs ?? []) heard.tabs.set(tab.id, tab);
	if (changes.order) heard.order = changes.order;
	if (changes.groups) heard.groups = changes.groups;
});

export const browser = {
	/** A snapshot of the window's tabs, for a page that looks now and then (the command bar). */
	tabs: () => ask<NativeTab[]>("getTabs"),
	groups: () => ask<NativeGroup[]>("getGroups"),
	/**
	 * The window's tabs and groups, current as of now: the browser sends what changed before it answers. The first
	 * call starts tabs-changed for this page (onTabsChanged); after that it costs one small message each way.
	 */
	syncTabs: async (): Promise<{ tabs: NativeTab[]; groups: NativeGroup[] }> => {
		await ask("syncTabs");
		return { tabs: heardTabs(), groups: heard.groups };
	},
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
	/** The window's tabs, whole, each time something in them changes (after syncTabs). */
	onTabsChanged: (listener: (tabs: NativeTab[]) => void) => on("tabs-changed", () => listener(heardTabs())),
	/** The keys another page changed in the store (never this page's own setStore). */
	onStoreChanged: (listener: (store: Record<string, string>) => void) =>
		on("store-changed", (s) => listener(s as Record<string, string>)),

	// Planned (PLANNED_MESSAGES in messages.ts): the C++ handler is being extended to answer these. Until a message
	// exists the browser ignores it and an ask() never resolves, so callers must treat these as optional for now.
	extensions: () => ask<NativeExtension[]>("getExtensions"),
	/** Clicks the extension's toolbar button: opens its popup next to `anchor` (sidebar CSS pixels) or runs it. */
	runExtension: (id: string, anchor: { x: number; y: number; width: number; height: number }) =>
		tell("runExtension", id, anchor),
	setExtensionPinned: (id: string, pinned: boolean) => tell("setExtensionPinned", id, pinned),
	/**
	 * An extension's right-click menu: "options" opens its options page and "manage" chrome://extensions/?id=<id>, each
	 * in a new tab; "remove" shows Chrome's own uninstall dialog, and extensions-changed follows if the user confirms.
	 */
	extensionAction: (id: string, action: "options" | "manage" | "remove") => tell("extensionAction", id, action),
	onExtensionsChanged: (listener: (extensions: NativeExtension[]) => void) =>
		on("extensions-changed", (e) => listener(e as NativeExtension[])),

	downloads: () => ask<NativeDownload[]>("getDownloads"),
	downloadAction: (id: number, action: "open" | "show" | "pause" | "resume" | "cancel" | "retry" | "remove") =>
		tell("downloadAction", id, action),
	onDownloadsChanged: (listener: (downloads: NativeDownload[]) => void) =>
		on("downloads-changed", (d) => listener(d as NativeDownload[])),

	media: () => ask<NativeMedia[]>("getMedia"),
	/** Plays or pauses the tab's media session, as the page's own controls would. */
	mediaAction: (tabId: number, action: "play" | "pause" | "next" | "previous") => tell("mediaAction", tabId, action),
	onMediaChanged: (listener: (media: NativeMedia[]) => void) =>
		on("media-changed", (m) => listener(m as NativeMedia[])),

	/** Starts the browser's autocomplete for `query`; results arrive through onSuggestions. */
	suggest: (query: string) => tell("suggest", query),
	onSuggestions: (listener: (query: string, suggestions: NativeSuggestion[]) => void) =>
		on("suggestions", (q, s) => listener(q as string, s as NativeSuggestion[])),

	/** Pinned shows the sidebar always; unpinned slides it away until the mouse reaches the window's edge. */
	setSidebarPinned: (pinned: boolean) => tell("setSidebarPinned", pinned),
	sidebarPinned: () => ask<boolean>("getSidebarPinned"),
	/**
	 * While true, a hidden (unpinned) sidebar that is showing stays open: something in it is being typed in, a menu
	 * or panel is open, or a tab is being dragged (hold.logic.ts decides).
	 */
	holdSidebar: (held: boolean) => tell("holdSidebar", held),
	/** Media autoplay for pages loaded from now on (the loka.autoplay pref). */
	setAutoplay: (mode: "block" | "block-audible" | "allow") => tell("setAutoplay", mode),
	autoplay: () => ask<"block" | "block-audible" | "allow">("getAutoplay"),
	/** Light or dark for the browser and the pages that follow it (prefers-color-scheme). */
	setColorScheme: (scheme: ColorScheme) => tell("setColorScheme", scheme),
	/** The window frame around the page takes this color ("#rrggbb"), or the theme's own with null. */
	setThemeColor: (color: string | null) => tell("setThemeColor", color),
	onCommand: (listener: (command: BrowserCommand) => void) => on("command", (c) => listener(c as BrowserCommand)),
	/**
	 * Shows the floating command bar: a frameless, transparent window (about 680x520) centered over this one, loading
	 * command.html, which then gets `command` through onCommand.
	 */
	openCommandBar: (command: BrowserCommand) => tell("openCommandBar", command),
	/** From command.html: hide the floating command bar (Escape, a click outside it, or after a pick). */
	closeCommandBar: () => tell("closeCommandBar"),

	// Planned, asked for by the sidebar's front end (not in the handler yet):
	/** The pinned state changed from outside this page (another window, a browser menu). */
	onSidebarPinnedChanged: (listener: (pinned: boolean) => void) =>
		on("sidebar-pinned-changed", (p) => listener(p as boolean)),
	/** From command.html: pass what was picked to this window's sidebar, which gets it through onCommandPicked. */
	commandPicked: (pick: CommandPick) => tell("commandPicked", pick),
	onCommandPicked: (listener: (pick: CommandPick) => void) => on("command-picked", (p) => listener(p as CommandPick)),
};

/** Everything the sidebar can ask of the browser. The prototype's fake (prototype/src/demo/) has the same shape. */
export type Browser = typeof browser;
