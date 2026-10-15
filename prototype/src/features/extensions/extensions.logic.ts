import type { NativeExtension } from "../../../../webui/src/bridge";

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

/** A badge as Chrome draws it: at most four characters. */
export function badgeText(badge: string): string {
	return badge.trim().slice(0, 4);
}
