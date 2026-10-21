import { expect, test } from "bun:test";
import { builtSpaceIds, rowsMoved } from "./lists.logic";
import { activateTab, closeTab, moveItem, navigateTab, openTab, switchSpace, toggleFolder } from "./sidebar.logic";
import { seedState } from "./sidebar.seed";

test("the active space's list and the last one shown stay built, in the spaces' order", () => {
	const school = switchSpace(seedState(0), "s-school");
	expect(builtSpaceIds(school, "s-home")).toEqual(["s-school", "s-home"]);
	expect(builtSpaceIds(school, "s-build")).toEqual(["s-build", "s-school"]);
});

test("before any switch, or after the last space shown was deleted, only the active list is built", () => {
	const state = seedState(0);
	expect(builtSpaceIds(state, null)).toEqual(["s-build"]);
	expect(builtSpaceIds(state, "s-gone")).toEqual(["s-build"]);
});

test("back and forth between two spaces keeps both lists; a third space takes the place of the older one", () => {
	let state = seedState(0);
	let last: string | null = null;
	const go = (id: string) => {
		last = state.activeSpaceId;
		state = switchSpace(state, id);
		return builtSpaceIds(state, last);
	};
	expect(go("s-school")).toEqual(["s-build", "s-school"]);
	expect(go("s-build")).toEqual(["s-build", "s-school"]);
	expect(go("s-home")).toEqual(["s-build", "s-home"]);
});

test("a new title, a shown tab or a folder in another space moves no row", () => {
	const state = seedState(0);
	expect(rowsMoved(state, navigateTab(state, "t-lit", "https://lit.dev/docs/components", "Components"))).toBe(false);
	expect(rowsMoved(state, activateTab(state, "t-lit", 9))).toBe(false);
	expect(rowsMoved(state, toggleFolder(state, "f-game"))).toBe(false);
});

test("a drag, a folder opening, a new or closed tab and a new Essential each move rows", () => {
	const state = seedState(0);
	expect(rowsMoved(state, moveItem(state, "t-hn", { area: "open", spaceId: "s-build", index: 3 }))).toBe(true);
	expect(rowsMoved(state, toggleFolder(state, "f-docs"))).toBe(true);
	expect(rowsMoved(state, openTab(state, "https://example.com", "Example", 0))).toBe(true);
	expect(rowsMoved(state, closeTab(state, "t-arc"))).toBe(true);
	expect(rowsMoved(state, moveItem(state, "t-zen", { area: "essentials", index: 0 }))).toBe(true);
});

test("a tab moved into a folder right above it moves sideways, which counts", () => {
	const state = seedState(0);
	// Build's pinned rows end with the Docs folder's two tabs; the Loka folder holds them all.
	const moved = moveItem(state, "t-lit", { area: "pinned", spaceId: "s-build", parentId: "f-loka", index: 2 });
	expect(rowsMoved(state, moved)).toBe(true);
});
