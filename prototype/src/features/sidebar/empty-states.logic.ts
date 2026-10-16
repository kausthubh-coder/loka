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
