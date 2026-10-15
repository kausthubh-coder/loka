// Window preferences that aren't part of the spaces data: they don't travel with an export.

export interface UiPrefs {
	sidebarWidth: number;
	sidebarSide: "left" | "right";
	/** Hidden sidebar: it slides in over the page when the pointer reaches the window edge. */
	sidebarHidden: boolean;
	onboarded: boolean;
	/** Archive open tabs not shown for this many hours. Null (the default) never archives. */
	archiveAfterHours: number | null;
}

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 420;
export const DEFAULT_UI: UiPrefs = {
	sidebarWidth: 272,
	sidebarSide: "left",
	sidebarHidden: false,
	onboarded: false,
	archiveAfterHours: null,
};

export function clampWidth(width: number): number {
	return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));
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
		sidebarHidden: d.sidebarHidden === true,
		onboarded: d.onboarded === true,
		archiveAfterHours: typeof d.archiveAfterHours === "number" && d.archiveAfterHours > 0 ? d.archiveAfterHours : null,
	};
}
