import { describe, expect, test } from "bun:test";
import { seedState } from "../sidebar/sidebar.seed";
import { addArcSpaces, addImportedFolder, countImported, parseArcSidebar, parseChromeBookmarks } from "./import.logic";

// Shaped like a real Chrome/Edge `Bookmarks` file (trimmed): roots with a bar, Other, and an empty Mobile folder.
const CHROME = JSON.stringify({
	version: 1,
	checksum: "x",
	roots: {
		bookmark_bar: {
			type: "folder",
			name: "Bookmarks bar",
			children: [
				{ type: "url", name: "Lit", url: "https://lit.dev/" },
				{
					type: "folder",
					name: "School",
					children: [
						{ type: "url", name: "Canvas", url: "https://canvas.example.edu/" },
						{
							type: "folder",
							name: "Labs",
							children: [{ type: "url", name: "Lab 3", url: "https://lab.example.edu/3" }],
						},
					],
				},
				{ type: "url", name: "Settings", url: "chrome://settings" },
			],
		},
		other: {
			type: "folder",
			name: "Other",
			children: [{ type: "url", name: "", url: "https://news.ycombinator.com/" }],
		},
		synced: { type: "folder", name: "Mobile", children: [] },
	},
});

// Shaped like Arc's StorableSidebar.json, from the format open-source exporters document: flat id/object lists,
// "pinned" markers, a folder in a folder, an arc:// page, a color, and a Favorites container.
const ARC = JSON.stringify({
	version: 4,
	sidebar: {
		containers: [
			{ global: {} },
			{
				topAppsContainerIDs: [{ default: true }, "fav"],
				spaces: [
					"s1",
					{
						id: "s1",
						title: "Research",
						containerIDs: ["pinned", "p1", "unpinned", "u1"],
						customInfo: { windowTheme: { primaryColorPalette: { midTone: { red: 0.2, green: 0.4, blue: 0.9 } } } },
					},
					"s2",
					{ id: "s2", title: "Fun", newContainerIDs: [{ pinned: {} }, "p2", { unpinned: {} }, "u2"] },
				],
				items: [
					"fav",
					{ id: "fav", childrenIds: ["f1"], data: { itemContainer: { containerType: { topApps: {} } } } },
					"f1",
					{ id: "f1", title: null, data: { tab: { savedURL: "https://mail.example.com/", savedTitle: "Mail" } } },
					"p1",
					{ id: "p1", childrenIds: ["t1", "dir"], data: { itemContainer: {} } },
					"t1",
					{ id: "t1", title: "Paper", parentID: "p1", data: { tab: { savedURL: "https://arxiv.org/abs/1" } } },
					"dir",
					{ id: "dir", title: "Reading", parentID: "p1", childrenIds: ["sub", "arc"], data: { list: {} } },
					"sub",
					{ id: "sub", title: "Later", parentID: "dir", childrenIds: ["t2"], data: { list: {} } },
					"t2",
					{
						id: "t2",
						title: null,
						parentID: "sub",
						data: { tab: { savedURL: "https://example.com/a", savedTitle: "A" } },
					},
					"arc",
					{ id: "arc", title: "Arc page", parentID: "dir", data: { tab: { savedURL: "arc://extensions" } } },
					"p2",
					{ id: "p2", childrenIds: ["t3"], data: { itemContainer: {} } },
					"t3",
					{ id: "t3", title: "Game", parentID: "p2", data: { tab: { savedURL: "https://game.example.com/" } } },
				],
			},
		],
	},
});

describe("Chrome and Edge bookmarks", () => {
	test("the bookmarks bar keeps its folders; Other becomes a folder; empty Mobile and chrome:// pages are skipped", () => {
		const nodes = parseChromeBookmarks(CHROME);
		expect(nodes).toEqual([
			{ kind: "tab", title: "Lit", url: "https://lit.dev/" },
			{
				kind: "folder",
				name: "School",
				children: [
					{ kind: "tab", title: "Canvas", url: "https://canvas.example.edu/" },
					{
						kind: "folder",
						name: "Labs",
						children: [{ kind: "tab", title: "Lab 3", url: "https://lab.example.edu/3" }],
					},
				],
			},
			{
				kind: "folder",
				name: "Other bookmarks",
				children: [{ kind: "tab", title: "https://news.ycombinator.com/", url: "https://news.ycombinator.com/" }],
			},
		]);
		expect(countImported(nodes ?? [])).toBe(4);
	});

	test("bookmarks land as one closed folder at the end of the space, every tab placed once", () => {
		const nodes = parseChromeBookmarks(CHROME) ?? [];
		const state = addImportedFolder(seedState(), "s-home", "Chrome bookmarks", nodes);
		const home = state.spaces.find((s) => s.id === "s-home");
		const folder = home?.pinned.at(-1);
		expect(folder?.kind === "folder" && [folder.name, folder.open, folder.children.length]).toEqual([
			"Chrome bookmarks",
			false,
			3,
		]);
		expect(Object.keys(state.tabs).length).toBe(Object.keys(seedState().tabs).length + 4);
	});

	test("a file that isn't a Bookmarks file is refused", () => {
		expect(parseChromeBookmarks('{"hello": 1}')).toBeNull();
		expect(parseChromeBookmarks("not json")).toBeNull();
	});
});

describe("Arc", () => {
	test("spaces keep their names, color and nested pinned folders; arc:// pages are skipped", () => {
		const arc = parseArcSidebar(ARC);
		expect(arc?.spaces.map((s) => [s.name, s.hue])).toEqual([
			["Research", 223],
			["Fun", null],
		]);
		expect(arc?.spaces[0]?.pinned).toEqual([
			{ kind: "tab", title: "Paper", url: "https://arxiv.org/abs/1" },
			{
				kind: "folder",
				name: "Reading",
				children: [
					{ kind: "folder", name: "Later", children: [{ kind: "tab", title: "A", url: "https://example.com/a" }] },
				],
			},
		]);
		expect(arc?.favorites).toEqual([{ title: "Mail", url: "https://mail.example.com/" }]);
	});

	test("importing adds the spaces and Favorites without moving away from the current space", () => {
		const arc = parseArcSidebar(ARC);
		if (!arc) throw new Error("fixture didn't parse");
		const state = addArcSpaces(seedState(), arc, [200, 30, 150]);
		expect(state.spaces.map((s) => s.name)).toEqual(["Build", "School", "Home", "Research", "Fun"]);
		expect(state.activeSpaceId).toBe("s-build");
		expect(state.essentials.map((id) => state.tabs[id]?.title).at(-1)).toBe("Mail");
		// Importing the same Favorites twice doesn't duplicate them.
		expect(addArcSpaces(state, { spaces: [], favorites: arc.favorites }, [200]).essentials).toEqual(state.essentials);
	});

	test("a file that isn't Arc's sidebar is refused", () => {
		expect(parseArcSidebar(CHROME)).toBeNull();
	});
});
