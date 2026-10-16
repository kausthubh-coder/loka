// Where a drag lands and how the list scrolls under it: the rules behind dragging rows, folders and tiles.

export type DropMode = "before" | "after" | "into";

/**
 * Where a drop at `ratio` across a target (0 its top or left edge, 1 its bottom or right) lands. The middle of a
 * folder puts the item inside it; the middle of a tab, when a tab is dragged onto it, makes a folder of the two
 * (`grouping`). Anywhere else it goes before or after the target, by which half the pointer is in.
 */
export function dropModeAt(
	ratio: number,
	into: "folder" | "tab" | null | undefined,
	draggingTab: boolean,
): { mode: DropMode; grouping: boolean } {
	const grouping = into === "tab" && draggingTab && ratio > 0.3 && ratio < 0.7;
	if ((into === "folder" && ratio > 0.25 && ratio < 0.75) || grouping) return { mode: "into", grouping };
	return { mode: ratio < 0.5 ? "before" : "after", grouping: false };
}

/** How near the list's edge (px) a drag starts scrolling it, and the most it scrolls in a frame. */
const SCROLL_EDGE = 36;
const SCROLL_MAX = 16;

/** How far the list scrolls this frame with the pointer at `y`: towards an edge it's near, faster the closer. */
export function autoScrollStep(y: number, top: number, bottom: number): number {
	const step =
		y < top + SCROLL_EDGE
			? -(top + SCROLL_EDGE - y) / 3
			: y > bottom - SCROLL_EDGE
				? (y - (bottom - SCROLL_EDGE)) / 3
				: 0;
	return Math.max(-SCROLL_MAX, Math.min(SCROLL_MAX, step));
}
