import { expect, test } from "bun:test";
import { type Hold, type HoldReason, holdChanged, NO_HOLD } from "./hold.logic";

/** Plays reasons coming and going, and lists what the browser is told. */
function told(steps: [HoldReason, boolean][]): boolean[] {
	let hold: Hold = NO_HOLD;
	const sent: boolean[] = [];
	for (const [reason, on] of steps) {
		const step = holdChanged(hold, reason, on);
		hold = step.hold;
		if (step.send !== null) sent.push(step.send);
	}
	return sent;
}

test("a menu opening holds the sidebar open and closing it lets go", () => {
	expect(
		told([
			["menu", true],
			["menu", false],
		]),
	).toEqual([true, false]);
});

test("overlapping reasons hold until the last one ends, telling the browser once each way", () => {
	expect(
		told([
			["input", true],
			["menu", true],
			["input", false],
			["drag", true],
			["menu", false],
			["drag", false],
		]),
	).toEqual([true, false]);
});

test("the same reason twice, or a reason ending that never started, tells the browser nothing new", () => {
	expect(
		told([
			["drag", true],
			["drag", true],
			["menu", false],
			["drag", false],
			["drag", false],
		]),
	).toEqual([true, false]);
});
