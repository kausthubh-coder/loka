import { expect, test } from "bun:test";
import { essentialsDropSlots, showEssentialsHint, showPinnedHint } from "./empty-states.logic";
import { createFolder, moveItem } from "./sidebar.logic";
import { seedState } from "./sidebar.seed";

const space = (state: ReturnType<typeof seedState>, id: string) => {
	const found = state.spaces.find((s) => s.id === id);
	if (!found) throw new Error(`no space ${id}`);
	return found;
};

test("empty Essentials take no room until a tab is dragged, then open three slots", () => {
	expect([essentialsDropSlots(0, false), essentialsDropSlots(0, true)]).toEqual([0, 3]);
});

test("Essentials with tiles offer one free cell in an unfinished row while dragging, none in a full one", () => {
	expect([essentialsDropSlots(2, true), essentialsDropSlots(4, true), essentialsDropSlots(5, false)]).toEqual([
		1, 0, 0,
	]);
});

test("the Essentials hint shows once there are three open tabs and no Essentials, until dismissed", () => {
	// The seed's Build has three open tabs; with its Essentials moved out there are none.
	const empty = seedState().essentials.reduce(
		(s, id) => moveItem(s, id, { area: "pinned", spaceId: "s-build", parentId: null, index: 0 }),
		seedState(),
	);
	expect(showEssentialsHint(empty, false)).toBe(true);
	expect(showEssentialsHint(empty, true)).toBe(false);
	expect(showEssentialsHint(seedState(), false)).toBe(false);
	// Home has one open tab: not worth the hint there.
	expect(showEssentialsHint({ ...empty, activeSpaceId: "s-home" }, false)).toBe(false);
});

test("the pinned hint shows only in a space with nothing pinned, not even a folder", () => {
	const state = seedState();
	expect(showPinnedHint(space(state, "s-home"))).toBe(true);
	expect(showPinnedHint(space(state, "s-build"))).toBe(false);
	const [withFolder] = createFolder(state, "s-home", null, "Later");
	expect(showPinnedHint(space(withFolder, "s-home"))).toBe(false);
});
