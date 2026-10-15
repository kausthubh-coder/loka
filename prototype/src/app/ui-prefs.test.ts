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
		expect(parseUiPrefs('{"sidebarSide": "top", "sound": false, "onboarded": "yes"}')).toEqual({
			...DEFAULT_UI,
			sound: false,
		});
		expect(parseUiPrefs("{ broken")).toEqual(DEFAULT_UI);
	});

	test("sounds are on at half volume until turned off; a saved volume stays between 0 and 1", () => {
		expect([parseUiPrefs(null).sound, parseUiPrefs(null).soundVolume]).toEqual([true, 0.5]);
		expect(parseUiPrefs('{"sound": false, "soundVolume": 0.2}')).toEqual({
			...DEFAULT_UI,
			sound: false,
			soundVolume: 0.2,
		});
		expect(parseUiPrefs('{"soundVolume": 3}').soundVolume).toBe(1);
		expect(parseUiPrefs('{"soundVolume": "loud"}').soundVolume).toBe(0.5);
	});

	test("archiving is off unless a positive number of hours was saved", () => {
		expect(parseUiPrefs(null).archiveAfterHours).toBeNull();
		expect(parseUiPrefs('{"archiveAfterHours": 24}').archiveAfterHours).toBe(24);
		expect(parseUiPrefs('{"archiveAfterHours": -5}').archiveAfterHours).toBeNull();
	});

	test("the Essentials hint stays dismissed once it was, and only then", () => {
		expect(parseUiPrefs(null).essentialsHintDismissed).toBe(false);
		expect(parseUiPrefs('{"essentialsHintDismissed": true}').essentialsHintDismissed).toBe(true);
		expect(parseUiPrefs('{"essentialsHintDismissed": "yes"}').essentialsHintDismissed).toBe(false);
	});
});
