import type { BrowserState, Space } from "./sidebar.logic";

/**
 * How many empty slots Essentials shows to drop into. With none yet, Essentials takes no room at all until a tab is
 * being dragged, and then opens three slots the size of real tiles. With some, an unfinished row gets one free cell
 * while dragging; a full row takes drops on its own tiles' edges.
 */
export function essentialsDropSlots(count: number, draggingTab: boolean): number {
	if (!draggingTab) return 0;
	if (count === 0) return 3;
	return count % 4 === 0 ? 0 : 1;
}

/**
 * The one-time hint about Essentials: only while there are none, only until it's dismissed, and only in a space with
 * enough open tabs (three) that keeping one everywhere is worth saying.
 */
export function showEssentialsHint(state: BrowserState, dismissed: boolean): boolean {
	if (dismissed || state.essentials.length > 0) return false;
	const space = state.spaces.find((s) => s.id === state.activeSpaceId);
	return (space?.open.length ?? 0) >= 3;
}

/** The quiet "pin tabs here" row: only in a space with nothing pinned, not even a folder. */
export function showPinnedHint(space: Space): boolean {
	return space.pinned.length === 0;
}
