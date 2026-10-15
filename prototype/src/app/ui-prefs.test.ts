import { describe, expect, test } from "bun:test";
import { DEFAULT_UI, parseUiPrefs } from "./ui-prefs.logic";

describe("window preferences", () => {
	test("a first launch gets the defaults, with onboarding still to do", () => {
		expect(parseUiPrefs(null)).toEqual(DEFAULT_UI);
		expect(parseUiPrefs(null).onboarded).toBe(false);
	});

	test("a saved width outside the limits is pulled back inside them", () => {
		expect(parseUiPrefs('{"sidebarWidth": 900}').sidebarWidth).toBe(420);
		expect(parseUiPrefs('{"sidebarWidth": 40}').sidebarWidth).toBe(220);
	});

	test("bad fields fall back one by one, good ones are kept", () => {
		expect(parseUiPrefs('{"sidebarSide": "top", "sidebarHidden": true, "onboarded": "yes"}')).toEqual({
			...DEFAULT_UI,
			sidebarHidden: true,
		});
		expect(parseUiPrefs("{ broken")).toEqual(DEFAULT_UI);
	});

	test("archiving is off unless a positive number of hours was saved", () => {
		expect(parseUiPrefs(null).archiveAfterHours).toBeNull();
		expect(parseUiPrefs('{"archiveAfterHours": 24}').archiveAfterHours).toBe(24);
		expect(parseUiPrefs('{"archiveAfterHours": -5}').archiveAfterHours).toBeNull();
	});
});
