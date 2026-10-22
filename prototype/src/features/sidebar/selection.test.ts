import { describe, expect, test } from "bun:test";
import {
	essentialsNotice,
	inSidebarOrder,
	NO_SELECTION,
	pruneSelection,
	selectableLists,
	selectRange,
	stepWithin,
	toggleSelected,
} from "./selection.logic";
import { closeTab, moveItem, switchSpace, toggleFolder } from "./sidebar.logic";
import { seedState } from "./sidebar.seed";

const seed = seedState();
const lists = selectableLists(seed);
const isTab = (id: string) => seed.tabs[id] !== undefined;

describe("what can be picked", () => {
	test("Build's visible pinned rows (folders too) and its open tabs, as two lists", () => {
		expect(lists).toEqual([
			["f-loka", "t-helium", "f-docs", "t-chromium", "t-lit"],
			["t-hn", "t-arc", "t-zen"],
		]);
	});

	test("a closed folder's tabs aren't in the list", () => {
		expect(selectableLists(switchSpace(seed, "s-school"))).toEqual([["t-canvas", "f-csc281", "f-game"], []]);
	});
});

describe("Ctrl+click", () => {
	test("adds tabs in the order clicked and counts the next run from the last", () => {
		const two = toggleSelected(toggleSelected(NO_SELECTION, "t-zen"), "t-hn");
		expect(two).toEqual({ ids: ["t-zen", "t-hn"], anchor: "t-hn" });
	});

	test("a second Ctrl+click takes a tab back out", () => {
		const one = toggleSelected(toggleSelected(toggleSelected(NO_SELECTION, "t-zen"), "t-hn"), "t-zen");
		expect(one).toEqual({ ids: ["t-hn"], anchor: "t-zen" });
	});
});

describe("Shift+click and Shift+arrow", () => {
	test("picks the run from the anchor, passing over folders", () => {
		const from = toggleSelected(NO_SELECTION, "t-helium");
		expect(selectRange(from, lists, isTab, "t-lit", null)).toEqual({
			ids: ["t-helium", "t-chromium", "t-lit"],
			anchor: "t-helium",
		});
	});

	test("upwards picks the same run", () => {
		const from = toggleSelected(NO_SELECTION, "t-zen");
		expect(selectRange(from, lists, isTab, "t-hn", null).ids).toEqual(["t-hn", "t-arc", "t-zen"]);
	});

	test("with no anchor yet it counts from the tab shown when that's in the same list", () => {
		expect(selectRange(NO_SELECTION, lists, isTab, "t-lit", "t-helium")).toEqual({
			ids: ["t-helium", "t-chromium", "t-lit"],
			anchor: "t-helium",
		});
	});

	test("with nothing picked any more, an old anchor doesn't count", () => {
		const emptied = toggleSelected(toggleSelected(NO_SELECTION, "t-hn"), "t-hn");
		expect(selectRange(emptied, lists, isTab, "t-zen", "t-arc")).toEqual({ ids: ["t-arc", "t-zen"], anchor: "t-arc" });
	});

	test("an anchor in the other list doesn't count: the run starts at the row clicked", () => {
		const pinnedAnchor = toggleSelected(NO_SELECTION, "t-helium");
		expect(selectRange(pinnedAnchor, lists, isTab, "t-arc", "t-helium")).toEqual({ ids: ["t-arc"], anchor: "t-arc" });
	});

	test("a row that isn't showing changes nothing", () => {
		const from = toggleSelected(NO_SELECTION, "t-hn");
		expect(selectRange(from, lists, isTab, "t-canvas", null)).toBe(from);
	});

	test("Shift+arrow steps within one list and stops at its ends", () => {
		expect([
			stepWithin(lists, "t-helium", 1),
			stepWithin(lists, "t-lit", 1),
			stepWithin(lists, "t-hn", -1),
			stepWithin(lists, "t-arc", -1),
			stepWithin(lists, "t-x", 1),
		]).toEqual(["f-docs", null, null, "t-hn", null]);
	});
});

describe("after the spaces change", () => {
	const picked = { ids: ["t-zen", "t-lit", "t-hn"], anchor: "t-hn" };

	test("a closed tab leaves the selection, and the anchor with it", () => {
		const next = closeTab(seed, "t-hn", 1);
		expect(pruneSelection(picked, selectableLists(next))).toEqual({ ids: ["t-zen", "t-lit"], anchor: null });
	});

	test("tabs hidden by closing their folder leave it", () => {
		expect(pruneSelection(picked, selectableLists(toggleFolder(seed, "f-docs"))).ids).toEqual(["t-zen", "t-hn"]);
	});

	test("switching space empties it", () => {
		expect(pruneSelection(picked, selectableLists(switchSpace(seed, "s-home")))).toEqual(NO_SELECTION);
	});

	test("a tab that moved within the space stays picked, and nothing changed is the same object", () => {
		const pinned = moveItem(seed, "t-zen", { area: "pinned", spaceId: "s-build", parentId: null, index: 0 });
		expect(pruneSelection(picked, selectableLists(pinned))).toBe(picked);
	});

	test("menu actions take the picked tabs in sidebar order, not the order picked", () => {
		expect(inSidebarOrder(picked, lists)).toEqual(["t-lit", "t-hn", "t-zen"]);
	});
});

describe("what Add to Essentials says", () => {
	test("nothing when every tab fit", () => {
		expect(essentialsNotice(3, 3)).toBeNull();
	});

	test("how many fit and how many didn't", () => {
		expect([essentialsNotice(3, 2), essentialsNotice(5, 1)]).toEqual([
			"Added 2. Essentials have room for 12, so 1 tab didn't fit.",
			"Added 1. Essentials have room for 12, so 4 tabs didn't fit.",
		]);
	});

	test("full Essentials say so", () => {
		expect(essentialsNotice(1, 0)).toBe("Essentials have room for 12. Remove one first.");
	});
});
