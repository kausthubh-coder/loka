// Window preferences that aren't part of the spaces data: they don't travel with an export.

export interface UiPrefs {
	sidebarWidth: number;
	sidebarSide: "left" | "right";
	onboarded: boolean;
	/** Archive open tabs not shown for this many hours: 12 unless changed; 0 never archives. */
	archiveAfterHours: number;
	/**
	 * Unload the loaded tabs of spaces no window is showing once they've been out of sight this many minutes: 30 unless
	 * changed; 0 never. The browser reads it from here (LokaTabSleeper) and does the unloading.
	 */
	sleepAfterMinutes: number;
	/** Interface sounds: on unless turned off, at a quiet volume from 0 to 1. */
	sound: boolean;
	soundVolume: number;
	/**
	 * Media autoplay for pages: blocked until a click (the default), sound blocked only, or allowed. The browser keeps
	 * the real setting (the loka.autoplay pref); this copy is what Settings shows without asking the browser.
	 */
	autoplay: Autoplay;
}

export type Autoplay = "block" | "block-audible" | "allow";
export const AUTOPLAY_MODES: Autoplay[] = ["block", "block-audible", "allow"];

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 420;
export const DEFAULT_UI: UiPrefs = {
	sidebarWidth: 300,
	sidebarSide: "left",
	onboarded: false,
	archiveAfterHours: 12,
	sleepAfterMinutes: 30,
	sound: true,
	soundVolume: 0.5,
	autoplay: "block",
};

export function clampWidth(width: number): number {
	return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));
}

function atLeastZero(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Reads saved prefs, keeping each valid field and falling back to the default for the rest. */
export function parseUiPrefs(json: string | null): UiPrefs {
	let data: unknown = null;
	try {
		data = json ? JSON.parse(json) : null;
	} catch {}
	if (typeof data !== "object" || data === null) return DEFAULT_UI;
	const d = data as Record<string, unknown>;
	return {
		sidebarWidth: typeof d.sidebarWidth === "number" ? clampWidth(d.sidebarWidth) : DEFAULT_UI.sidebarWidth,
		sidebarSide: d.sidebarSide === "right" ? "right" : "left",
		onboarded: d.onboarded === true,
		// Before archiving was on by default, off was saved as null, which now reads as the default.
		archiveAfterHours: atLeastZero(d.archiveAfterHours) ?? DEFAULT_UI.archiveAfterHours,
		sleepAfterMinutes: atLeastZero(d.sleepAfterMinutes) ?? DEFAULT_UI.sleepAfterMinutes,
		sound: d.sound !== false,
		soundVolume:
			typeof d.soundVolume === "number" && Number.isFinite(d.soundVolume)
				? Math.min(1, Math.max(0, d.soundVolume))
				: DEFAULT_UI.soundVolume,
		autoplay: AUTOPLAY_MODES.find((m) => m === d.autoplay) ?? DEFAULT_UI.autoplay,
	};
}
