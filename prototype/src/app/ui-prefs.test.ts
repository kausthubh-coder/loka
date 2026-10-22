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

	test("archiving runs after 12 hours unless changed; 0 turns it off", () => {
		expect(parseUiPrefs(null).archiveAfterHours).toBe(12);
		expect(parseUiPrefs('{"archiveAfterHours": 24}').archiveAfterHours).toBe(24);
		expect(parseUiPrefs('{"archiveAfterHours": 0}').archiveAfterHours).toBe(0);
		expect(parseUiPrefs('{"archiveAfterHours": -5}').archiveAfterHours).toBe(12);
		// Off used to be saved as null, back when archiving was off by default.
		expect(parseUiPrefs('{"archiveAfterHours": null}').archiveAfterHours).toBe(12);
	});

	test("other spaces' tabs unload after 30 minutes out of sight unless changed; 0 never", () => {
		expect(parseUiPrefs(null).sleepAfterMinutes).toBe(30);
		expect(parseUiPrefs('{"sleepAfterMinutes": 120}').sleepAfterMinutes).toBe(120);
		expect(parseUiPrefs('{"sleepAfterMinutes": 0}').sleepAfterMinutes).toBe(0);
		expect(parseUiPrefs('{"sleepAfterMinutes": "soon"}').sleepAfterMinutes).toBe(30);
	});

	test("autoplay keeps a known mode and falls back to blocking until a click", () => {
		expect(parseUiPrefs(null).autoplay).toBe("block");
		expect(parseUiPrefs('{"autoplay": "block-audible"}').autoplay).toBe("block-audible");
		expect(parseUiPrefs('{"autoplay": "allow"}').autoplay).toBe("allow");
		expect(parseUiPrefs('{"autoplay": "always"}').autoplay).toBe("block");
	});
});
