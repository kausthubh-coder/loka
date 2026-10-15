// Loka's data in the browser. The spaces live in chrome.storage.local, so every Loka page (sidebar, new tab page,
// settings, tour) and the background worker share one copy; each listens for changes and redraws.
// Runtime-only links (which browser tab is which Loka tab, which tab group is which space, what's playing) live in
// chrome.storage.session: they mean nothing after the browser restarts.

import { DEFAULT_UI, parseUiPrefs, type UiPrefs } from "../../prototype/src/app/ui-prefs.logic";
import type { Media } from "../../prototype/src/features/media/loka-media-card";
import { type BrowserState, importState } from "../../prototype/src/features/sidebar/sidebar.logic";
import { firstState, type LiveMap } from "../../prototype/src/features/tabs/live.logic";

export const STATE_KEY = "loka.state.v1";
export const UI_KEY = "loka.ui.v1";
export const LIVE_KEY = "loka.live";
export const GROUPS_KEY = "loka.groups";
export const MEDIA_KEY = "loka.media";

export type Groups = Record<string, { id: number; collapsed: boolean }>;

export async function readState(): Promise<BrowserState> {
	const saved = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
	return (typeof saved === "string" && importState(saved)) || firstState();
}

/** Saves the spaces; returns the exact text written, so the writer can tell its own change from someone else's. */
export async function writeState(state: BrowserState): Promise<string> {
	const json = JSON.stringify(state);
	await chrome.storage.local.set({ [STATE_KEY]: json });
	return json;
}

export async function readUi(): Promise<UiPrefs> {
	const saved = (await chrome.storage.local.get(UI_KEY))[UI_KEY];
	return typeof saved === "string" ? parseUiPrefs(saved) : DEFAULT_UI;
}

export async function writeUi(ui: UiPrefs) {
	await chrome.storage.local.set({ [UI_KEY]: JSON.stringify(ui) });
}

export async function readSession(): Promise<{ live: LiveMap; groups: Groups; media: Media | null }> {
	const got = await chrome.storage.session.get([LIVE_KEY, GROUPS_KEY, MEDIA_KEY]);
	return {
		live: (got[LIVE_KEY] as LiveMap | undefined) ?? {},
		groups: (got[GROUPS_KEY] as Groups | undefined) ?? {},
		media: (got[MEDIA_KEY] as Media | null | undefined) ?? null,
	};
}

export async function writeSession(values: Partial<{ live: LiveMap; groups: Groups; media: Media | null }>) {
	const out: Record<string, unknown> = {};
	if (values.live) out[LIVE_KEY] = values.live;
	if (values.groups) out[GROUPS_KEY] = values.groups;
	if ("media" in values) out[MEDIA_KEY] = values.media;
	await chrome.storage.session.set(out);
}

/** Calls back with the new spaces, prefs or media whenever any Loka page or the background changes them. */
export function watch(changed: (what: { state?: BrowserState; ui?: UiPrefs; media?: Media | null }) => void) {
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && changes[STATE_KEY]) {
			const state = importState(String(changes[STATE_KEY].newValue));
			if (state) changed({ state });
		}
		if (area === "local" && changes[UI_KEY]) changed({ ui: parseUiPrefs(String(changes[UI_KEY].newValue)) });
		if (area === "session" && changes[MEDIA_KEY]) changed({ media: (changes[MEDIA_KEY].newValue as Media) ?? null });
	});
}

/** The site's icon from the browser's own favicon cache (the "favicon" permission), so pages load no images. */
export function faviconUrl(pageUrl: string): string {
	const url = new URL(chrome.runtime.getURL("/_favicon/"));
	url.searchParams.set("pageUrl", pageUrl);
	url.searchParams.set("size", "32");
	return url.toString();
}
