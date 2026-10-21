import { describe, expect, test } from "bun:test";
import { type SkyMoment, STARS_REST_AFTER_MS, starsMoving } from "./sky.logic";

const shown: SkyMoment = { motion: "while-using", sinceInput: 0, hidden: false, reducedMotion: false };

describe("moving stars: while I'm using Loka (the default)", () => {
	test("the stars drift right after input, and say when they'll stop", () => {
		expect(starsMoving({ ...shown, sinceInput: 0 })).toEqual({ moving: true, changesIn: 15_000 });
		expect(starsMoving({ ...shown, sinceInput: 9_000 })).toEqual({ moving: true, changesIn: 6_000 });
	});

	test("they stop 15 s after the last input, and only input starts them again", () => {
		expect(STARS_REST_AFTER_MS).toBe(15_000);
		expect(starsMoving({ ...shown, sinceInput: 15_000 })).toEqual({ moving: false, changesIn: null });
		expect(starsMoving({ ...shown, sinceInput: 3_600_000 })).toEqual({ moving: false, changesIn: null });
	});
});

describe("moving stars: always", () => {
	test("they never stop on their own while the window shows, however long since input", () => {
		expect(starsMoving({ ...shown, motion: "always", sinceInput: 0 })).toEqual({ moving: true, changesIn: null });
		expect(starsMoving({ ...shown, motion: "always", sinceInput: 3_600_000 })).toEqual({
			moving: true,
			changesIn: null,
		});
	});
});

describe("moving stars: off", () => {
	test("they stay still, even right after input", () => {
		expect(starsMoving({ ...shown, motion: "off", sinceInput: 0 })).toEqual({ moving: false, changesIn: null });
	});
});

describe("every mode stops", () => {
	const modes = ["while-using", "always", "off"] as const;

	test("while the window is hidden or minimised", () => {
		for (const motion of modes) {
			expect(starsMoving({ ...shown, motion, hidden: true })).toEqual({ moving: false, changesIn: null });
		}
	});

	test("when the system asks for reduced motion", () => {
		for (const motion of modes) {
			expect(starsMoving({ ...shown, motion, reducedMotion: true })).toEqual({ moving: false, changesIn: null });
		}
	});
});
