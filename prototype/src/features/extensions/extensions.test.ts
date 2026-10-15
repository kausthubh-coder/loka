import { expect, test } from "bun:test";
import type { NativeExtension } from "../../../../webui/src/bridge";
import { badgeText, toolbarExtensions, withPinned } from "./extensions.logic";

const ext = (id: string, pinned: boolean): NativeExtension => ({
	id,
	name: id,
	icon: "data:image/png;base64,",
	badge: "",
	badgeColor: "",
	pinned,
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
