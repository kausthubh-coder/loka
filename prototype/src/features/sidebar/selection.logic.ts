// Picking several rows: Ctrl+click (Cmd on a Mac) adds or takes one, Shift+click or Shift+arrow takes the run from
// the last one picked. A selection is the sidebar's own state, never saved with the spaces, and holds tabs only: a
// run across the pinned tree passes over its folders. A run (Shift) stays in one list, the pinned tree or the open
// tabs, and replaces the selection; Ctrl+click can pick from both, and the menu acts on each list's picks.

import { activeSpace, type BrowserState, ESSENTIALS_LIMIT, pinnedRows, type TabId } from "./sidebar.logic";

export interface Selection {
	/** The picked tabs, in the order they were picked. */
	ids: TabId[];
	/** Where the next Shift+click or Shift+arrow counts from: the row last clicked or reached. */
	anchor: string | null;
}

export const NO_SELECTION: Selection = { ids: [], anchor: null };

/** The rows a selection can come from, in the order the sidebar shows them: visible pinned rows (folders too), then open tabs. */
export function selectableLists(state: BrowserState): [string[], string[]] {
	const space = activeSpace(state);
	return [pinnedRows(space.pinned).map((r) => r.node.id), space.open];
}

const listOf = (lists: string[][], id: string | null) => (id === null ? undefined : lists.find((l) => l.includes(id)));

/** Ctrl+click: a tab joins the selection, or leaves it if it was in it. Either way the next run counts from it. */
export function toggleSelected(selection: Selection, id: TabId): Selection {
	const ids = selection.ids.includes(id) ? selection.ids.filter((x) => x !== id) : [...selection.ids, id];
	return { ids, anchor: id };
}

/**
 * Shift+click or Shift+arrow: the tabs from the anchor to `to`, in `to`'s list. With nothing picked, or no anchor in
 * that list, it counts from `from` (the tab shown, for a click; the focused row, for a key), and failing that from
 * `to` itself.
 */
export function selectRange(
	selection: Selection,
	lists: string[][],
	isTab: (id: string) => boolean,
	to: string,
	from: string | null,
): Selection {
	const list = listOf(lists, to);
	if (!list) return selection;
	const candidates = selection.ids.length ? [selection.anchor, from] : [from];
	const anchor = candidates.find((id) => id !== null && list.includes(id)) ?? to;
	const a = list.indexOf(anchor);
	const b = list.indexOf(to);
	return { ids: list.slice(Math.min(a, b), Math.max(a, b) + 1).filter(isTab), anchor };
}

/** The row next to `id` in its own list (1 below, -1 above), or null at the list's end: Shift+arrow stays in one list. */
export function stepWithin(lists: string[][], id: string, step: 1 | -1): string | null {
	const list = listOf(lists, id);
	if (!list) return null;
	return list[list.indexOf(id) + step] ?? null;
}

/**
 * The selection after the spaces changed: only tabs still showing stay picked (a closed tab, one moved to another
 * space or hidden in a closed folder leaves it). The same object when nothing left, so nothing redraws.
 */
export function pruneSelection(selection: Selection, lists: string[][]): Selection {
	const shown = new Set(lists.flat());
	const ids = selection.ids.filter((id) => shown.has(id));
	const anchor = selection.anchor !== null && shown.has(selection.anchor) ? selection.anchor : null;
	if (ids.length === selection.ids.length && anchor === selection.anchor) return selection;
	return { ids, anchor };
}

/** The picked tabs in the order the sidebar shows them, which is the order a menu action moves them in. */
export function inSidebarOrder(selection: Selection, lists: string[][]): TabId[] {
	const picked = new Set(selection.ids);
	return lists.flat().filter((id) => picked.has(id));
}

/** What to say after asking for `asked` tabs to join Essentials when `added` did, or null when they all fit. */
export function essentialsNotice(asked: number, added: number): string | null {
	if (added >= asked) return null;
	if (added === 0) return `Essentials have room for ${ESSENTIALS_LIMIT}. Remove one first.`;
	const left = asked - added;
	return `Added ${added}. Essentials have room for ${ESSENTIALS_LIMIT}, so ${left} ${left === 1 ? "tab" : "tabs"} didn't fit.`;
}
