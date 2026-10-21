// Which spaces' lists the sidebar keeps built, and whether a change moved any row. Both keep a space switch and a
// background change (a title, a page loading) from costing work in proportion to the number of rows.

import { activeSpace, type BrowserState, pinnedRows } from "./sidebar.logic";

/**
 * The spaces whose lists stay built: the active one and the one shown before it, which is where a switch most often
 * goes (back and forth between two spaces). In the spaces' own order, so a switch never moves a list in the page.
 * One list more, not every space's: a list is ~35 elements a row, and three lists of a heavy profile's 300 tabs
 * would pass the sidebar's 10,000-node budget (scripts/verify-perf.mjs).
 */
export function builtSpaceIds(state: BrowserState, lastSpaceId: string | null): string[] {
	return state.spaces.map((s) => s.id).filter((id) => id === state.activeSpaceId || id === lastSpaceId);
}

/** The rows on screen in order, each with its depth, then the Essentials: what decides where every row sits. */
function rowLayout(state: BrowserState): string[] {
	const space = activeSpace(state);
	return [
		...pinnedRows(space.pinned).map((row) => `${row.node.id}:${row.depth}`),
		"|open",
		...space.open,
		"|essentials",
		...state.essentials,
	];
}

/**
 * Whether going from `before` to `after` in the same space moves, adds or removes a row or an Essential: only then
 * do rows need measuring to slide them to their new places. A new title, the active tab or a page loading moves
 * nothing.
 */
export function rowsMoved(before: BrowserState, after: BrowserState): boolean {
	if (before.spaces === after.spaces && before.essentials === after.essentials) return false;
	const was = rowLayout(before);
	const now = rowLayout(after);
	return was.length !== now.length || was.some((key, i) => key !== now[i]);
}
