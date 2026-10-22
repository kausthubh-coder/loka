import { expect, test } from "bun:test";
import { essentialsDropSlots } from "./empty-states.logic";

test("empty Essentials take no room until a tab is dragged, then open three slots", () => {
	expect([essentialsDropSlots(0, false), essentialsDropSlots(0, true)]).toEqual([0, 3]);
});

test("Essentials with tiles offer one free cell in an unfinished row while dragging, none in a full one", () => {
	expect([essentialsDropSlots(2, true), essentialsDropSlots(4, true), essentialsDropSlots(5, false)]).toEqual([
		1, 0, 0,
	]);
});

test("full Essentials offer no slot, even with an unfinished row (an import can bring more than 12)", () => {
	expect([essentialsDropSlots(11, true), essentialsDropSlots(12, true), essentialsDropSlots(13, true)]).toEqual([
		1, 0, 0,
	]);
});
