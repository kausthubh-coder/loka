// Loka's data in the browser. The spaces belong to the browser (LokaSpacesService in C++), which saves them and keeps
// every window's tabs in step; a page asks for them once (getSpaces) and then hears only what changed
// ("spaces-changed"). A change this page makes is an intent: the page applies it to its own copy at once, so it paints
// in the same frame, and sends it; the browser applies the same rule and answers with the change and the intent's
// number (`ack`). Until then the page shows the browser's spaces with its own waiting intents on top, so a change from
// elsewhere in between is never lost. Settings (ui.v1) and what setup saved stay in the profile's "loka.store" pref.

import { DEFAULT_UI, parseUiPrefs, type UiPrefs } from "../../prototype/src/app/ui-prefs.logic";
import { applyIntent, type Intent } from "../../prototype/src/features/sidebar/intents.logic";
import type { BrowserState, TabId } from "../../prototype/src/features/sidebar/sidebar.logic";
import { applyDelta, type SpacesDelta, same } from "../../prototype/src/features/sidebar/spaces-delta.logic";
import type { LiveMap } from "../../prototype/src/features/tabs/live.logic";
import { browser } from "./bridge";

export const UI_KEY = "ui.v1";
/** What setup saved (the browser adds it to the store, read-only), and the value the sidebar last applied. */
const ONBOARDING_KEY = "onboarding";
const APPLIED_KEY = "onboarding.applied";

let store: Record<string, string> = {};
let loaded: Promise<void> | null = null;
type Change = { state?: BrowserState; ui?: UiPrefs; onboarding?: boolean; foreign?: boolean };
const listeners = new Set<(what: Change) => void>();

function notify(what: Change) {
	for (const listener of listeners) listener(what);
}

function load(): Promise<void> {
	loaded ??= browser.store().then((s) => {
		store = s ?? {};
	});
	return loaded;
}

/** The spaces as the browser last said, the intents this page sent since, and what that makes. */
let confirmed: BrowserState | null = null;
let waiting: { seq: number; intent: Intent }[] = [];
let shown: BrowserState | null = null;
let nextSeq = 1;
let spaces: Promise<BrowserState> | null = null;
let links: LiveMap = {};

function loadSpaces(): Promise<BrowserState> {
	spaces ??= browser.getSpaces().then(({ state, links: pairs }) => {
		confirmed = state;
		shown = state;
		links = Object.fromEntries(pairs);
		return state;
	});
	return spaces;
}

export async function readState(): Promise<BrowserState> {
	await loadSpaces();
	return shown ?? (await loadSpaces());
}

/**
 * Changes the spaces: at once here, then in the browser. Returns the spaces as this page now shows them (the caller
 * draws them; watchers aren't told), or null before they've loaded.
 */
export function act(intent: Intent): BrowserState | null {
	if (!shown) return null;
	const seq = nextSeq++;
	waiting.push({ seq, intent });
	shown = applyIntent(shown, intent);
	browser.spacesDo(seq, intent);
	return shown;
}

browser.onSpacesChanged((delta: SpacesDelta & { ack?: number }) => {
	if (!confirmed) return;
	confirmed = applyDelta(confirmed, delta);
	const { ack } = delta;
	if (ack !== undefined) waiting = waiting.filter((w) => w.seq > ack);
	const next = waiting.reduce((s, w) => applyIntent(s, w.intent), confirmed);
	// Usually the browser confirms what this page already shows: keep it, so no row redraws.
	if (shown && same(next, shown)) return;
	shown = next;
	// Something this page didn't draw itself: another window's change, the browser's own (a tab opened from a page),
	// or the browser refusing one of this page's intents.
	notify({ state: next, foreign: true });
});

/** Which browser tab shows each loaded Loka tab in this window. Empty outside a window's sidebar. */
export function linkedTabs(): LiveMap {
	return links;
}

/** The browser tab showing a Loka tab right now, if it's loaded. */
export function browserTabOf(lokaTabId: TabId): number | undefined {
	return links[lokaTabId];
}

const linkListeners = new Set<() => void>();

/** Calls back when the links between Loka tabs and browser tabs change. */
export function onLinksChanged(listener: () => void) {
	linkListeners.add(listener);
}

browser.onLinksChanged((pairs) => {
	links = Object.fromEntries(pairs);
	for (const listener of linkListeners) listener();
});

export async function readUi(): Promise<UiPrefs> {
	await load();
	const saved = store[UI_KEY];
	return typeof saved === "string" ? parseUiPrefs(saved) : DEFAULT_UI;
}

export async function writeUi(ui: UiPrefs) {
	await load();
	const json = JSON.stringify(ui);
	store = { ...store, [UI_KEY]: json };
	browser.setStore(UI_KEY, json);
	notify({ ui });
}

/**
 * Calls back with the new spaces or prefs whenever this page or another window changes them. `foreign` marks a
 * change this page didn't make.
 */
export function watch(changed: (what: Change) => void) {
	listeners.add(changed);
}

/** Setup's spaces if the sidebar hasn't applied them yet. */
export async function pendingOnboarding(): Promise<string | null> {
	await load();
	const value = store[ONBOARDING_KEY];
	return value && value !== store[APPLIED_KEY] ? value : null;
}

export function markOnboardingApplied(value: string) {
	store = { ...store, [APPLIED_KEY]: value };
	browser.setStore(APPLIED_KEY, value);
}

browser.onStoreChanged((next) => {
	if (next?.[ONBOARDING_KEY] !== undefined && next[ONBOARDING_KEY] !== store[ONBOARDING_KEY]) {
		store = { ...store, [ONBOARDING_KEY]: next[ONBOARDING_KEY] };
		notify({ onboarding: true });
	}
	const value = next?.[UI_KEY];
	if (value === undefined || value === store[UI_KEY]) return;
	store = { ...store, [UI_KEY]: value };
	notify({ ui: parseUiPrefs(value), foreign: true });
});
