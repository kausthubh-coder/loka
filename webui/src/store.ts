// Loka's data in the browser. The spaces and settings live in the profile (the "loka.store" pref), shared by every
// window's sidebar; each sidebar listens for changes and redraws. Which browser tab is which Loka tab, which tab
// group is which space and what's playing are this window's own, so they live in this page.

import { DEFAULT_UI, parseUiPrefs, type UiPrefs } from "../../prototype/src/app/ui-prefs.logic";
import type { Media } from "../../prototype/src/features/media/loka-media-card";
import { type BrowserState, importState } from "../../prototype/src/features/sidebar/sidebar.logic";
import { firstState, type LiveMap } from "../../extension/src/live.logic";
import { browser } from "./bridge";

export const STATE_KEY = "state.v1";
export const UI_KEY = "ui.v1";

export type Groups = Record<string, { id: number; collapsed: boolean }>;

let store: Record<string, string> = {};
let loaded: Promise<void> | null = null;
type Change = { state?: BrowserState; ui?: UiPrefs; media?: Media | null; foreign?: boolean };
const listeners = new Set<(what: Change) => void>();
/** Values this page wrote that the browser hasn't echoed back yet, so an echo isn't taken for another window's. */
const echoes = new Set<string>();

function notify(what: Change) {
	for (const listener of listeners) listener(what);
}

function load(): Promise<void> {
	loaded ??= browser.store().then((s) => {
		store = s ?? {};
	});
	return loaded;
}

export async function readState(): Promise<BrowserState> {
	await load();
	const saved = store[STATE_KEY];
	return (typeof saved === "string" && importState(saved)) || firstState();
}

/** Saves the spaces; returns the exact text written, so the writer can tell its own change from someone else's. */
export async function writeState(state: BrowserState): Promise<string> {
	await load();
	const json = JSON.stringify(state);
	if (store[STATE_KEY] === json) return json;
	store = { ...store, [STATE_KEY]: json };
	echoes.add(json);
	browser.setStore(STATE_KEY, json);
	notify({ state });
	return json;
}

export async function readUi(): Promise<UiPrefs> {
	await load();
	const saved = store[UI_KEY];
	return typeof saved === "string" ? parseUiPrefs(saved) : DEFAULT_UI;
}

export async function writeUi(ui: UiPrefs) {
	await load();
	const json = JSON.stringify(ui);
	store = { ...store, [UI_KEY]: json };
	echoes.add(json);
	browser.setStore(UI_KEY, json);
	notify({ ui });
}

let session: { live: LiveMap; groups: Groups; media: Media | null } = { live: {}, groups: {}, media: null };

export async function readSession() {
	return session;
}

export async function writeSession(values: Partial<{ live: LiveMap; groups: Groups; media: Media | null }>) {
	session = { ...session, ...values };
	if ("media" in values) notify({ media: session.media });
}

/**
 * Calls back with the new spaces, prefs or media whenever this page or another window's sidebar changes them.
 * `foreign` marks a change another window made.
 */
export function watch(changed: (what: Change) => void) {
	listeners.add(changed);
}

browser.onStoreChanged((next) => {
	for (const key of [STATE_KEY, UI_KEY]) {
		const value = next?.[key];
		if (value === undefined || value === store[key]) continue;
		if (echoes.delete(value)) continue;
		store = { ...store, [key]: value };
		if (key === STATE_KEY) {
			const parsed = importState(value);
			if (parsed) notify({ state: parsed, foreign: true });
		} else notify({ ui: parseUiPrefs(value), foreign: true });
	}
});

/** Favicons: a loaded tab's own icon when one of this window's tabs shows the page, else the browser's cache. */
let liveIcons = new Map<string, string>();
const iconListeners = new Set<() => void>();

/** Keeps each loaded page's icon; tells the sidebar to redraw when one arrives or changes. */
export function rememberIcons(tabs: { url: string; favicon: string }[]) {
	const next = new Map(tabs.filter((t) => t.favicon).map((t) => [t.url, t.favicon]));
	const changed = next.size !== liveIcons.size || [...next].some(([url, icon]) => liveIcons.get(url) !== icon);
	liveIcons = next;
	if (changed) for (const listener of iconListeners) listener();
}

export function onIconsChanged(listener: () => void) {
	iconListeners.add(listener);
}

export function faviconUrl(pageUrl: string): string {
	const live = liveIcons.get(pageUrl);
	if (live) return live;
	const url = new URL("chrome://favicon2/");
	url.searchParams.set("size", "32");
	url.searchParams.set("scaleFactor", `${window.devicePixelRatio}x`);
	url.searchParams.set("pageUrl", pageUrl);
	url.searchParams.set("allowGoogleServerFallback", "0");
	return url.toString();
}
