// The sidebar's data model: spaces, essentials, pinned folders (nested) and open tabs.
// Pure functions only, so the same rules can be ported to the C++ model later.
// Every tab lives in exactly one place: essentials, one space's pinned tree, or one space's open list.

export type TabId = string;

export interface Tab {
	id: TabId;
	title: string;
	url: string;
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

export interface Space {
	id: string;
	name: string;
	/** Hue (0-360) that tints the whole window while this space is active. */
	hue: number;
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

export function openTab(state: BrowserState, url: string, title = url): BrowserState {
	const id = newId();
	const spaceId = state.activeSpaceId;
	const withTab = { ...state, tabs: { ...state.tabs, [id]: { id, url, title } } };
	return replaceSpace(withTab, spaceId, (s) => ({ ...s, open: [id, ...s.open], activeTabId: id }));
}

export function activateTab(state: BrowserState, tabId: TabId): BrowserState {
	if (!state.tabs[tabId]) return state;
	return replaceSpace(state, state.activeSpaceId, (s) => ({ ...s, activeTabId: tabId }));
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

export function createSpace(state: BrowserState, name: string, hue: number): [BrowserState, string] {
	const id = newId();
	const space: Space = { id, name, hue, pinned: [], open: [], activeTabId: null };
	return [{ ...state, spaces: [...state.spaces, space], activeSpaceId: id }, id];
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
	return data;
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

function isBrowserState(value: unknown): value is BrowserState {
	if (!isRecord(value) || value.version !== 1 || typeof value.activeSpaceId !== "string") return false;
	if (!isStringArray(value.essentials) || !isRecord(value.tabs) || !Array.isArray(value.spaces)) return false;
	const tabsOk = Object.entries(value.tabs).every(
		([id, tab]) => isRecord(tab) && tab.id === id && typeof tab.title === "string" && typeof tab.url === "string",
	);
	const spacesOk = value.spaces.every(
		(s) =>
			isRecord(s) &&
			typeof s.id === "string" &&
			typeof s.name === "string" &&
			typeof s.hue === "number" &&
			isStringArray(s.open) &&
			Array.isArray(s.pinned) &&
			s.pinned.every(isPinnedNode) &&
			(s.activeTabId === null || typeof s.activeTabId === "string"),
	);
	return tabsOk && spacesOk;
}
