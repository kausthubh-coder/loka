import { expect, test } from "bun:test";
import type { NativeDownload } from "../../../../webui/src/bridge";
import { archiveStale, deleteSpace } from "../sidebar/sidebar.logic";
import { seedState } from "../sidebar/sidebar.seed";
import {
	archiveDays,
	archiveSpaces,
	countsLabel,
	downloadDays,
	sectionFromHash,
	sectionTitle,
	sectionUrl,
	spaceCounts,
	spaceDropIndex,
	treeRows,
} from "./library.logic";

const NOW = new Date(2026, 9, 15, 14, 30).getTime();
const HOUR = 60 * 60 * 1000;

test("the hash picks the section, and no hash is History, which is what Ctrl+H opens", () => {
	expect(["#spaces", "#archive", "#history", "#downloads"].map(sectionFromHash)).toEqual([
		"spaces",
		"archive",
		"history",
		"downloads",
	]);
	expect([sectionFromHash(""), sectionFromHash("#"), sectionFromHash("#bookmarks")]).toEqual([
		"history",
		"history",
		"history",
	]);
	expect(sectionTitle("archive")).toBe("Archived tabs");
});

test("a section's address is the Library's with its hash, and History's is the bare address Ctrl+H opens", () => {
	expect(sectionUrl("chrome://history/", "spaces")).toBe("chrome://history/#spaces");
	expect(sectionUrl("chrome://history/", "history")).toBe("chrome://history/");
	expect(sectionFromHash(new URL(sectionUrl("chrome://history/", "downloads")).hash)).toBe("downloads");
});

test("a space's tree lists every folder open, nested, with the tabs each holds at any depth", () => {
	const state = seedState(NOW);
	const school = state.spaces[1];
	if (!school) throw new Error("the seed has a second space");
	// The sidebar has Game project closed; the Library shows the whole tree anyway.
	const rows = treeRows(school.pinned, state.tabs, new Set()).map((r) =>
		r.kind === "folder" ? `${r.depth}:${r.name} (${r.tabs})` : `${r.depth}:${r.tab.title}`,
	);
	expect(rows).toEqual([
		"0:Canvas: CSC 281",
		"0:CSC 281 (2)",
		"1:Game project (2)",
		"2:Game design doc",
		"2:Minecraft farm designs",
	]);
});

test("a folder the Library closed hides what's inside it, and says it's closed", () => {
	const state = seedState(NOW);
	const build = state.spaces[0];
	if (!build) throw new Error("the seed has a first space");
	const rows = treeRows(build.pinned, state.tabs, new Set(["f-docs"]));
	expect(rows.map((r) => (r.kind === "folder" ? `${r.name}:${r.open}` : r.tab.title))).toEqual([
		"Loka:true",
		"imputnet/helium-windows",
		"Docs:false",
	]);
});

test("a space's counts take pinned tabs in folders, open tabs and folders, and read as words", () => {
	const state = seedState(NOW);
	expect(state.spaces.map(spaceCounts)).toEqual([
		{ pinned: 3, open: 3, folders: 2 },
		{ pinned: 3, open: 0, folders: 2 },
		{ pinned: 0, open: 1, folders: 0 },
	]);
	expect(state.spaces.map((s) => countsLabel(spaceCounts(s)))).toEqual(["3 pinned, 3 open", "3 pinned", "1 open"]);
	expect(countsLabel({ pinned: 0, open: 0 })).toBe("Empty");
});

test("a space dragged in the rail lands after every other row whose middle the pointer has passed", () => {
	// Three rows 36 px tall: middles at 18, 54 and 90.
	const centers = [18, 54, 90];
	expect(spaceDropIndex(centers, 0, 10)).toBe(0);
	expect(spaceDropIndex(centers, 0, 60)).toBe(1);
	expect(spaceDropIndex(centers, 0, 200)).toBe(2);
	expect(spaceDropIndex(centers, 2, 50)).toBe(1);
	expect(spaceDropIndex(centers, 2, -40)).toBe(0);
	expect(spaceDropIndex(centers, 1, 80)).toBe(1);
	expect(spaceDropIndex(centers, 1, 95)).toBe(2);
});

/** The seed after the archive has run 8 hours on: Arc (17 h unseen) and Zen (13 h) are archived from Build. */
function archived() {
	const later = NOW + 8 * HOUR;
	return { state: archiveStale(seedState(NOW), later, 12 * HOUR), later };
}

test("archived tabs are listed newest first, by day, with the space they left", () => {
	const { state, later } = archived();
	const days = archiveDays(state, "", null, later);
	expect(days.map((d) => d.label)).toEqual(["Today"]);
	expect(days[0]?.items.map((r) => [r.tab.title, r.space?.name, r.time])).toEqual([
		["Arc: what we learned", "Build", later],
		["Zen Browser", "Build", later],
	]);
});

test("archived tabs from different days fall under their own day", () => {
	const { state } = archived();
	const older = {
		...state,
		archive: state.archive.map((a, i) => (i === 1 ? { ...a, archivedAt: NOW - 26 * HOUR } : a)),
	};
	const days = archiveDays(older, "", null, NOW + 8 * HOUR);
	expect(days.map((d) => [d.label, d.items.map((r) => r.tab.title)])).toEqual([
		["Today", ["Arc: what we learned"]],
		["Yesterday", ["Zen Browser"]],
	]);
});

test("the archive search matches title or address, and the space filter keeps one space's tabs", () => {
	const { state, later } = archived();
	const titles = (q: string, space: string | null) =>
		archiveDays(state, q, space, later).flatMap((d) => d.items.map((r) => r.tab.title));
	expect(titles("ZEN", null)).toEqual(["Zen Browser"]);
	expect(titles("substack", null)).toEqual(["Arc: what we learned"]);
	expect(titles("", "s-school")).toEqual([]);
	expect(titles("", "s-build")).toEqual(["Arc: what we learned", "Zen Browser"]);
	expect(archiveSpaces(state).map((s) => [s.space.name, s.count])).toEqual([["Build", 2]]);
});

test("a tab archived from a space since deleted still shows, with no space", () => {
	const { state, later } = archived();
	const gone = deleteSpace(state, "s-build");
	const rows = archiveDays(gone, "", null, later).flatMap((d) => d.items);
	expect(rows.map((r) => [r.tab.title, r.space])).toEqual([
		["Arc: what we learned", null],
		["Zen Browser", null],
	]);
	expect(archiveSpaces(gone)).toEqual([]);
});

test("downloads are listed newest first by the day they started, and search finds a file by name or address", () => {
	const download = (id: number, name: string, url: string, startTime: number): NativeDownload => ({
		id,
		name,
		url,
		state: "complete",
		receivedBytes: 1024,
		totalBytes: 1024,
		startTime,
		canResume: false,
	});
	const list = [
		download(1, "node-v24.4.0-x64.msi", "https://nodejs.org/dist/v24.4.0/node-v24.4.0-x64.msi", NOW - 50 * HOUR),
		download(3, "CSC281-GDD-v3.pdf", "https://canvas.example.edu/courses/281/files/9921/download", NOW - HOUR),
		download(2, "loka-spaces.json", "blob:http://localhost/0b7c", NOW - 20 * HOUR),
	];
	const days = downloadDays(list, "", NOW);
	expect(days.map((d) => d.items.map((r) => r.download.id))).toEqual([[3], [2], [1]]);
	expect(days.map((d) => d.label).slice(0, 2)).toEqual(["Today", "Yesterday"]);
	expect(days[2]?.label).toBe(
		new Date(NOW - 50 * HOUR).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
	);
	expect(downloadDays(list, "canvas", NOW).flatMap((d) => d.items.map((r) => r.download.name))).toEqual([
		"CSC281-GDD-v3.pdf",
	]);
	expect(downloadDays(list, "MSI", NOW).flatMap((d) => d.items.map((r) => r.download.id))).toEqual([1]);
});
