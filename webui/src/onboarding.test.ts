import { expect, test } from "bun:test";
import { firstState } from "../../prototype/src/features/tabs/live.logic";
import { applyOnboarding, onboardingSpaces } from "./onboarding.logic";

const saved = JSON.stringify({
	version: 1,
	spaces: [
		{ name: "Work", hue: 200, planet: "ringed" },
		{ name: " School ", hue: 30, planet: "banded" },
		{ name: "Home", hue: 150, planet: "ocean" },
	],
});

test("reads setup's spaces in order, trimming names", () => {
	expect(onboardingSpaces(saved)).toEqual([
		{ name: "Work", hue: 200, planet: "ringed" },
		{ name: "School", hue: 30, planet: "banded" },
		{ name: "Home", hue: 150, planet: "ocean" },
	]);
});

test("skips spaces with no name or an unknown planet, and unreadable values", () => {
	const mixed = JSON.stringify({
		spaces: [
			{ name: "", hue: 200, planet: "ringed" },
			{ name: "Ok", hue: 90, planet: "moon" },
			{ name: "Kept", hue: 90, planet: "cratered" },
		],
	});
	expect(onboardingSpaces(mixed)).toEqual([{ name: "Kept", hue: 90, planet: "cratered" }]);
	expect(onboardingSpaces("not json")).toEqual([]);
	expect(onboardingSpaces("")).toEqual([]);
});

test("the first setup space replaces the starting space and keeps its tabs; the rest follow it", () => {
	const start = firstState();
	const startId = start.activeSpaceId;
	const withTab = {
		...start,
		tabs: { t1: { id: "t1", url: "https://example.com/", title: "Example", lastActiveAt: 1 } },
		spaces: start.spaces.map((s) => ({ ...s, open: ["t1"], activeTabId: "t1" })),
	};
	const after = applyOnboarding(withTab, onboardingSpaces(saved));
	expect(after.spaces.map((s) => [s.name, s.hue, s.planet])).toEqual([
		["Work", 200, "ringed"],
		["School", 30, "banded"],
		["Home", 150, "ocean"],
	]);
	expect(after.spaces[0]?.id).toBe(startId);
	expect(after.spaces[0]?.open).toEqual(["t1"]);
	expect(after.activeSpaceId).toBe(startId);
});

test("no setup spaces leaves the sidebar as it was", () => {
	const start = firstState();
	expect(applyOnboarding(start, [])).toEqual(start);
});
