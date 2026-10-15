import { expect, test } from "bun:test";
import { seedState } from "../sidebar/sidebar.seed";
import { applyTour } from "./onboarding.logic";

test("the tour renames the first spaces, adds one more, keeps the rest, and lands on the first", () => {
	const start = { ...seedState(), activeSpaceId: "s-home" };
	const state = applyTour(start, {
		worlds: [
			{ name: "Code", hue: 260, planet: "cratered" },
			{ name: "Class", hue: 30, planet: "banded" },
		],
		bookmarks: [],
		arc: null,
	});
	expect(state.spaces.map((s) => s.name)).toEqual(["Code", "Class", "Home"]);
	expect(state.activeSpaceId).toBe("s-build");
});

test("imported bookmarks become a closed folder in the first space", () => {
	const state = applyTour(seedState(), {
		worlds: [],
		bookmarks: [{ name: "Chrome bookmarks", nodes: [{ kind: "tab", title: "Lit", url: "https://lit.dev/" }] }],
		arc: null,
	});
	const last = state.spaces[0]?.pinned.at(-1);
	expect(last?.kind === "folder" && [last.name, last.open]).toEqual(["Chrome bookmarks", false]);
});
