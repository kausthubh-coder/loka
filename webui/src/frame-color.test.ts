import { expect, test } from "bun:test";
import { frameColor, hslToHex } from "./frame-color.logic";

test("converts HSL to hex like CSS does", () => {
	expect(hslToHex(0, 1, 0.5)).toBe("#ff0000");
	expect(hslToHex(120, 1, 0.25)).toBe("#008000");
	expect(hslToHex(240, 1, 0.5)).toBe("#0000ff");
	expect(hslToHex(0, 0, 1)).toBe("#ffffff");
});

test("a dark space's frame is the deep end of its sky; a light one is a pale wash of the same hue", () => {
	expect(frameColor(270, "dark")).toBe("#1a1122");
	expect(frameColor(270, "light")).toBe("#e0d4ed");
	// Different spaces get different frames.
	expect(frameColor(150, "dark")).not.toBe(frameColor(270, "dark"));
});
