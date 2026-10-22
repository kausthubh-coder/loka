import type { NativeExtension } from "../../../../webui/src/bridge";
import { contrast, parseRgb } from "../../app/theme.logic";

/** How many pinned extensions fit in the toolbar beside its own buttons; the rest stay in the Extensions panel. */
export const TOOLBAR_EXTENSIONS = 3;

/** The pinned extensions the toolbar shows, in the browser's order. */
export function toolbarExtensions(list: NativeExtension[] | null): NativeExtension[] {
	return (list ?? []).filter((x) => x.pinned).slice(0, TOOLBAR_EXTENSIONS);
}

/** The list as it will be once the browser has pinned or unpinned one, shown before it answers. */
export function withPinned(list: NativeExtension[], id: string, pinned: boolean): NativeExtension[] {
	return list.map((x) => (x.id === id ? { ...x, pinned } : x));
}

export type ExtensionMenuAction = "pin" | "unpin" | "options" | "manage" | "remove";

/**
 * An extension's right-click menu, as Chrome's and Arc's have it: pin or unpin, its options page when it has one,
 * its page in chrome://extensions, and removing it last.
 */
export function extensionMenuItems(x: NativeExtension): { action: ExtensionMenuAction; label: string }[] {
	return [
		x.pinned ? { action: "unpin", label: "Unpin from address bar" } : { action: "pin", label: "Pin to address bar" },
		...(x.hasOptions ? [{ action: "options" as const, label: "Options" }] : []),
		{ action: "manage", label: "Manage extension" },
		{ action: "remove", label: "Remove from Loka…" },
	];
}

/** Chrome's badge color when the extension sets none. */
const BADGE_DEFAULT = "#5f6368";

/** The badge's background: the extension's own color, or Chrome's grey. */
export function badgeBackground(color: string): string {
	return color || BADGE_DEFAULT;
}

/**
 * The badge's text: white, unless black stands out more on the extension's color (GitHub's green is 3.2:1 under
 * white and 6.5:1 under black). One of the two always reaches 4.5:1.
 */
export function badgeInk(background: string): "#fff" | "#000" {
	const rgb = parseRgb(background);
	if (!rgb) return "#fff";
	return contrast(rgb, [255, 255, 255]) >= contrast(rgb, [0, 0, 0]) ? "#fff" : "#000";
}

/** A badge as Chrome draws it: at most four characters. */
export function badgeText(badge: string): string {
	return badge.trim().slice(0, 4);
}
