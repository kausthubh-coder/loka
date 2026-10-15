import { expect, test } from "bun:test";
import { SWIPE_GAP, SWIPE_IDLE, type SwipeState, swipeWheel, type WheelSample } from "./swipe.logic";

// Event streams shaped like a Windows precision touchpad's: fingers at 125 Hz (8 ms), momentum at 60 Hz (16 ms)
// slowing by about 8% a frame.

/** Sideways deltas `every` ms apart, starting at `from`. */
const moves = (from: number, every: number, deltas: number[], dy = 0): WheelSample[] =>
	deltas.map((dx, i) => ({ dx, dy, time: from + i * every }));

/** A trackpad's momentum after the fingers lift: `count` frames slowing from `speed`. */
const momentum = (from: number, speed: number, count: number, sign = 1): WheelSample[] =>
	Array.from({ length: count }, (_, i) => ({ dx: sign * Math.round(speed * 0.92 ** i), dy: 0, time: from + i * 16 }));

const HARD_FINGERS = [4, 12, 30, 55, 80, 90, 85, 70];

/** Feeds a stream through and lists the turns it made. */
function turns(samples: WheelSample[]): number[] {
	let state: SwipeState = SWIPE_IDLE;
	const made: number[] = [];
	for (const sample of samples) {
		const step = swipeWheel(state, sample);
		state = step.state;
		if (step.turn) made.push(step.turn);
	}
	return made;
}

const last = (samples: WheelSample[]) => samples.at(-1)?.time ?? 0;

test("one hard swipe, momentum and all, turns exactly one space", () => {
	const fingers = moves(0, 8, HARD_FINGERS);
	expect(turns([...fingers, ...momentum(last(fingers) + 16, 60, 45)])).toEqual([1]);
});

test("a hard swipe back turns one space back", () => {
	const fingers = moves(
		0,
		8,
		HARD_FINGERS.map((d) => -d),
	);
	expect(turns([...fingers, ...momentum(last(fingers) + 16, 60, 45, -1)])).toEqual([-1]);
});

test("two quick swipes turn two spaces: the second touch stops the first one's momentum", () => {
	const first = moves(0, 8, HARD_FINGERS);
	const tail = momentum(last(first) + 16, 60, 10);
	// Fingers back on the pad: momentum stops, and 60 ms later the second swipe starts slow and speeds up.
	const second = moves(last(tail) + 60, 8, [3, 8, 18, 35, 60, 80, 70]);
	expect(turns([...first, ...tail, ...second, ...momentum(last(second) + 16, 60, 40)])).toEqual([1, 1]);
});

test("two quick swipes without momentum, 120 ms apart, turn two spaces", () => {
	const first = moves(0, 8, HARD_FINGERS);
	const second = moves(last(first) + 120, 8, HARD_FINGERS);
	expect(turns([...first, ...second])).toEqual([1, 1]);
});

test("a swipe forward then straight back turns forward then back", () => {
	const first = moves(0, 8, HARD_FINGERS);
	const tail = momentum(last(first) + 16, 60, 8);
	const back = moves(last(tail) + 70, 8, [-3, -9, -20, -40, -70, -80]);
	expect(turns([...first, ...tail, ...back])).toEqual([1, -1]);
});

test("a slow drag across the pad turns one space however far it goes", () => {
	expect(turns(moves(0, 16, Array(150).fill(2)))).toEqual([1]);
});

test("the list follows a short swipe, and a pause starts the next one from rest", () => {
	let state: SwipeState = SWIPE_IDLE;
	const offsets: number[] = [];
	const short = moves(0, 16, [10, 10, 10, 10]);
	for (const sample of [...short, ...moves(last(short) + SWIPE_GAP + 40, 16, [10, 10, 10])]) {
		const step = swipeWheel(state, sample);
		expect(step.turn).toBe(0);
		expect(step.claimed).toBe(true);
		state = step.state;
		offsets.push(step.offset);
	}
	expect(offsets).toEqual([10, 20, 30, 40, 10, 20, 30]);
});

test("a vertical scroll with a little sideways drift scrolls the list and never turns", () => {
	const drift = moves(0, 16, Array(40).fill(3), 24);
	let state: SwipeState = SWIPE_IDLE;
	for (const sample of drift) {
		const step = swipeWheel(state, sample);
		expect(step).toMatchObject({ turn: 0, offset: 0, claimed: false });
		state = step.state;
	}
	// The scroll's last frames are sideways-only jitter: still the same scroll.
	const jitter = moves(last(drift) + 16, 16, [5, 6, 4, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6]);
	expect(turns([...drift, ...jitter])).toEqual([]);
});

test("after a quiet gap a new swipe turns again, even a slow one", () => {
	const first = moves(0, 8, HARD_FINGERS);
	const slow = moves(last(first) + SWIPE_GAP + 10, 16, Array(40).fill(2));
	expect(turns([...first, ...slow])).toEqual([1, 1]);
});

test("events the page coalesced while busy don't read as a second swipe", () => {
	// Just after the switch the page is busy for 100 ms: that movement arrives as one big event.
	const fingers = [...moves(0, 8, [4, 12, 30, 55, 80]), { dx: 900, dy: 0, time: 132 }];
	const rest = moves(140, 8, [90, 85, 70]);
	expect(turns([...fingers, ...rest, ...momentum(last(rest) + 16, 60, 45)])).toEqual([1]);
});

test("uneven momentum frames don't read as a second swipe", () => {
	const fingers = moves(0, 8, HARD_FINGERS);
	const tail = momentum(last(fingers) + 16, 60, 45).map((s, i) => (i % 5 === 4 ? { ...s, time: s.time - 12 } : s));
	expect(turns([...fingers, ...tail])).toEqual([1]);
});

test("a page busy for 200 ms just after the switch hands over the movement late, and that is the same swipe", () => {
	const fingers = moves(0, 8, [4, 12, 30, 55]);
	// The switch keeps the page busy: the next 200 ms of fingers and momentum arrive as one event.
	const late = { dx: 520, dy: 0, time: last(fingers) + 200 };
	expect(turns([...fingers, late, ...momentum(late.time + 16, 40, 30)])).toEqual([1]);
});

test("wheel events delivered slowly, 50 to 200 ms apart, still make one turn per swipe", () => {
	// What a drive over the debugging protocol delivers: the right deltas, at a fraction of the rate.
	const times = [0, 52, 99, 149, 188, 294, 499, 682, 880, 1052, 1190, 1292, 1382, 1479, 1567, 1649];
	const deltas = [4, 12, 30, 55, 80, 90, 85, 70, 60, 55, 51, 47, 43, 40, 36, 33];
	expect(turns(times.map((time, i) => ({ dx: deltas[i] ?? 0, dy: 0, time })))).toEqual([1]);
});
