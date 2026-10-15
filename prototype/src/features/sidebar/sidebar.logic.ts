// The sidebar's data model: spaces, essentials, pinned folders (nested) and open tabs.
// Pure functions only, so the same rules can be ported to the C++ model later.
// Every tab lives in exactly one place: essentials, one space's pinned tree, or one space's open list.

export type TabId = string;

export interface Tab {
	id: TabId;
	title: string;
	url: string;
	/** When the tab was last shown (ms since 1970). Open tabs without one are never archived. */
	lastActiveAt?: number;
}

/** An open tab the archive took away, kept so it can be found and brought back. */
export interface ArchivedTab {
	tab: Tab;
	spaceId: string;
	archivedAt: number;
}

export interface FolderNode {
	kind: "folder";
	id: string;
	name: string;
	open: boolean;
	children: PinnedNode[];
}

export interface TabNode {
	kind: "tab";
	id: TabId;
}

export type PinnedNode = FolderNode | TabNode;

/** How a space's planet is drawn on the horizon. */
export type PlanetKind = "banded" | "ringed" | "cratered" | "ocean";
export const PLANET_KINDS: PlanetKind[] = ["banded", "ringed", "cratered", "ocean"];

export interface Space {
	id: string;
	name: string;
	/** Hue (0-360) that tints the whole window while this space is active. */
	hue: number;
	planet: PlanetKind;
	pinned: PinnedNode[];
	open: TabId[];
	activeTabId: TabId | null;
}

export interface BrowserState {
	version: 1;
	tabs: Record<TabId, Tab>;
	essentials: TabId[];
	spaces: Space[];
	activeSpaceId: string;
	/** Newest first. Only open tabs are ever archived; pinned tabs and Essentials stay. */
	archive: ArchivedTab[];
}

/** Where a dragged tab or folder lands. `index` counts positions before the move. */
export type Place =
	| { area: "essentials"; index: number }
	| { area: "pinned"; spaceId: string; parentId: string | null; index: number }
	| { area: "open"; spaceId: string; index: number };

export function newId(): string {
	return crypto.randomUUID();
}

export function activeSpace(state: BrowserState): Space {
	const space = state.spaces.find((s) => s.id === state.activeSpaceId);
	if (!space) throw new Error(`active space ${state.activeSpaceId} does not exist`);
	return space;
}

export function activeTab(state: BrowserState): Tab | null {
	const id = activeSpace(state).activeTabId;
	return id ? (state.tabs[id] ?? null) : null;
}

function replaceSpace(state: BrowserState, spaceId: string, update: (space: Space) => Space): BrowserState {
	return { ...state, spaces: state.spaces.map((s) => (s.id === spaceId ? update(s) : s)) };
}

function mapFolders(nodes: PinnedNode[], update: (folder: FolderNode) => FolderNode): PinnedNode[] {
	return nodes.map((node) => {
		if (node.kind !== "folder") return node;
		return update({ ...node, children: mapFolders(node.children, update) });
	});
}

export function findFolder(nodes: PinnedNode[], folderId: string): FolderNode | null {
	for (const node of nodes) {
		if (node.kind !== "folder") continue;
		if (node.id === folderId) return node;
		const inside = findFolder(node.children, folderId);
		if (inside) return inside;
	}
	return null;
}

/** True when the tab sits anywhere inside the folder, at any depth. A closed folder marks itself when it holds the active tab. */
export function folderHolds(folder: FolderNode, tabId: TabId): boolean {
	return folder.children.some((child) => (child.kind === "tab" ? child.id === tabId : folderHolds(child, tabId)));
}

function containsFolder(folder: FolderNode, folderId: string): boolean {
	return findFolder([folder], folderId) !== null;
}

/** Removes the node with this id from a pinned tree, returning the tree, the node and where it was. */
function detachPinned(
	nodes: PinnedNode[],
	id: string,
	parentId: string | null,
): { nodes: PinnedNode[]; node: PinnedNode; parentId: string | null; index: number } | null {
	const index = nodes.findIndex((n) => n.id === id);
	if (index !== -1) {
		const node = nodes[index] as PinnedNode;
		return { nodes: nodes.toSpliced(index, 1), node, parentId, index };
	}
	for (const [i, node] of nodes.entries()) {
		if (node.kind !== "folder") continue;
		const found = detachPinned(node.children, id, node.id);
		if (found) {
			return { ...found, nodes: nodes.with(i, { ...node, children: found.nodes }) };
		}
	}
	return null;
}

function insertPinned(
	nodes: PinnedNode[],
	parentId: string | null,
	index: number,
	node: PinnedNode,
): PinnedNode[] | null {
	if (parentId === null) return nodes.toSpliced(clamp(index, nodes.length), 0, node);
	let inserted = false;
	const next = mapFolders(nodes, (folder) => {
		if (folder.id !== parentId) return folder;
		inserted = true;
		return {
			...folder,
			open: true,
			children: folder.children.toSpliced(clamp(index, folder.children.length), 0, node),
		};
	});
	return inserted ? next : null;
}

function clamp(index: number, length: number): number {
	return Math.max(0, Math.min(index, length));
}

interface Detached {
	state: BrowserState;
	node: PinnedNode;
	from: Place;
}

function detach(state: BrowserState, id: string): Detached | null {
	const essentialsIndex = state.essentials.indexOf(id);
	if (essentialsIndex !== -1) {
		return {
			state: { ...state, essentials: state.essentials.toSpliced(essentialsIndex, 1) },
			node: { kind: "tab", id },
			from: { area: "essentials", index: essentialsIndex },
		};
	}
	for (const space of state.spaces) {
		const openIndex = space.open.indexOf(id);
		if (openIndex !== -1) {
			return {
				state: replaceSpace(state, space.id, (s) => ({ ...s, open: s.open.toSpliced(openIndex, 1) })),
				node: { kind: "tab", id },
				from: { area: "open", spaceId: space.id, index: openIndex },
			};
		}
		const found = detachPinned(space.pinned, id, null);
		if (found) {
			return {
				state: replaceSpace(state, space.id, (s) => ({ ...s, pinned: found.nodes })),
				node: found.node,
				from: { area: "pinned", spaceId: space.id, parentId: found.parentId, index: found.index },
			};
		}
	}
	return null;
}

function sameContainer(a: Place, b: Place): boolean {
	if (a.area === "essentials" && b.area === "essentials") return true;
	if (a.area === "open" && b.area === "open") return a.spaceId === b.spaceId;
	if (a.area === "pinned" && b.area === "pinned") return a.spaceId === b.spaceId && a.parentId === b.parentId;
	return false;
}

/**
 * Moves a tab or folder to a new place. Returns the state unchanged when the move is not allowed:
 * folders only live in a pinned tree, and a folder can't go inside itself or its own subfolders.
 */
export function moveItem(state: BrowserState, id: string, to: Place): BrowserState {
	const detached = detach(state, id);
	if (!detached) return state;
	const { node, from } = detached;

	if (node.kind === "folder") {
		if (to.area !== "pinned") return state;
		if (to.parentId !== null && containsFolder(node, to.parentId)) return state;
	}

	// Indexes are given against the list before the move, so moving down the same list shifts by one.
	const index = sameContainer(from, to) && from.index < to.index ? to.index - 1 : to.index;
	const next = detached.state;

	if (to.area === "essentials") {
		return { ...next, essentials: next.essentials.toSpliced(clamp(index, next.essentials.length), 0, node.id) };
	}
	if (to.area === "open") {
		return replaceSpace(next, to.spaceId, (s) => ({
			...s,
			open: s.open.toSpliced(clamp(index, s.open.length), 0, node.id),
		}));
	}
	const space = next.spaces.find((s) => s.id === to.spaceId);
	if (!space) return state;
	const pinned = insertPinned(space.pinned, to.parentId, index, node);
	if (!pinned) return state;
	return replaceSpace(next, to.spaceId, (s) => ({ ...s, pinned }));
}

export function openTab(state: BrowserState, url: string, title = url, now = Date.now()): BrowserState {
	const id = newId();
	const spaceId = state.activeSpaceId;
	const withTab = { ...state, tabs: { ...state.tabs, [id]: { id, url, title, lastActiveAt: now } } };
	return replaceSpace(withTab, spaceId, (s) => ({ ...s, open: [id, ...s.open], activeTabId: id }));
}

export function activateTab(state: BrowserState, tabId: TabId, now = Date.now()): BrowserState {
	const tab = state.tabs[tabId];
	if (!tab) return state;
	const shown = { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, lastActiveAt: now } } };
	return replaceSpace(shown, state.activeSpaceId, (s) => ({ ...s, activeTabId: tabId }));
}

/**
 * Closing an open tab deletes it. Closing a pinned or essential tab only unloads it,
 * the way Arc keeps pinned tabs around.
 */
export function closeTab(state: BrowserState, tabId: TabId): BrowserState {
	const owner = state.spaces.find((s) => s.open.includes(tabId));
	let next = state;
	if (owner) {
		const index = owner.open.indexOf(tabId);
		const { [tabId]: _closed, ...tabs } = state.tabs;
		next = replaceSpace({ ...state, tabs }, owner.id, (s) => {
			const open = s.open.toSpliced(index, 1);
			const neighbour = open[Math.min(index, open.length - 1)] ?? null;
			return { ...s, open, activeTabId: s.activeTabId === tabId ? neighbour : s.activeTabId };
		});
	}
	return {
		...next,
		spaces: next.spaces.map((s) => (s.activeTabId === tabId ? { ...s, activeTabId: null } : s)),
	};
}

export function switchSpace(state: BrowserState, spaceId: string): BrowserState {
	if (!state.spaces.some((s) => s.id === spaceId)) return state;
	return { ...state, activeSpaceId: spaceId };
}

/**
 * Whether going from one space to another moves forward along the switcher, which wraps around: whichever way is
 * shorter. A tie (half way round) counts as forward. Motion follows it: forward slides in from the right.
 */
export function switchesForward(state: BrowserState, fromId: string, toId: string): boolean {
	const ids = state.spaces.map((s) => s.id);
	const from = ids.indexOf(fromId);
	const to = ids.indexOf(toId);
	return (to - from + ids.length) % ids.length <= ids.length / 2;
}

export interface SpaceLook {
	name: string;
	hue: number;
	planet: PlanetKind;
}

export function createSpace(state: BrowserState, look: SpaceLook): [BrowserState, string] {
	const id = newId();
	const space: Space = { id, ...look, pinned: [], open: [], activeTabId: null };
	return [{ ...state, spaces: [...state.spaces, space], activeSpaceId: id }, id];
}

/** Changes a space's name, color or planet. Its tabs stay as they are. */
export function updateSpace(state: BrowserState, spaceId: string, look: SpaceLook): BrowserState {
	const name = look.name.trim();
	if (!name) return state;
	return replaceSpace(state, spaceId, (s) => ({ ...s, ...look, name }));
}

/** Opens a tab, or goes to it if a tab with that URL is already open anywhere (used for Settings and Downloads). */
export function focusOrOpen(state: BrowserState, url: string, title: string): BrowserState {
	for (const space of state.spaces) {
		const ids = [...space.open, ...pinnedTabIds(space.pinned)];
		const found = ids.find((id) => state.tabs[id]?.url === url);
		if (found) return activateTab(switchSpace(state, space.id), found);
	}
	const found = state.essentials.find((id) => state.tabs[id]?.url === url);
	if (found) return activateTab(state, found);
	return openTab(state, url, title);
}

export function createFolder(
	state: BrowserState,
	spaceId: string,
	parentId: string | null,
	name: string,
): [BrowserState, string] {
	const id = newId();
	const folder: FolderNode = { kind: "folder", id, name, open: true, children: [] };
	const space = state.spaces.find((s) => s.id === spaceId);
	if (!space) return [state, id];
	const pinned = insertPinned(space.pinned, parentId, Number.POSITIVE_INFINITY, folder);
	if (!pinned) return [state, id];
	return [replaceSpace(state, spaceId, (s) => ({ ...s, pinned })), id];
}

function updateFolder(state: BrowserState, folderId: string, update: (folder: FolderNode) => FolderNode): BrowserState {
	return {
		...state,
		spaces: state.spaces.map((s) => ({
			...s,
			pinned: mapFolders(s.pinned, (f) => (f.id === folderId ? update(f) : f)),
		})),
	};
}

export function renameFolder(state: BrowserState, folderId: string, name: string): BrowserState {
	return updateFolder(state, folderId, (f) => ({ ...f, name }));
}

export function toggleFolder(state: BrowserState, folderId: string): BrowserState {
	return updateFolder(state, folderId, (f) => ({ ...f, open: !f.open }));
}

/** Deletes a folder but keeps what was inside it, in its place. */
export function ungroupFolder(state: BrowserState, folderId: string): BrowserState {
	const detached = detach(state, folderId);
	if (detached?.node.kind !== "folder" || detached.from.area !== "pinned") return state;
	const { from } = detached;
	const children = detached.node.children;
	const space = detached.state.spaces.find((s) => s.id === from.spaceId);
	if (!space) return state;
	let pinned: PinnedNode[] | null = space.pinned;
	for (const [offset, child] of children.entries()) {
		pinned = pinned && insertPinned(pinned, from.parentId, from.index + offset, child);
	}
	if (!pinned) return state;
	const result = pinned;
	return replaceSpace(detached.state, from.spaceId, (s) => ({ ...s, pinned: result }));
}

/**
 * Drops one tab onto another to make a folder holding both, the way two app icons make a folder on a phone.
 * The folder takes the target's place when the target is pinned; an open target moves both into a new folder at the
 * end of that space's pinned tabs. Essentials can't be grouped. Returns the new folder's id, or null when refused.
 */
export function groupIntoFolder(
	state: BrowserState,
	targetId: TabId,
	draggedId: TabId,
	name: string,
): [BrowserState, string | null] {
	if (targetId === draggedId || !state.tabs[targetId] || !state.tabs[draggedId]) return [state, null];
	if (state.essentials.includes(targetId)) return [state, null];
	const dragged = detach(state, draggedId);
	const target = dragged && detach(dragged.state, targetId);
	if (!dragged || !target || target.from.area === "essentials") return [state, null];
	const id = newId();
	const folder: FolderNode = { kind: "folder", id, name, open: true, children: [target.node, dragged.node] };
	const from = target.from;
	const space = target.state.spaces.find((s) => s.id === from.spaceId);
	if (!space) return [state, null];
	const pinned =
		from.area === "pinned"
			? insertPinned(space.pinned, from.parentId, from.index, folder)
			: insertPinned(space.pinned, null, space.pinned.length, folder);
	if (!pinned) return [state, null];
	return [replaceSpace(target.state, space.id, (s) => ({ ...s, pinned })), id];
}

export const ARCHIVE_LIMIT = 200;

/**
 * Archives open tabs not shown for longer than `maxAgeMs`. The tab a space is showing is never archived, nor is any
 * pinned tab or Essential. Archived tabs leave the space and go to the front of `archive`.
 */
export function archiveStale(state: BrowserState, now: number, maxAgeMs: number): BrowserState {
	const archived: ArchivedTab[] = [];
	const spaces = state.spaces.map((space) => {
		const stale = space.open.filter((id) => {
			const tab = state.tabs[id];
			return id !== space.activeTabId && tab?.lastActiveAt !== undefined && now - tab.lastActiveAt > maxAgeMs;
		});
		for (const id of stale) {
			const tab = state.tabs[id];
			if (tab) archived.push({ tab, spaceId: space.id, archivedAt: now });
		}
		return stale.length ? { ...space, open: space.open.filter((id) => !stale.includes(id)) } : space;
	});
	if (!archived.length) return state;
	const gone = new Set(archived.map((a) => a.tab.id));
	const tabs = Object.fromEntries(Object.entries(state.tabs).filter(([id]) => !gone.has(id)));
	return { ...state, tabs, spaces, archive: [...archived, ...state.archive].slice(0, ARCHIVE_LIMIT) };
}

/** Brings an archived tab back to the top of its space's open tabs (or the current space, if that one is gone). */
export function restoreArchived(state: BrowserState, tabId: TabId, now = Date.now()): BrowserState {
	const entry = state.archive.find((a) => a.tab.id === tabId);
	if (!entry) return state;
	const spaceId = state.spaces.some((s) => s.id === entry.spaceId) ? entry.spaceId : state.activeSpaceId;
	const restored = {
		...state,
		tabs: { ...state.tabs, [tabId]: { ...entry.tab, lastActiveAt: now } },
		archive: state.archive.filter((a) => a.tab.id !== tabId),
		activeSpaceId: spaceId,
	};
	return replaceSpace(restored, spaceId, (s) => ({ ...s, open: [tabId, ...s.open], activeTabId: tabId }));
}

export interface SidebarMatch {
	tabId: TabId;
	spaceId: string;
	/** Where the tab sits: "Essentials", "Open", or the folder names above it (empty at the top of pinned). */
	path: string[];
}

/** Every tab in the sidebar, in any space or folder, whose title or address contains the query. */
export function searchSidebar(state: BrowserState, query: string): SidebarMatch[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const hit = (id: TabId) => {
		const tab = state.tabs[id];
		return !!tab && (tab.title.toLowerCase().includes(q) || tab.url.toLowerCase().includes(q));
	};
	const matches: SidebarMatch[] = state.essentials
		.filter(hit)
		.map((tabId) => ({ tabId, spaceId: state.activeSpaceId, path: ["Essentials"] }));
	const walk = (nodes: PinnedNode[], spaceId: string, path: string[]) => {
		for (const node of nodes) {
			if (node.kind === "folder") walk(node.children, spaceId, [...path, node.name]);
			else if (hit(node.id)) matches.push({ tabId: node.id, spaceId, path });
		}
	};
	for (const space of state.spaces) {
		walk(space.pinned, space.id, []);
		for (const id of space.open.filter(hit)) matches.push({ tabId: id, spaceId: space.id, path: ["Open"] });
	}
	return matches;
}

/** Goes to a tab wherever it is: switches to its space, opens every folder above it, and shows it. */
export function revealTab(state: BrowserState, tabId: TabId, now = Date.now()): BrowserState {
	if (!state.tabs[tabId]) return state;
	if (state.essentials.includes(tabId)) return activateTab(state, tabId, now);
	const holding = (nodes: PinnedNode[]): string[] =>
		nodes.flatMap((n) => (n.kind === "folder" && folderHolds(n, tabId) ? [n.id, ...holding(n.children)] : []));
	const space = state.spaces.find((s) => s.open.includes(tabId) || pinnedTabIds(s.pinned).includes(tabId));
	if (!space) return state;
	const toOpen = new Set(holding(space.pinned));
	const opened = {
		...state,
		spaces: state.spaces.map((s) =>
			s.id === space.id
				? { ...s, pinned: mapFolders(s.pinned, (f) => (toOpen.has(f.id) ? { ...f, open: true } : f)) }
				: s,
		),
	};
	return activateTab(switchSpace(opened, space.id), tabId, now);
}

/** The tabs of the current space in the order the sidebar shows them: Essentials, visible pinned tabs, open tabs. */
export function visibleTabOrder(state: BrowserState): TabId[] {
	const space = activeSpace(state);
	const pinned = pinnedRows(space.pinned).flatMap((r) => (r.node.kind === "tab" ? [r.node.id] : []));
	return [...state.essentials, ...pinned, ...space.open];
}

/** Moves to the next (1) or previous (-1) tab in sidebar order, wrapping around. */
export function stepTab(state: BrowserState, step: 1 | -1, now = Date.now()): BrowserState {
	const order = visibleTabOrder(state);
	if (!order.length) return state;
	const current = order.indexOf(activeSpace(state).activeTabId ?? "");
	const next = current === -1 ? (step === 1 ? 0 : order.length - 1) : (current + step + order.length) % order.length;
	const id = order[next];
	return id ? activateTab(state, id, now) : state;
}

export interface PinnedRow {
	node: PinnedNode;
	depth: number;
	parentId: string | null;
	index: number;
}

/** The pinned tree as rows for rendering, skipping the insides of closed folders. */
export function pinnedRows(nodes: PinnedNode[], depth = 0, parentId: string | null = null): PinnedRow[] {
	return nodes.flatMap((node, index) => {
		const row = { node, depth, parentId, index };
		if (node.kind === "folder" && node.open) return [row, ...pinnedRows(node.children, depth + 1, node.id)];
		return [row];
	});
}

function pinnedTabIds(nodes: PinnedNode[]): TabId[] {
	return nodes.flatMap((n) => (n.kind === "tab" ? [n.id] : pinnedTabIds(n.children)));
}

/** Every tab a space holds: pinned at any depth plus open. Essentials are shared, so they don't count. */
export function countTabs(space: Space): number {
	return pinnedTabIds(space.pinned).length + space.open.length;
}

export function exportState(state: BrowserState): string {
	return JSON.stringify(state, null, 2);
}

/** Parses an exported file. Returns null unless every tab exists and sits in exactly one place. */
export function importState(json: string): BrowserState | null {
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		return null;
	}
	if (!isBrowserState(data)) return null;
	const placed = [...data.essentials, ...data.spaces.flatMap((s) => [...s.open, ...pinnedTabIds(s.pinned)])];
	const tabIds = Object.keys(data.tabs);
	if (placed.length !== new Set(placed).size) return null;
	if (placed.length !== tabIds.length || !placed.every((id) => data.tabs[id])) return null;
	if (!data.spaces.some((s) => s.id === data.activeSpaceId)) return null;
	// Exports from before planets and the archive existed have neither: give them the first style and an empty one.
	return {
		...data,
		archive: data.archive ?? [],
		spaces: data.spaces.map((s) => ({ ...s, planet: s.planet ?? "banded" })),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isPinnedNode(value: unknown): value is PinnedNode {
	if (!isRecord(value) || typeof value.id !== "string") return false;
	if (value.kind === "tab") return true;
	return (
		value.kind === "folder" &&
		typeof value.name === "string" &&
		typeof value.open === "boolean" &&
		Array.isArray(value.children) &&
		value.children.every(isPinnedNode)
	);
}

function isTab(value: unknown, id?: string): value is Tab {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		(id === undefined || value.id === id) &&
		typeof value.title === "string" &&
		typeof value.url === "string" &&
		(value.lastActiveAt === undefined || typeof value.lastActiveAt === "number")
	);
}

function isArchivedTab(value: unknown): value is ArchivedTab {
	return (
		isRecord(value) && isTab(value.tab) && typeof value.spaceId === "string" && typeof value.archivedAt === "number"
	);
}

function isBrowserState(value: unknown): value is BrowserState {
	if (!isRecord(value) || value.version !== 1 || typeof value.activeSpaceId !== "string") return false;
	if (!isStringArray(value.essentials) || !isRecord(value.tabs) || !Array.isArray(value.spaces)) return false;
	if (value.archive !== undefined && !(Array.isArray(value.archive) && value.archive.every(isArchivedTab)))
		return false;
	const tabsOk = Object.entries(value.tabs).every(([id, tab]) => isTab(tab, id));
	const spacesOk = value.spaces.every(
		(s) =>
			isRecord(s) &&
			typeof s.id === "string" &&
			typeof s.name === "string" &&
			typeof s.hue === "number" &&
			(s.planet === undefined || PLANET_KINDS.includes(s.planet as PlanetKind)) &&
			isStringArray(s.open) &&
			Array.isArray(s.pinned) &&
			s.pinned.every(isPinnedNode) &&
			(s.activeTabId === null || typeof s.activeTabId === "string"),
	);
	return tabsOk && spacesOk;
}
