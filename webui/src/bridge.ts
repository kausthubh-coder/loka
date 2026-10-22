// The sidebar's line to the browser. The sidebar is a built-in browser page (chrome://loka-sidebar.top-chrome),
// and LokaSidebarHandler (chrome/browser/ui/webui/loka_sidebar/) answers it: chrome.send carries a request, and the
// browser answers through cr.webUIResponse or pushes news through cr.webUIListenerCallback (channel.ts). Loka's other
// pages that the same handler answers (Settings, the command bar, the empty tab, the Library) use it too.

import type { ChromeMenuCommand } from "../../prototype/src/features/command-bar/command-bar.logic";
import type { MenuModel } from "../../prototype/src/features/menu/menu.logic";
import type { Intent } from "../../prototype/src/features/sidebar/intents.logic";
import type { BrowserState, SpaceScheme, TabId } from "../../prototype/src/features/sidebar/sidebar.logic";
import type { SpacesDelta } from "../../prototype/src/features/sidebar/spaces-delta.logic";
import { channel } from "./channel";
import type { BrowserEvent, Message } from "./messages";

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
	/** Unloaded to save memory (a space out of sight, or Memory Saver); it loads again when shown. */
	discarded: boolean;
	/** -1 when the tab isn't in a group. */
	groupId: number;
	openerId?: number;
	lastAccessed: number;
}

/** A menu as the floating menu window draws it: the items, and the space's color and light or dark. */
export interface ShownMenu extends MenuModel {
	hue: number;
	scheme: SpaceScheme;
}

/** A tab group in the window, as getGroups reports it (verify:flows reads them). */
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
}

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

const { ask, tell, on } = channel<Message, BrowserEvent>("loka");

/**
 * This window's tabs as the page last heard, kept by "tabs-changed" once syncTabs has started it. Listening here first
 * means every other listener sees the copy with the change applied.
 */
const heard = { tabs: new Map<number, NativeTab>(), order: [] as number[] };

function heardTabs(): NativeTab[] {
	return heard.order.flatMap((id) => heard.tabs.get(id) ?? []);
}

on("tabs-changed", (c) => {
	const changes = c as TabChanges;
	for (const id of changes.removed ?? []) heard.tabs.delete(id);
	for (const tab of changes.tabs ?? []) heard.tabs.set(tab.id, tab);
	if (changes.order) heard.order = changes.order;
});

export const browser = {
	/**
	 * The spaces, once the browser has read them, and which browser tab shows each loaded Loka tab in this window. A
	 * window's sidebar asking also starts the browser keeping that window's tabs in step with the spaces.
	 */
	getSpaces: () => ask<{ state: BrowserState; links: [TabId, number][] }>("getSpaces"),
	/** Asks the browser to make a change; a "spaces-changed" carrying `seq` as its `ack` says it's done. */
	spacesDo: (seq: number, intent: Intent) => tell("spacesDo", seq, intent),
	/** What changed in the spaces, from this page's intents (with `ack`), another window's, or the browser's. */
	onSpacesChanged: (listener: (delta: SpacesDelta & { ack?: number }) => void) =>
		on("spaces-changed", (d) => listener(d as SpacesDelta & { ack?: number })),
	/** This window's links, Loka tab id to browser tab, whenever they change. */
	onLinksChanged: (listener: (links: [TabId, number][]) => void) =>
		on("links-changed", (l) => listener(l as [TabId, number][])),
	/** A snapshot of the window's tabs, for a page that looks now and then (the command bar). */
	tabs: () => ask<NativeTab[]>("getTabs"),
	/**
	 * The window's tabs, current as of now: the browser sends what changed before it answers. The first call starts
	 * tabs-changed for this page (onTabsChanged); after that it costs one small message each way.
	 */
	syncTabs: async (): Promise<NativeTab[]> => {
		await ask("syncTabs");
		return heardTabs();
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
	/** Searches with the user's own search engine. */
	search: (query: string, newTab: boolean) => tell("search", query, newTab),
	/** Opens one of the browser's own pages (chrome://settings, downloads, extensions), reusing a tab showing it. */
	openPage: (url: string) => tell("openPage", url),
	/** The window's own buttons: the sidebar is its title bar. "maximize" toggles back to restored. */
	windowAction: (action: "minimize" | "maximize" | "close") => tell("windowAction", action),
	/** One of the browser's own commands (new window, find, print, zoom...), as Chrome's toolbar menu runs it. */
	browserCommand: (command: ChromeMenuCommand) => tell("browserCommand", command),
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
	 * The browser's own bookmarks, where setup's import puts them, as Chrome's Bookmarks file: once per profile, to
	 * the first window that asks. "" when there are none or they were taken already; null while they're still loading.
	 */
	takeBrowserBookmarks: () => ask<string | null>("takeBrowserBookmarks"),
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
	/**
	 * The sidebar's menus open in a window of their own (menu.html), at (x, y) in the sidebar page, so they can reach
	 * past its edge. The sidebar hears what was picked (onMenuPicked) or that it closed (onMenuClosed).
	 */
	showMenu: (menu: ShownMenu, x: number, y: number) => tell("showMenu", menu, x, y),
	onMenuPicked: (listener: (path: number[]) => void) => on("menu-picked", (p) => listener(p as number[])),
	onMenuClosed: (listener: () => void) => on("menu-closed", () => listener()),
	/** The menu page: the menu to draw. */
	onMenuShow: (listener: (menu: ShownMenu) => void) => on("menu-show", (m) => listener(m as ShownMenu)),
	/** The menu page's size for it, in CSS px: the browser shows the window that big, at the pointer. */
	menuReady: (width: number, height: number) => tell("menuReady", width, height),
	menuPicked: (path: number[]) => tell("menuPicked", path),
	closeMenu: () => tell("closeMenu"),
};

/** Everything the sidebar can ask of the browser. The prototype's fake (prototype/src/demo/) has the same shape. */
export type Browser = typeof browser;
