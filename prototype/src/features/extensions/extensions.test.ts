import { expect, test } from "bun:test";
import type { NativeExtension } from "../../../../webui/src/bridge";
import { contrast, type Rgb } from "../../app/theme.logic";
import {
	badgeBackground,
	badgeInk,
	badgeText,
	extensionMenuItems,
	toolbarExtensions,
	withPinned,
} from "./extensions.logic";

const ext = (id: string, pinned: boolean): NativeExtension => ({
	id,
	name: id,
	icon: "data:image/png;base64,",
	badge: "",
	badgeColor: "",
	pinned,
	hasOptions: false,
});

test("the toolbar shows up to three pinned extensions, in order", () => {
	const list = [ext("a", true), ext("b", false), ext("c", true), ext("d", true), ext("e", true)];
	expect(toolbarExtensions(list).map((x) => x.id)).toEqual(["a", "c", "d"]);
	expect(toolbarExtensions(null)).toEqual([]);
});

test("pinning shows at once, before the browser answers", () => {
	const list = [ext("a", false), ext("b", true)];
	expect(withPinned(list, "a", true).map((x) => x.pinned)).toEqual([true, true]);
	expect(withPinned(list, "b", false).map((x) => x.pinned)).toEqual([false, false]);
});

test("a badge keeps at most four characters", () => {
	expect([badgeText("12"), badgeText(" 1234567 "), badgeText("")]).toEqual(["12", "1234", ""]);
});

test("a badge's text is white or black, whichever reads better on the extension's color", () => {
	// GitHub's green (Refined GitHub's badge) is 3.2:1 under white, 6.5:1 under black.
	expect(badgeInk("#2da44e")).toBe("#000");
	// The browser sends rgb() with spaces; an older form has commas.
	expect(badgeInk("rgb(45 164 78)")).toBe("#000");
	expect(badgeInk("rgb(255, 235, 59)")).toBe("#000");
	// Chrome's grey default and red stay white.
	expect(badgeInk("#5f6368")).toBe("#fff");
	expect(badgeInk("#d93025")).toBe("#fff");
	expect(badgeInk("#00f")).toBe("#fff");
	// No color: the badge is the grey default.
	expect(badgeBackground("")).toBe("#5f6368");
	expect(badgeInk(badgeBackground(""))).toBe("#fff");
});

test("the badge's text keeps 4.5:1 on every color (white or black always can)", () => {
	const short: string[] = [];
	for (let r = 0; r <= 255; r += 51) {
		for (let g = 0; g <= 255; g += 51) {
			for (let b = 0; b <= 255; b += 51) {
				const ink: Rgb = badgeInk(`rgb(${r} ${g} ${b})`) === "#fff" ? [255, 255, 255] : [0, 0, 0];
				if (contrast(ink, [r, g, b]) < 4.5) short.push(`rgb(${r} ${g} ${b})`);
			}
		}
	}
	expect(short).toEqual([]);
});

test("an extension's menu offers what it has: Options only with an options page", () => {
	const labels = (x: NativeExtension) => extensionMenuItems(x).map((i) => `${i.action}:${i.label}`);
	expect(labels({ ...ext("a", true), hasOptions: true })).toEqual([
		"unpin:Unpin from address bar",
		"options:Options",
		"manage:Manage extension",
		"remove:Remove from Loka…",
	]);
	expect(labels(ext("b", false))).toEqual([
		"pin:Pin to address bar",
		"manage:Manage extension",
		"remove:Remove from Loka…",
	]);
});
