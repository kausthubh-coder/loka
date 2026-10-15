// Reads other browsers' files into Loka's model. The real browser extends Helium's importers (ported from Brave),
// which find these files by themselves; the prototype takes them from a file picker. Either way, this is the mapping:
//   Chrome / Edge `Bookmarks`  -> a pinned folder in the current space, keeping the folder tree
//   Arc `StorableSidebar.json` -> one Loka space per Arc space (name and color), pinned tree, Favorites -> Essentials

import {
	type BrowserState,
	createSpace,
	newId,
	type PinnedNode,
	PLANET_KINDS,
	type SpaceLook,
	type Tab,
} from "../sidebar/sidebar.logic";

export type ImportNode =
	| { kind: "tab"; title: string; url: string }
	| { kind: "folder"; name: string; children: ImportNode[] };

export interface ArcImport {
	spaces: { name: string; hue: number | null; pinned: ImportNode[] }[];
	favorites: { title: string; url: string }[];
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

function parse(json: string): unknown {
	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
}

/** Only pages a browser can open again; Arc's own arc:// pages and empty entries are skipped. */
function keepUrl(url: string): boolean {
	return /^(https?|file):/i.test(url);
}

/** Chrome and Edge `Bookmarks` (same format): the bookmarks bar, then Other and Mobile bookmarks as folders. */
export function parseChromeBookmarks(json: string): ImportNode[] | null {
	const data = parse(json);
	if (!isObject(data) || !isObject(data.roots)) return null;
	const walk = (nodes: unknown): ImportNode[] =>
		(Array.isArray(nodes) ? nodes : []).flatMap((n): ImportNode[] => {
			if (!isObject(n)) return [];
			if (n.type === "url" && keepUrl(text(n.url)))
				return [{ kind: "tab", title: text(n.name) || text(n.url), url: text(n.url) }];
			if (n.type === "folder") return [{ kind: "folder", name: text(n.name) || "Folder", children: walk(n.children) }];
			return [];
		});
	const roots = data.roots;
	const bar = isObject(roots.bookmark_bar) ? walk(roots.bookmark_bar.children) : [];
	const extra = (key: string, name: string): ImportNode[] => {
		const root = roots[key];
		const children = isObject(root) ? walk(root.children) : [];
		return children.length ? [{ kind: "folder", name, children }] : [];
	};
	return [...bar, ...extra("other", "Other bookmarks"), ...extra("synced", "Mobile bookmarks")];
}

/** Arc's `spaces` and `items` are flat lists alternating an id and its object; this keeps the objects by id. */
function byId(list: unknown): Map<string, Json> {
	const found = new Map<string, Json>();
	for (const entry of Array.isArray(list) ? list : []) {
		if (isObject(entry) && typeof entry.id === "string") found.set(entry.id, entry);
	}
	return found;
}

/** The id after a "pinned" marker. Older files use the string "pinned"; newer ones an object like {"pinned": {}}. */
function pinnedContainer(space: Json): string | null {
	const ids = Array.isArray(space.newContainerIDs) ? space.newContainerIDs : space.containerIDs;
	if (!Array.isArray(ids)) return null;
	for (let i = 0; i < ids.length - 1; i++) {
		const marker = ids[i];
		if (marker === "pinned" || (isObject(marker) && "pinned" in marker)) {
			const id = ids[i + 1];
			if (typeof id === "string") return id;
		}
	}
	return null;
}

function rgbToHue(c: Json): number | null {
	const [r, g, b] = [c.red, c.green, c.blue].map((v) => (typeof v === "number" ? v : Number.NaN));
	if (r === undefined || g === undefined || b === undefined || [r, g, b].some(Number.isNaN)) return null;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	if (max - min < 0.04) return null; // grey: no hue worth keeping
	const d = max - min;
	const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return Math.round((h * 60 + 360) % 360);
}

/** Arc's `StorableSidebar.json`: spaces with their pinned tabs and nested folders, and Favorites. */
export function parseArcSidebar(json: string): ArcImport | null {
	const data = parse(json);
	if (!isObject(data) || !isObject(data.sidebar) || !Array.isArray(data.sidebar.containers)) return null;
	// The data container is usually index 1, but tools have seen it elsewhere: take the one holding spaces and items.
	const container = data.sidebar.containers.find((c): c is Json => isObject(c) && "spaces" in c && "items" in c);
	if (!container) return null;
	const items = byId(container.items);
	const visited = new Set<string>();

	const tree = (parentId: string): ImportNode[] => {
		const parent = items.get(parentId);
		const childIds = parent && Array.isArray(parent.childrenIds) ? parent.childrenIds : [];
		return childIds.flatMap((id): ImportNode[] => {
			if (typeof id !== "string" || visited.has(id)) return [];
			visited.add(id);
			const item = items.get(id);
			const kind = item && isObject(item.data) ? item.data : null;
			if (!item || !kind) return [];
			if (isObject(kind.tab)) {
				const url = text(kind.tab.savedURL);
				const title = text(item.title) || text(kind.tab.savedTitle) || url;
				return keepUrl(url) ? [{ kind: "tab", title, url }] : [];
			}
			if (isObject(kind.list) || Array.isArray(item.childrenIds)) {
				return [{ kind: "folder", name: text(item.title) || "Folder", children: tree(id) }];
			}
			return [];
		});
	};

	const spaces = [...byId(container.spaces).values()].map((space) => {
		const pinnedId = pinnedContainer(space);
		const palette =
			isObject(space.customInfo) && isObject(space.customInfo.windowTheme) ? space.customInfo.windowTheme : null;
		const mid =
			palette && isObject(palette.primaryColorPalette) && isObject(palette.primaryColorPalette.midTone)
				? palette.primaryColorPalette.midTone
				: null;
		return {
			name: text(space.title) || "Arc space",
			hue: mid ? rgbToHue(mid) : null,
			pinned: pinnedId ? tree(pinnedId) : [],
		};
	});

	// topAppsContainerIDs alternates a profile tag and a Favorites container id, one per Arc profile.
	const tops = Array.isArray(container.topAppsContainerIDs) ? container.topAppsContainerIDs : [];
	const favorites = tops
		.filter((id): id is string => typeof id === "string" && items.has(id))
		.flatMap((id) => tree(id))
		.flatMap((node) => (node.kind === "tab" ? [{ title: node.title, url: node.url }] : []));
	return { spaces, favorites };
}

/** Turns imported nodes into Loka tabs and pinned nodes, with fresh ids. */
function toPinned(nodes: ImportNode[], tabs: Record<string, Tab>): PinnedNode[] {
	return nodes.map((node): PinnedNode => {
		const id = newId();
		if (node.kind === "tab") {
			tabs[id] = { id, title: node.title, url: node.url };
			return { kind: "tab", id };
		}
		return { kind: "folder", id, name: node.name, open: false, children: toPinned(node.children, tabs) };
	});
}

export function countImported(nodes: ImportNode[]): number {
	return nodes.reduce((n, node) => n + (node.kind === "tab" ? 1 : countImported(node.children)), 0);
}

/** Adds bookmarks as one closed pinned folder (e.g. "Chrome bookmarks") at the end of a space. */
export function addImportedFolder(
	state: BrowserState,
	spaceId: string,
	name: string,
	nodes: ImportNode[],
): BrowserState {
	if (!nodes.length || !state.spaces.some((s) => s.id === spaceId)) return state;
	const tabs = { ...state.tabs };
	const folder: PinnedNode = { kind: "folder", id: newId(), name, open: false, children: toPinned(nodes, tabs) };
	return {
		...state,
		tabs,
		spaces: state.spaces.map((s) => (s.id === spaceId ? { ...s, pinned: [...s.pinned, folder] } : s)),
	};
}

/**
 * Adds each Arc space as a Loka space with its name, color (or the next free one) and pinned tree, and Arc's
 * Favorites to Essentials, skipping addresses Essentials already has. The current space stays current.
 */
export function addArcSpaces(state: BrowserState, arc: ArcImport, fallbackHues: number[]): BrowserState {
	const current = state.activeSpaceId;
	let next = state;
	for (const [i, space] of arc.spaces.entries()) {
		const look: SpaceLook = {
			name: space.name,
			hue: space.hue ?? fallbackHues[(next.spaces.length + i) % fallbackHues.length] ?? 200,
			planet: PLANET_KINDS[(next.spaces.length + i) % PLANET_KINDS.length] ?? "banded",
		};
		const [made, id] = createSpace(next, look);
		const tabs = { ...made.tabs };
		const pinned = toPinned(space.pinned, tabs);
		next = { ...made, tabs, spaces: made.spaces.map((s) => (s.id === id ? { ...s, pinned } : s)) };
	}
	const have = new Set(next.essentials.map((id) => next.tabs[id]?.url));
	const tabs = { ...next.tabs };
	const essentials = [...next.essentials];
	for (const fav of arc.favorites) {
		if (have.has(fav.url)) continue;
		have.add(fav.url);
		const id = newId();
		tabs[id] = { id, title: fav.title, url: fav.url };
		essentials.push(id);
	}
	return { ...next, tabs, essentials, activeSpaceId: current };
}
