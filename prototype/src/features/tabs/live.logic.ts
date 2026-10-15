// Keeps Loka's model and the browser's real tabs in step. Pure functions only, so both directions are tested:
//   browser -> Loka: a tab opened, closed, changed or picked in the browser updates the spaces
//   Loka -> browser: planReconcile lists what the browser must do so its tabs match the spaces
// The Loka model says where every tab belongs. A tab can be "live" (a real browser tab) or not (a pinned tab or
// Essential that isn't loaded). `LiveMap` links the two: Loka tab id -> browser tab id.

import {
	activateTab,
	activeSpace,
	type BrowserState,
	closeTab,
	newId,
	type PinnedNode,
	type Space,
	switchSpace,
	type TabId,
} from "../sidebar/sidebar.logic";

/** The parts of a browser tab Loka reads. */
export interface BrowserTab {
	id: number;
	url: string;
	title: string;
	active: boolean;
	groupId: number;
	windowId: number;
	openerTabId?: number;
	lastAccessed?: number;
}

export type LiveMap = Record<TabId, number>;

function pinnedIds(nodes: PinnedNode[]): TabId[] {
	return nodes.flatMap((n) => (n.kind === "tab" ? [n.id] : pinnedIds(n.children)));
}

/** Which space a tab belongs to, "essentials" for an Essential, or null if it isn't in the sidebar. */
export function homeOf(state: BrowserState, tabId: TabId): string | null {
	if (state.essentials.includes(tabId)) return "essentials";
	const space = state.spaces.find((s) => s.open.includes(tabId) || pinnedIds(s.pinned).includes(tabId));
	return space?.id ?? null;
}

function lokaIdOf(live: LiveMap, browserId: number): TabId | null {
	return Object.entries(live).find(([, id]) => id === browserId)?.[0] ?? null;
}

function replaceSpace(state: BrowserState, spaceId: string, update: (s: Space) => Space): BrowserState {
	return { ...state, spaces: state.spaces.map((s) => (s.id === spaceId ? update(s) : s)) };
}

/** Adds a browser tab to a space's open tabs as a new Loka tab, at the top, and links them. */
function addOpenTab(
	state: BrowserState,
	live: LiveMap,
	tab: BrowserTab,
	spaceId: string,
	now: number,
): [BrowserState, LiveMap] {
	const id = newId();
	const withTab = {
		...state,
		tabs: {
			...state.tabs,
			[id]: { id, url: tab.url, title: tab.title || tab.url, lastActiveAt: tab.lastAccessed ?? now },
		},
	};
	const placed = replaceSpace(withTab, spaceId, (s) => ({
		...s,
		open: [id, ...s.open],
		activeTabId: tab.active ? id : s.activeTabId,
	}));
	return [placed, { ...live, [id]: tab.id }];
}

/**
 * When Loka starts, links the tabs the browser already has to Loka's tabs by address. A browser tab with no match
 * becomes an open tab in the current space; a Loka open tab with no browser tab left is dropped (it was closed while
 * Loka wasn't running). Pinned tabs and Essentials stay either way.
 */
export function adoptTabs(state: BrowserState, tabs: BrowserTab[], now: number): [BrowserState, LiveMap] {
	let live: LiveMap = {};
	let next = state;
	const taken = new Set<TabId>();
	const candidates = (): TabId[] => {
		const space = activeSpace(next);
		const others = next.spaces.filter((s) => s.id !== space.id);
		return [
			...space.open,
			...pinnedIds(space.pinned),
			...next.essentials,
			...others.flatMap((s) => [...s.open, ...pinnedIds(s.pinned)]),
		];
	};
	for (const tab of tabs) {
		const match = candidates().find((id) => !taken.has(id) && next.tabs[id]?.url === tab.url);
		if (match) {
			taken.add(match);
			live[match] = tab.id;
			continue;
		}
		[next, live] = addOpenTab(next, live, tab, next.activeSpaceId, now);
		taken.add(lokaIdOf(live, tab.id) ?? "");
	}
	// Open tabs that no browser tab took are gone.
	for (const space of next.spaces) {
		for (const id of space.open) if (!(id in live)) next = closeTab(next, id);
	}
	const active = tabs.find((t) => t.active);
	const activeId = active ? lokaIdOf(live, active.id) : null;
	if (activeId) next = showTab(next, activeId, now);
	return [next, live];
}

/** Makes a tab the shown one: switches to its space if it has one, then activates it. */
function showTab(state: BrowserState, tabId: TabId, now: number): BrowserState {
	const home = homeOf(state, tabId);
	const inSpace = home && home !== "essentials" ? switchSpace(state, home) : state;
	return activateTab(inSpace, tabId, now);
}

/**
 * A tab the browser opened. If Loka asked for it (`forTabId`), it only gets linked. A new tab Loka opened for a space
 * (`forSpaceId`, a "new-tab" op) joins that space: the browser names the tab that was showing as its opener, and
 * that tab is in the space the user just left. Otherwise it joins the open tabs of the space it was opened from (a
 * link's opener), or the current space.
 */
export function tabCreated(
	state: BrowserState,
	live: LiveMap,
	tab: BrowserTab,
	now: number,
	forTabId?: TabId,
	forSpaceId?: string,
): [BrowserState, LiveMap] {
	if (forTabId && state.tabs[forTabId]) return [state, { ...live, [forTabId]: tab.id }];
	if (lokaIdOf(live, tab.id)) return [state, live];
	if (forSpaceId && state.spaces.some((s) => s.id === forSpaceId)) {
		return addOpenTab(state, live, tab, forSpaceId, now);
	}
	const opener = tab.openerTabId === undefined ? null : lokaIdOf(live, tab.openerTabId);
	const openerHome = opener ? homeOf(state, opener) : null;
	const spaceId = openerHome && openerHome !== "essentials" ? openerHome : state.activeSpaceId;
	return addOpenTab(state, live, tab, spaceId, now);
}

/** A tab the browser closed: an open tab is gone; a pinned tab or Essential stays in the sidebar, unloaded. */
export function tabRemoved(state: BrowserState, live: LiveMap, browserId: number): [BrowserState, LiveMap] {
	const id = lokaIdOf(live, browserId);
	if (!id) return [state, live];
	const { [id]: _gone, ...rest } = live;
	return [closeTab(state, id), rest];
}

/**
 * A tab's title or address changed. Open tabs follow the page. A pinned tab or Essential keeps the address it was
 * pinned with, so it can go back there, and only takes the new title while on that address.
 */
export function tabUpdated(state: BrowserState, live: LiveMap, tab: BrowserTab): BrowserState {
	const id = lokaIdOf(live, tab.id);
	const current = id ? state.tabs[id] : undefined;
	if (!id || !current) return state;
	const isOpen = state.spaces.some((s) => s.open.includes(id));
	const next = isOpen
		? { ...current, url: tab.url, title: tab.title || tab.url }
		: { ...current, title: tab.url === current.url && tab.title ? tab.title : current.title };
	if (next.url === current.url && next.title === current.title) return state;
	return { ...state, tabs: { ...state.tabs, [id]: next } };
}

/** The user picked a tab in the browser (its tab strip, a shortcut, a link): show it in Loka too. */
export function tabActivated(state: BrowserState, live: LiveMap, browserId: number, now: number): BrowserState {
	const id = lokaIdOf(live, browserId);
	if (!id) return state;
	const space = activeSpace(state);
	if (space.activeTabId === id && homeOf(state, id) !== null) return state;
	return showTab(state, id, now);
}

export type Op =
	| { op: "create"; tabId: TabId; url: string }
	| { op: "new-tab"; spaceId: string }
	| { op: "activate"; browserId: number }
	| { op: "remove"; browserId: number }
	| { op: "group"; key: string; browserIds: number[]; title: string; color: GroupColor }
	| { op: "look"; key: string; groupId: number; title: string; color: GroupColor }
	| { op: "ungroup"; browserIds: number[] }
	| { op: "collapse"; groupId: number; collapsed: boolean };

/** A space's tab group in one window, as the sync last set it. Title and color are unknown for older records. */
export interface GroupRecord {
	id: number;
	collapsed: boolean;
	title?: string;
	color?: GroupColor;
}

/**
 * What the browser must do so its tabs match Loka: load and show the tab the current space is showing, then close
 * tabs Loka no longer has (in that order, so closing the shown tab never leaves the browser to pick another space's
 * tab), keep each space's live tabs in a tab group named and colored after it (Essentials in none), and fold away
 * the groups of the other spaces. Running it again on its own result plans nothing.
 * `groups` is the tab group each space already has in each window, by `groupKey`, and whether it's folded (a tab
 * group can't span windows, so a space open in two windows has a group in each). `switched` says the user
 * just changed spaces: if the new space shows nothing, the browser shows its first loaded tab, or a new tab (the
 * command bar), so the browser is never left on another space's tab, the way Arc does it.
 */
export function planReconcile(
	state: BrowserState,
	live: LiveMap,
	tabs: BrowserTab[],
	groups: Record<string, GroupRecord>,
	switched = false,
): Op[] {
	const ops: Op[] = [];
	const byId = new Map(tabs.map((t) => [t.id, t]));
	const removes: Op[] = [];
	for (const [id, browserId] of Object.entries(live)) {
		if (!state.tabs[id] && byId.has(browserId)) removes.push({ op: "remove", browserId });
	}
	const space = activeSpace(state);
	const shown = space.activeTabId;
	if (shown && state.tabs[shown]) {
		const browserId = live[shown];
		const tab = browserId === undefined ? undefined : byId.get(browserId);
		if (!tab) ops.push({ op: "create", tabId: shown, url: state.tabs[shown]?.url ?? "" });
		else if (!tab.active) ops.push({ op: "activate", browserId: tab.id });
	} else if (switched) {
		const first = [...space.open, ...pinnedIds(space.pinned)]
			.map((id) => live[id])
			.find((id) => id !== undefined && byId.has(id));
		ops.push(first === undefined ? { op: "new-tab", spaceId: space.id } : { op: "activate", browserId: first });
	}
	ops.push(...removes);
	const ungroup: number[] = [];
	for (const s of state.spaces) {
		const byWindow = new Map<number, number[]>();
		for (const [id, browserId] of Object.entries(live)) {
			const tab = byId.get(browserId);
			if (!tab || !state.tabs[id] || homeOf(state, id) !== s.id) continue;
			byWindow.set(tab.windowId, [...(byWindow.get(tab.windowId) ?? []), browserId]);
		}
		for (const [windowId, members] of byWindow) {
			const key = groupKey(s.id, windowId);
			const record = groups[key];
			const group = record?.id;
			const look = { title: s.name, color: groupColor(s.hue) };
			const strays = members.filter((browserId) => group === undefined || byId.get(browserId)?.groupId !== group);
			if (strays.length) ops.push({ op: "group", key, browserIds: strays, ...look });
			else if (record?.title !== undefined && (record.title !== look.title || record.color !== look.color)) {
				// The space was renamed or recolored since its group was made.
				ops.push({ op: "look", key, groupId: record.id, ...look });
			}
		}
	}
	for (const [id, browserId] of Object.entries(live)) {
		const tab = byId.get(browserId);
		if (tab && tab.groupId !== -1 && homeOf(state, id) === "essentials") ungroup.push(browserId);
	}
	if (ungroup.length) ops.push({ op: "ungroup", browserIds: ungroup });
	for (const [key, group] of Object.entries(groups)) {
		const collapsed = key.split("@")[0] !== space.id;
		if (group.collapsed !== collapsed) ops.push({ op: "collapse", groupId: group.id, collapsed });
	}
	return ops;
}

/** The key for a space's tab group in one window. */
export function groupKey(spaceId: string, windowId: number): string {
	return `${spaceId}@${windowId}`;
}

/** Chrome's tab group colors, which a space's hue is matched to. */
export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
const GROUP_HUES: [GroupColor, number][] = [
	["red", 0],
	["orange", 30],
	["yellow", 55],
	["green", 140],
	["cyan", 180],
	["blue", 215],
	["purple", 270],
	["pink", 320],
];

/** The tab group color nearest a space's hue, going round the color wheel. */
export function groupColor(hue: number): GroupColor {
	let best: GroupColor = "grey";
	let bestGap = Number.POSITIVE_INFINITY;
	for (const [color, h] of GROUP_HUES) {
		const raw = Math.abs((((hue - h) % 360) + 360) % 360);
		const gap = Math.min(raw, 360 - raw);
		if (gap < bestGap) [best, bestGap] = [color, gap];
	}
	return best;
}

/** The first state for someone with no saved spaces: one space, nothing pinned. Their open tabs get adopted into it. */
export function firstState(): BrowserState {
	const space: Space = {
		id: newId(),
		name: "Personal",
		hue: 200,
		planet: "ringed",
		scheme: "system",
		pinned: [],
		open: [],
		activeTabId: null,
	};
	return { version: 1, tabs: {}, essentials: [], spaces: [space], activeSpaceId: space.id, archive: [] };
}
