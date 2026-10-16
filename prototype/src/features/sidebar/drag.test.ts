import { expect, test } from "bun:test";
import { autoScrollStep, dropModeAt } from "./drag.logic";

test("a drop goes before or after a row by which half the pointer is in", () => {
	expect(dropModeAt(0.1, null, true)).toEqual({ mode: "before", grouping: false });
	expect(dropModeAt(0.6, null, true)).toEqual({ mode: "after", grouping: false });
});

test("the middle half of a folder puts the item inside it", () => {
	expect(dropModeAt(0.3, "folder", true)).toEqual({ mode: "into", grouping: false });
	expect(dropModeAt(0.7, "folder", false)).toEqual({ mode: "into", grouping: false });
	expect(dropModeAt(0.2, "folder", true)).toEqual({ mode: "before", grouping: false });
	expect(dropModeAt(0.8, "folder", true)).toEqual({ mode: "after", grouping: false });
});

test("a tab dropped on the middle of a tab makes a folder of the two; a folder dropped there doesn't", () => {
	expect(dropModeAt(0.5, "tab", true)).toEqual({ mode: "into", grouping: true });
	expect(dropModeAt(0.5, "tab", false)).toEqual({ mode: "after", grouping: false });
	expect(dropModeAt(0.25, "tab", true)).toEqual({ mode: "before", grouping: false });
});

test("the list scrolls near its edges, faster closer to them, and not in between", () => {
	expect(autoScrollStep(300, 100, 600)).toBe(0);
	expect(autoScrollStep(130, 100, 600)).toBe(-2);
	expect(autoScrollStep(100, 100, 600)).toBe(-12);
	expect(autoScrollStep(40, 100, 600)).toBe(-16);
	expect(autoScrollStep(594, 100, 600)).toBe(10);
});
