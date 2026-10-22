// The Library: one page (chrome://history) for the spaces, archived tabs, history and downloads. The URL's hash picks
// the section; History is the page with no hash, so Ctrl+H (chrome://history/) still opens it.

import type { NativeDownload } from "../../../../webui/src/bridge";
import { type Day, groupByDay } from "../history/history.logic";
import type { BrowserState, PinnedNode, PlanetKind, Space, Tab } from "../sidebar/sidebar.logic";

export type Section = "spaces" | "archive" | "history" | "downloads";

/** The sections in the order the Library lists them: `label` in its switcher, `title` as the section's heading. */
export const SECTIONS: { id: Section; label: string; title: string }[] = [
	{ id: "spaces", label: "Spaces", title: "Spaces" },
	{ id: "archive", label: "Archive", title: "Archived tabs" },
	{ id: "history", label: "History", title: "History" },
	{ id: "downloads", label: "Downloads", title: "Downloads" },
];

/** The section a URL's hash ("#spaces", or "") shows. No hash, or one the Library doesn't know, is History. */
export function sectionFromHash(hash: string): Section {
	const id = hash.replace(/^#/, "");
	return SECTIONS.find((s) => s.id === id)?.id ?? "history";
}

/**
 * The address that shows a section of the Library at `base` (chrome://history/ in the browser): History is `base`
 * itself, what Ctrl+H opens; the others add their hash.
 */
export function sectionUrl(base: string, section: Section): string {
	return section === "history" ? base : `${base}#${section}`;
}

/** A section's heading, which is also the page's title while it shows. */
export function sectionTitle(section: Section): string {
	return SECTIONS.find((s) => s.id === section)?.title ?? "History";
}

// ---- Spaces -----------------------------------------------------------------------------------------------------

/** One line of a space's pinned tree in the Library: a folder (with how many tabs it holds, at any depth) or a tab. */
export type TreeRow =
	| { kind: "folder"; id: string; name: string; depth: number; tabs: number; open: boolean }
	| { kind: "tab"; id: string; tab: Tab; depth: number };

function tabsUnder(nodes: PinnedNode[]): number {
	return nodes.reduce((n, node) => n + (node.kind === "tab" ? 1 : tabsUnder(node.children)), 0);
}

/**
 * A pinned tree as rows, every folder open unless it's in `closed`. The Library opens and closes folders for itself:
 * the sidebar's open and closed folders stay as they are.
 */
export function treeRows(
	nodes: PinnedNode[],
	tabs: Record<string, Tab>,
	closed: ReadonlySet<string>,
	depth = 0,
): TreeRow[] {
	return nodes.flatMap((node): TreeRow[] => {
		if (node.kind === "tab") {
			const tab = tabs[node.id];
			return tab ? [{ kind: "tab", id: node.id, tab, depth }] : [];
		}
		const open = !closed.has(node.id);
		const row: TreeRow = { kind: "folder", id: node.id, name: node.name, depth, tabs: tabsUnder(node.children), open };
		return open ? [row, ...treeRows(node.children, tabs, closed, depth + 1)] : [row];
	});
}

/** What a space holds, counted: its pinned tabs (in folders too), its open tabs, and its folders. */
export function spaceCounts(space: Space): { pinned: number; open: number; folders: number } {
	const folders = (nodes: PinnedNode[]): number =>
		nodes.reduce((n, node) => n + (node.kind === "folder" ? 1 + folders(node.children) : 0), 0);
	return { pinned: tabsUnder(space.pinned), open: space.open.length, folders: folders(space.pinned) };
}

/**
 * Where a space dragged in the rail lands: the index it ends up at (what moveSpace takes). `centers` are the rows'
 * middles along the list's axis, in the order before the drag; `from` is the dragged row; `at` is the pointer. It
 * goes after every other row whose middle the pointer has passed.
 */
export function spaceDropIndex(centers: number[], from: number, at: number): number {
	return centers.filter((center, i) => i !== from && center < at).length;
}

/** A space's counts in words: "5 pinned, 3 open", "1 pinned", "Empty". */
export function countsLabel(counts: { pinned: number; open: number }): string {
	const parts = [counts.pinned ? `${counts.pinned} pinned` : "", counts.open ? `${counts.open} open` : ""];
	return parts.filter(Boolean).join(", ") || "Empty";
}

// ---- Archived tabs ----------------------------------------------------------------------------------------------

/** An archived tab as the Library lists it: when it left, and the space it left (null once that space is deleted). */
export interface ArchiveRow {
	time: number;
	tab: Tab;
	space: { id: string; name: string; hue: number; planet: PlanetKind } | null;
}

/**
 * The archive, newest first and cut into days, narrowed to tabs whose title or address has `query` and, unless
 * `spaceId` is null, to the tabs that left that space.
 */
export function archiveDays(
	state: BrowserState,
	query: string,
	spaceId: string | null,
	now: number,
): Day<ArchiveRow>[] {
	const q = query.trim().toLowerCase();
	const rows = state.archive
		.filter((a) => spaceId === null || a.spaceId === spaceId)
		.filter((a) => !q || a.tab.title.toLowerCase().includes(q) || a.tab.url.toLowerCase().includes(q))
		.map((a): ArchiveRow => {
			const space = state.spaces.find((s) => s.id === a.spaceId);
			return {
				time: a.archivedAt,
				tab: a.tab,
				space: space ? { id: space.id, name: space.name, hue: space.hue, planet: space.planet } : null,
			};
		})
		.toSorted((a, b) => b.time - a.time);
	return groupByDay(rows, now);
}

/** The spaces archived tabs came from, in the sidebar's order, with how many each has. Spaces with none are left out. */
export function archiveSpaces(state: BrowserState): { space: Space; count: number }[] {
	return state.spaces
		.map((space) => ({ space, count: state.archive.filter((a) => a.spaceId === space.id).length }))
		.filter((s) => s.count > 0);
}

// ---- Downloads ----------------------------------------------------------------------------------------------------

/** A download as the Library lists it, by the day it started. */
export interface DownloadRow {
	time: number;
	download: NativeDownload;
}

/** The downloads, newest first and cut into days, narrowed to those whose file name or address has `query`. */
export function downloadDays(list: NativeDownload[], query: string, now: number): Day<DownloadRow>[] {
	const q = query.trim().toLowerCase();
	const rows = list
		.filter((d) => !q || d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q))
		.map((download) => ({ time: download.startTime, download }))
		.toSorted((a, b) => b.time - a.time);
	return groupByDay(rows, now);
}
