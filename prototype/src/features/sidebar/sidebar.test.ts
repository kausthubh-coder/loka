import { describe, expect, test } from "bun:test";
import {
	activeTab,
	closeTab,
	countTabs,
	createFolder,
	createSpace,
	exportState,
	findFolder,
	focusOrOpen,
	folderHolds,
	importState,
	moveItem,
	openTab,
	pinnedRows,
	switchSpace,
	ungroupFolder,
	updateSpace,
} from "./sidebar.logic";
import { seedState } from "./sidebar.seed";

const space = (state: ReturnType<typeof seedState>, id: string) => {
	const found = state.spaces.find((s) => s.id === id);
	if (!found) throw new Error(`no space ${id}`);
	return found;
};

// Rows as "depth:name" so a whole tree can be compared in one assertion.
const outline = (state: ReturnType<typeof seedState>, spaceId: string) =>
	pinnedRows(space(state, spaceId).pinned).map(
		(r) => `${r.depth}:${r.node.kind === "folder" ? r.node.name : state.tabs[r.node.id]?.title}`,
	);

describe("folders inside folders", () => {
	test("a new folder inside a nested folder shows at the right depth", () => {
		const [state] = createFolder(seedState(), "s-build", "f-docs", "Build logs");
		expect(outline(state, "s-build")).toEqual([
			"0:Loka",
			"1:imputnet/helium-windows",
			"1:Docs",
			"2:Chromium: Windows build guide",
			"2:Lit docs",
			"2:Build logs",
		]);
	});

	test("an open tab dragged into a nested folder leaves the open list", () => {
		const state = moveItem(seedState(), "t-hn", { area: "pinned", spaceId: "s-build", parentId: "f-docs", index: 0 });
		expect(space(state, "s-build").open).toEqual(["t-arc", "t-zen"]);
		expect(outline(state, "s-build")).toContain("2:Hacker News");
	});

	test("a folder can't be dropped inside its own subfolder", () => {
		const before = seedState();
		const after = moveItem(before, "f-loka", { area: "pinned", spaceId: "s-build", parentId: "f-docs", index: 0 });
		expect(after).toBe(before);
	});

	test("a folder can't become an essential or an open tab", () => {
		const before = seedState();
		expect(moveItem(before, "f-docs", { area: "essentials", index: 0 })).toBe(before);
		expect(moveItem(before, "f-docs", { area: "open", spaceId: "s-build", index: 0 })).toBe(before);
	});

	test("a whole folder moves to another space with everything inside it", () => {
		const state = moveItem(seedState(), "f-docs", { area: "pinned", spaceId: "s-home", parentId: null, index: 0 });
		expect(outline(state, "s-home")).toEqual(["0:Docs", "1:Chromium: Windows build guide", "1:Lit docs"]);
		expect(outline(state, "s-build")).toEqual(["0:Loka", "1:imputnet/helium-windows"]);
	});

	test("ungrouping a folder keeps its tabs where the folder was", () => {
		const state = ungroupFolder(seedState(), "f-docs");
		expect(outline(state, "s-build")).toEqual([
			"0:Loka",
			"1:imputnet/helium-windows",
			"1:Chromium: Windows build guide",
			"1:Lit docs",
		]);
	});

	test("closed folders hide their insides", () => {
		expect(outline(seedState(), "s-school")).toEqual(["0:Canvas: CSC 281", "0:CSC 281", "1:Game project"]);
	});

	test("a folder knows when a tab sits inside it, at any depth", () => {
		const pinned = space(seedState(), "s-school").pinned;
		const csc = findFolder(pinned, "f-csc281");
		const game = findFolder(pinned, "f-game");
		if (!csc || !game) throw new Error("seed folders missing");
		expect([folderHolds(csc, "t-gdd"), folderHolds(game, "t-gdd"), folderHolds(game, "t-mail")]).toEqual([
			true,
			true,
			false,
		]);
	});
});

describe("reordering", () => {
	test("moving a tab down the same list lands where it was dropped", () => {
		// Dropped between t-arc (1) and t-zen (2), counted before the move.
		const state = moveItem(seedState(), "t-hn", { area: "open", spaceId: "s-build", index: 2 });
		expect(space(state, "s-build").open).toEqual(["t-arc", "t-hn", "t-zen"]);
	});

	test("pinning an essential moves it out of essentials", () => {
		const state = moveItem(seedState(), "t-yt", { area: "pinned", spaceId: "s-home", parentId: null, index: 0 });
		expect(state.essentials).toEqual(["t-mail", "t-cal", "t-gh"]);
		expect(outline(state, "s-home")).toEqual(["0:YouTube"]);
	});
});

describe("tabs and spaces", () => {
	test("each space remembers its own active tab", () => {
		const state = switchSpace(seedState(), "s-school");
		expect(activeTab(state)?.title).toBe("Canvas: CSC 281");
		expect(activeTab(switchSpace(state, "s-build"))?.title).toBe("imputnet/helium-windows");
	});

	test("a new tab opens at the top of the active space and becomes active", () => {
		const state = openTab(seedState(), "https://lit.dev/playground", "Lit playground");
		expect(state.tabs[space(state, "s-build").open[0] ?? ""]?.title).toBe("Lit playground");
		expect(activeTab(state)?.title).toBe("Lit playground");
	});

	test("closing the active open tab activates its neighbour and deletes it", () => {
		const start = moveItem(seedState(), "t-arc", { area: "open", spaceId: "s-build", index: 0 });
		const active = {
			...start,
			spaces: start.spaces.map((s) => (s.id === "s-build" ? { ...s, activeTabId: "t-arc" } : s)),
		};
		const state = closeTab(active, "t-arc");
		expect(space(state, "s-build").open).toEqual(["t-hn", "t-zen"]);
		expect(activeTab(state)?.title).toBe("Hacker News");
		expect(state.tabs["t-arc"]).toBeUndefined();
	});

	test("a new space has the chosen look, starts empty, and becomes active", () => {
		const [state, id] = createSpace(seedState(), { name: "Music", hue: 330, planet: "cratered" });
		const made = space(state, id);
		expect([made.name, made.hue, made.planet, made.pinned, made.open]).toEqual(["Music", 330, "cratered", [], []]);
		expect(state.activeSpaceId).toBe(id);
	});

	test("editing a space changes its look and keeps its tabs", () => {
		const state = updateSpace(seedState(), "s-home", { name: "  Weekend ", hue: 260, planet: "ringed" });
		const home = space(state, "s-home");
		expect([home.name, home.hue, home.planet, home.open]).toEqual(["Weekend", 260, "ringed", ["t-music"]]);
		expect(updateSpace(seedState(), "s-home", { name: "   ", hue: 260, planet: "ringed" })).toEqual(seedState());
	});

	test("opening Settings twice goes back to the first Settings tab, even from another space", () => {
		const once = focusOrOpen(seedState(), "loka://settings", "Settings");
		const elsewhere = switchSpace(once, "s-home");
		const twice = focusOrOpen(elsewhere, "loka://settings", "Settings");
		const settingsTabs = Object.values(twice.tabs).filter((t) => t.url === "loka://settings");
		expect(settingsTabs.length).toBe(1);
		expect(twice.activeSpaceId).toBe("s-build");
		expect(activeTab(twice)?.title).toBe("Settings");
	});

	test("a space's tab count includes tabs in closed and nested folders, not Essentials", () => {
		// School: one pinned tab, two inside the closed Game project folder, no open tabs.
		expect(countTabs(space(seedState(), "s-school"))).toBe(3);
	});

	test("closing a pinned tab keeps it pinned", () => {
		const state = closeTab(seedState(), "t-helium");
		expect(outline(state, "s-build")).toContain("1:imputnet/helium-windows");
		expect(activeTab(state)).toBeNull();
	});
});

describe("export and import", () => {
	test("an exported file imports back to the same state", () => {
		const state = moveItem(seedState(), "t-hn", { area: "pinned", spaceId: "s-build", parentId: "f-docs", index: 1 });
		expect(importState(exportState(state))).toEqual(state);
	});

	test("a file that places one tab twice is rejected", () => {
		const broken = seedState();
		broken.essentials.push("t-hn");
		expect(importState(exportState(broken))).toBeNull();
	});

	test("a file from before planets imports with the first planet style", () => {
		const old = JSON.parse(exportState(seedState()));
		for (const s of old.spaces) delete s.planet;
		expect(importState(JSON.stringify(old))?.spaces.map((s) => s.planet)).toEqual(["banded", "banded", "banded"]);
	});

	test("a file with an unknown planet style is rejected", () => {
		const bad = JSON.parse(exportState(seedState()));
		bad.spaces[0].planet = "square";
		expect(importState(JSON.stringify(bad))).toBeNull();
	});

	test("a file that isn't JSON is rejected", () => {
		expect(importState("{ not json")).toBeNull();
	});
});
