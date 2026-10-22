// What changed between two versions of the spaces, as the browser sends it to the sidebar ("spaces-changed"): only
// the tabs and spaces that changed, so a title change is one tab, not the whole list. Its C++ twin is
// components/loka/core/spaces_delta.cc; the shared cases hold the two to the same output. applyDelta keeps every
// unchanged tab and space as the same object, so the sidebar redraws only the rows that changed.

import type { ArchivedTab, BrowserState, Space, Tab, TabId } from "./sidebar.logic";

export interface SpacesDelta {
	/** Changed or new tabs; null for a tab that's gone. */
	tabs?: Record<TabId, Tab | null>;
	essentials?: TabId[];
	/** Changed or new spaces, whole. */
	spaces?: Space[];
	/** Every space's id in order, when one came, went or moved. */
	spaceOrder?: string[];
	activeSpaceId?: string;
	archive?: ArchivedTab[];
}

/** Equal as JSON, whatever order the keys came in. Unchanged parts are usually the same object, which is quick. */
export function same(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const ak = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
	const bk = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
	return (
		ak.length === bk.length &&
		ak.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
	);
}

export function toDelta(before: BrowserState, after: BrowserState): SpacesDelta {
	const delta: SpacesDelta = {};
	const tabs: Record<TabId, Tab | null> = {};
	for (const [id, tab] of Object.entries(after.tabs)) {
		if (!same(before.tabs[id], tab)) tabs[id] = tab;
	}
	for (const id of Object.keys(before.tabs)) {
		if (!(id in after.tabs)) tabs[id] = null;
	}
	if (Object.keys(tabs).length) delta.tabs = tabs;
	if (!same(before.essentials, after.essentials)) delta.essentials = after.essentials;
	const old = new Map(before.spaces.map((s) => [s.id, s]));
	const spaces = after.spaces.filter((s) => !same(old.get(s.id), s));
	if (spaces.length) delta.spaces = spaces;
	const order = after.spaces.map((s) => s.id);
	if (
		!same(
			order,
			before.spaces.map((s) => s.id),
		)
	)
		delta.spaceOrder = order;
	if (before.activeSpaceId !== after.activeSpaceId) delta.activeSpaceId = after.activeSpaceId;
	if (!same(before.archive, after.archive)) delta.archive = after.archive;
	return delta;
}

export function applyDelta(state: BrowserState, delta: SpacesDelta): BrowserState {
	let tabs = state.tabs;
	if (delta.tabs) {
		tabs = { ...tabs };
		for (const [id, tab] of Object.entries(delta.tabs)) {
			if (tab) tabs[id] = tab;
			else delete tabs[id];
		}
	}
	let spaces = state.spaces;
	if (delta.spaces || delta.spaceOrder) {
		const byId = new Map(state.spaces.map((s) => [s.id, s]));
		for (const space of delta.spaces ?? []) byId.set(space.id, space);
		const order = delta.spaceOrder ?? state.spaces.map((s) => s.id);
		spaces = order.flatMap((id) => {
			const space = byId.get(id);
			return space ? [space] : [];
		});
	}
	return {
		...state,
		tabs,
		essentials: delta.essentials ?? state.essentials,
		spaces,
		activeSpaceId: delta.activeSpaceId ?? state.activeSpaceId,
		archive: delta.archive ?? state.archive,
	};
}
