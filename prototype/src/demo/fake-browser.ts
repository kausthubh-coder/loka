// The prototype's stand-in for the browser: the same shape as webui/src/bridge.ts's `browser`, answering from
// realistic sample data so `bun run dev` shows every panel working. This folder is the only place sample data
// lives; product code starts empty and fills from whatever bridge it's given.
//
// It also keeps a log of every call (window.lokaDemo.calls) so a Playwright run can check what the sidebar asked
// the browser to do, and lets the prototype press the browser's own shortcuts (window.lokaDemo.command).

import type {
	Browser,
	BrowserCommand,
	ColorScheme,
	CommandPick,
	NativeDownload,
	NativeExtension,
	NativeMedia,
	NativeSuggestion,
	NativeTab,
	ShownMenu,
} from "../../../webui/src/bridge";
import { seedState } from "../features/sidebar/sidebar.seed";
import type { SpacesDelta } from "../features/sidebar/spaces-delta.logic";
import { DEMO_DOWNLOADS, DEMO_EXTENSIONS, DEMO_HISTORY, DEMO_PLAYLIST, MUSIC_TAB } from "./demo-data";

type Listener = (...args: unknown[]) => void;
const listeners = new Map<string, Set<Listener>>();

function on(event: string, listener: Listener): () => void {
	const set = listeners.get(event) ?? new Set();
	listeners.set(event, set);
	set.add(listener);
	return () => set.delete(listener);
}

function emit(event: string, ...args: unknown[]) {
	for (const listener of listeners.get(event) ?? []) listener(...args);
}

export interface DemoCall {
	message: string;
	args: unknown[];
}

const calls: DemoCall[] = [];
function log(message: string, ...args: unknown[]) {
	calls.push({ message, args });
}

const PINNED_KEY = "loka.demo.sidebarPinned";

let extensions: NativeExtension[] = DEMO_EXTENSIONS.map((x) => ({ ...x }));
let downloads: NativeDownload[] = DEMO_DOWNLOADS(Date.now());
let track = 0;
let playing = true;
let muted = false;
let scheme: ColorScheme = "system";
/** The browser's loka.autoplay pref, as the fake keeps it. */
let autoplay: "block" | "block-audible" | "allow" = "block";
let store: Record<string, string> = {};

function media(): NativeMedia[] {
	const now = DEMO_PLAYLIST[track % DEMO_PLAYLIST.length];
	if (!now) return [];
	return [{ tabId: MUSIC_TAB.id, ...now, playing }];
}

function tabs(): NativeTab[] {
	return [{ ...MUSIC_TAB, audible: playing && !muted, muted }];
}

function mediaChanged() {
	emit("media-changed", media());
	emit("tabs-changed", tabs());
}

// A running download moves along twice a second while someone is watching the list, then finishes.
let ticker = 0;
function tick() {
	const running = downloads.some((d) => d.state === "running");
	const watched = (listeners.get("downloads-changed")?.size ?? 0) > 0;
	if (!running || !watched || document.hidden) {
		window.clearInterval(ticker);
		ticker = 0;
		return;
	}
	downloads = downloads.map((d) => {
		if (d.state !== "running") return d;
		const step = d.totalBytes > 0 ? d.totalBytes / 60 : 1.5 * 1024 ** 2;
		const receivedBytes = d.totalBytes > 0 ? Math.min(d.totalBytes, d.receivedBytes + step) : d.receivedBytes + step;
		const done = d.totalBytes > 0 && receivedBytes >= d.totalBytes;
		return { ...d, receivedBytes, state: done ? "complete" : "running" };
	});
	emit("downloads-changed", downloads);
}
function keepTicking() {
	if (!ticker) ticker = window.setInterval(tick, 500);
}

function setDownloads(next: NativeDownload[]) {
	downloads = next;
	emit("downloads-changed", downloads);
	keepTicking();
}

/** An address the way the address bar completes it: no scheme, no www., no trailing slash. */
function bare(url: string): string {
	return url
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/\/$/, "");
}

/**
 * What the browser's autocomplete would answer, shaped like the handler's OnResultChanged: a page visited before
 * whose address starts with the words ("youtu" and youtube.com) is the pick for Enter, with the rest of its address
 * as the completion, and the words as typed come second; otherwise the words as typed are the pick. Then the open
 * tab and the history and bookmarks that match. The handler doesn't hear about deletions, so neither does this:
 * the bar stops completing itself.
 */
function suggestionsFor(query: string): NativeSuggestion[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const looksLikeUrl = /^[a-z]+:\/\//i.test(q) || /^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(q);
	const typed: NativeSuggestion = looksLikeUrl
		? { kind: "url", title: "", url: /^[a-z]+:\/\//i.test(q) ? q : `https://${q}` }
		: { kind: "search", title: query.trim(), url: `https://duckduckgo.com/?q=${encodeURIComponent(query.trim())}` };
	const matches = DEMO_HISTORY.filter((s) => s.title.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
	const tab = MUSIC_TAB.title.toLowerCase().includes(q) || MUSIC_TAB.url.includes(q);
	const open: NativeSuggestion[] = tab
		? [{ kind: "tab", title: MUSIC_TAB.title, url: MUSIC_TAB.url, tabId: MUSIC_TAB.id }]
		: [];
	const others = [...open, ...matches.slice(0, 5)];
	// Chrome's has_tab_match: a pick that's open in a tab is a tab suggestion.
	const pick = query === query.trimEnd() ? others.find((s) => bare(s.url).startsWith(q)) : undefined;
	const plain = (s: NativeSuggestion): NativeSuggestion => ({ ...s, default: false, inline: "" });
	if (!pick) return [{ ...typed, default: true, inline: "" }, ...others.map(plain)];
	const first: NativeSuggestion = { ...pick, default: true, inline: bare(pick.url).slice(q.length) };
	return [first, plain(typed), ...others.filter((s) => s !== pick).map(plain)];
}

export const fakeBrowser: Browser = {
	// The prototype keeps its spaces in loka-app (localStorage); nothing here asks the browser for them.
	getSpaces: async () => ({ state: seedState(), links: [] }),
	spacesDo: (seq, intent) => log("spacesDo", seq, intent),
	onSpacesChanged: (listener) => on("spaces-changed", (d) => listener(d as SpacesDelta)),
	onLinksChanged: (listener) => on("links-changed", (l) => listener(l as [string, number][])),
	tabs: async () => tabs(),
	syncTabs: async () => tabs(),
	createTab: async (url, active) => {
		log("createTab", url, active);
		return null;
	},
	activateTab: (id) => log("activateTab", id),
	closeTab: (id) => log("closeTab", id),
	navigateTab: (id, url) => log("navigateTab", id, url),
	goBack: (id) => log("goBack", id),
	goForward: (id) => log("goForward", id),
	reload: (id) => log("reload", id),
	setMuted: (id, next) => {
		log("setMuted", id, next);
		if (id === MUSIC_TAB.id) {
			muted = next;
			emit("tabs-changed", tabs());
		}
	},
	search: (query, newTab) => log("search", query, newTab),
	openPage: (url) => log("openPage", url),
	windowAction: (action) => log("windowAction", action),
	browserCommand: (command) => log("browserCommand", command),
	startWindowDrag: () => log("startWindowDrag"),
	store: async () => store,
	setStore: (key, value) => {
		const { [key]: _old, ...rest } = store;
		store = value === null ? rest : { ...rest, [key]: value };
	},
	onTabsChanged: (listener) => on("tabs-changed", (t) => listener(t as NativeTab[])),
	onStoreChanged: (listener) => on("store-changed", (s) => listener(s as Record<string, string>)),

	extensions: async () => extensions,
	runExtension: (id, anchor) => {
		log("runExtension", id, anchor);
		emit("demo-popup", id, anchor);
	},
	setExtensionPinned: (id, pinned) => {
		log("setExtensionPinned", id, pinned);
		extensions = extensions.map((x) => (x.id === id ? { ...x, pinned } : x));
		// The browser answers a moment later, as the real one does.
		window.setTimeout(() => emit("extensions-changed", extensions), 30);
	},
	extensionAction: (id, action) => {
		log("extensionAction", id, action);
		if (action !== "remove") return;
		// The real browser asks first with Chrome's own dialog; the fake takes the yes, and answers a moment later.
		extensions = extensions.filter((x) => x.id !== id);
		window.setTimeout(() => emit("extensions-changed", extensions), 30);
	},
	onExtensionsChanged: (listener) => on("extensions-changed", (e) => listener(e as NativeExtension[])),

	downloads: async () => {
		keepTicking();
		return downloads;
	},
	downloadAction: (id, action) => {
		log("downloadAction", id, action);
		const now = Date.now();
		const change = (d: NativeDownload): NativeDownload | null => {
			if (d.id !== id) return d;
			if (action === "pause") return { ...d, state: "paused" };
			if (action === "resume") return { ...d, state: "running" };
			if (action === "cancel") return { ...d, state: "cancelled" };
			if (action === "retry") return { ...d, state: "running", receivedBytes: 0, startTime: now };
			if (action === "remove") return null;
			return d;
		};
		setDownloads(downloads.flatMap((d) => change(d) ?? []));
	},
	onDownloadsChanged: (listener) => {
		const stop = on("downloads-changed", (d) => listener(d as NativeDownload[]));
		keepTicking();
		return stop;
	},

	media: async () => media(),
	mediaAction: (tabId, action) => {
		log("mediaAction", tabId, action);
		if (tabId !== MUSIC_TAB.id) return;
		if (action === "play") playing = true;
		else if (action === "pause") playing = false;
		else track = (track + (action === "next" ? 1 : DEMO_PLAYLIST.length - 1)) % DEMO_PLAYLIST.length;
		mediaChanged();
	},
	onMediaChanged: (listener) => on("media-changed", (m) => listener(m as NativeMedia[])),

	suggest: (query) => {
		log("suggest", query);
		// The real autocomplete answers a beat after each keystroke.
		window.setTimeout(() => emit("suggestions", query, suggestionsFor(query)), 40);
	},
	onSuggestions: (listener) => on("suggestions", (q, s) => listener(q as string, s as NativeSuggestion[])),

	setSidebarPinned: (pinned) => {
		log("setSidebarPinned", pinned);
		localStorage.setItem(PINNED_KEY, String(pinned));
		emit("sidebar-pinned-changed", pinned);
	},
	sidebarPinned: async () => localStorage.getItem(PINNED_KEY) !== "false",
	takeBrowserBookmarks: async () => "",
	setAutoplay: (mode) => {
		log("setAutoplay", mode);
		autoplay = mode;
	},
	autoplay: async () => autoplay,
	holdSidebar: (held) => log("holdSidebar", held),
	setThemeColor: (color) => log("setThemeColor", color),
	setColorScheme: (next) => {
		log("setColorScheme", next);
		scheme = next;
	},
	onCommand: (listener) => on("command", (c) => listener(c as BrowserCommand)),

	onSidebarPinnedChanged: (listener) => on("sidebar-pinned-changed", (p) => listener(p as boolean)),
	// The prototype's window is the browser here: it shows the bar centered over everything, as the floating one is.
	openCommandBar: (command) => {
		log("openCommandBar", command);
		emit("command", command);
	},
	closeCommandBar: () => log("closeCommandBar"),
	commandPicked: (pick) => {
		log("commandPicked", pick);
		emit("command-picked", pick);
	},
	onCommandPicked: (listener) => on("command-picked", (p) => listener(p as CommandPick)),
	// The prototype draws menus in the sidebar itself; it has no menu window.
	showMenu: (menu, x, y) => log("showMenu", menu, x, y),
	onMenuPicked: (listener) => on("menu-picked", (p) => listener(p as number[])),
	onMenuClosed: (listener) => on("menu-closed", () => listener()),
	onMenuShow: (listener) => on("menu-show", (m) => listener(m as ShownMenu)),
	menuReady: (width, height) => log("menuReady", width, height),
	menuPicked: (path) => log("menuPicked", path),
	closeMenu: () => log("closeMenu"),
};

/** The prototype draws a stand-in popup where an extension's real one would open. */
export function onDemoPopup(
	listener: (id: string, anchor: { x: number; y: number; width: number; height: number }) => void,
) {
	return on("demo-popup", (id, anchor) =>
		listener(id as string, anchor as { x: number; y: number; width: number; height: number }),
	);
}

/** The browser pressing one of its shortcuts (Ctrl+T, Ctrl+L), which it hands to the sidebar. */
export function pressBrowserShortcut(command: BrowserCommand) {
	log("shortcut", command);
	emit("command", command);
}

/** The scheme the sidebar last asked the browser for, which the prototype's stand-in pages follow. */
export function demoScheme(): ColorScheme {
	return scheme;
}

declare global {
	interface Window {
		lokaDemo: { calls: DemoCall[]; command: (command: BrowserCommand) => void };
	}
}
window.lokaDemo = { calls, command: pressBrowserShortcut };
