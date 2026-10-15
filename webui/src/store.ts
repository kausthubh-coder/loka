// Loka's data in the browser. The spaces and settings live in the profile (the "loka.store" pref), shared by every
// window's sidebar; each sidebar listens for changes and redraws. Which browser tab is which Loka tab and which tab
// group is which space are this window's own, so they live in this page.

import { DEFAULT_UI, parseUiPrefs, type UiPrefs } from "../../prototype/src/app/ui-prefs.logic";
import { type BrowserState, importState } from "../../prototype/src/features/sidebar/sidebar.logic";
import { browser } from "./bridge";
import { firstState, type GroupRecord, type LiveMap } from "./live.logic";

export const STATE_KEY = "state.v1";
export const UI_KEY = "ui.v1";
/** What setup saved (the browser adds it to the store, read-only), and the value the sidebar last applied. */
const ONBOARDING_KEY = "onboarding";
const APPLIED_KEY = "onboarding.applied";

export type Groups = Record<string, GroupRecord>;

let store: Record<string, string> = {};
let loaded: Promise<void> | null = null;
type Change = { state?: BrowserState; ui?: UiPrefs; onboarding?: boolean; foreign?: boolean };
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

let session: { live: LiveMap; groups: Groups } = { live: {}, groups: {} };

const linkListeners = new Set<() => void>();

export async function writeSession(values: Partial<{ live: LiveMap; groups: Groups }>) {
	const linksChanged = values.live !== undefined && values.live !== session.live;
	session = { ...session, ...values };
	if (linksChanged) for (const listener of linkListeners) listener();
}

/** Calls back when the links between Loka tabs and browser tabs change. */
export function onLinksChanged(listener: () => void) {
	linkListeners.add(listener);
}

/**
 * Calls back with the new spaces or prefs whenever this page or another window's sidebar changes them.
 * `foreign` marks a change another window made.
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
	echoes.add(value);
	browser.setStore(APPLIED_KEY, value);
}

browser.onStoreChanged((next) => {
	if (next?.[ONBOARDING_KEY] !== undefined && next[ONBOARDING_KEY] !== store[ONBOARDING_KEY]) {
		store = { ...store, [ONBOARDING_KEY]: next[ONBOARDING_KEY] };
		notify({ onboarding: true });
	}
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

/** An unloaded page's icon, from the browser's favicon cache. A loaded tab's own icon comes with its tab data. */
export function faviconUrl(pageUrl: string): string {
	const url = new URL("chrome://favicon2/");
	url.searchParams.set("size", "32");
	url.searchParams.set("scaleFactor", `${window.devicePixelRatio}x`);
	url.searchParams.set("pageUrl", pageUrl);
	url.searchParams.set("allowGoogleServerFallback", "0");
	return url.toString();
}
