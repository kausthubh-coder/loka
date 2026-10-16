/**
 * Switching spaces with a sideways two-finger swipe. One swipe turns at most one space, however hard it is, and a
 * second swipe straight after it turns one more.
 *
 * The browser only sends wheel events (no touch phases), so a gesture is read from their timing. A swipe is the
 * stream of sideways wheel events from the first one after a pause. Once it has gone far enough to switch, the rest
 * of it is spent: the fingers carrying on and the trackpad's momentum afterwards change nothing. It ends after a
 * quiet gap, or when it has slowed right down and then speeds up again, which is a new swipe: momentum only ever
 * slows, and a touch on the pad stops momentum, so the next swipe starts slow after a break and accelerates.
 * Speeds are pixels per millisecond over the time since the last event, so events the page coalesced while it was
 * busy (one event for several frames' movement) read as the same speed, not as a jump. For the same reason a gap
 * only counts as quiet if little moved across it: a page busy for 200 ms just after switching hands over all that
 * movement in one late event, which is the same swipe carrying on, not a new one. "Slowed right down" has to last a
 * moment and "speeds up" two events in a row, so one uneven event can't split a swipe in two.
 */

/** Sideways pixels a swipe goes before it switches; the list follows the fingers until then. */
export const SWIPE_DISTANCE = 60;
/** No wheel events for this long ends a gesture... */
export const SWIPE_GAP = 160;
/** ...when less than this moved across the gap (px/ms), so it was a pause and not a busy page. */
const QUIET_SPEED = 0.1;
/** A spent swipe has slowed down once it's below this share of its top speed. */
const SETTLED = 0.25;
/** How long a spent swipe must have been slow before speeding up again can start a new one (ms). */
const SLOW_FOR = 20;
/** After slowing down, two events in a row at this speed (px/ms) and twice the slowest start a new swipe. */
const NEW_SWIPE_SPEED = 0.5;
/** The furthest the list is drawn sideways while following the fingers. */
const MAX_OFFSET = 90;

export interface SwipeState {
	/**
	 * idle: no gesture. x: a sideways swipe that hasn't switched yet. y: a vertical scroll, whose small sideways
	 * movement is ignored until it ends. spent: a swipe that has switched; the rest of it is ignored.
	 */
	phase: "idle" | "x" | "y" | "spent";
	/** Sideways distance so far in an x swipe; negative is towards the previous space. */
	distance: number;
	/** When the gesture's last wheel event came (ms). */
	last: number;
	/** When its last sideways event came, for speed. */
	lastX: number;
	/** The spent swipe's top speed (px/ms). */
	peak: number;
	/** The slowest it has gone since it slowed down; Infinity until it has. */
	low: number;
	/** How long it has gone slowly, in total (ms). */
	slowFor: number;
	/** Events in a row since then that were fast enough to be a new swipe. */
	rising: number;
}

export const SWIPE_IDLE: SwipeState = {
	phase: "idle",
	distance: 0,
	last: 0,
	lastX: 0,
	peak: 0,
	low: Infinity,
	slowFor: 0,
	rising: 0,
};

export interface WheelSample {
	dx: number;
	dy: number;
	/** The event's timestamp (ms). */
	time: number;
}

export interface SwipeStep {
	state: SwipeState;
	/** Switch one space forward (1) or back (-1), or not (0). */
	turn: 1 | -1 | 0;
	/** How far to draw the list sideways (px, following the fingers), 0 when it should rest. */
	offset: number;
	/** Whether the event belongs to a sideways swipe, so the page shouldn't also scroll with it. */
	claimed: boolean;
}

const offsetOf = (distance: number) => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, distance));

/** A sideways swipe starting with this event. */
function startX(sample: WheelSample): SwipeStep {
	return advanceX({ ...SWIPE_IDLE, phase: "x", last: sample.time, lastX: sample.time }, sample);
}

/** An x swipe moves on by one event, and switches once it has gone far enough. */
function advanceX(state: SwipeState, sample: WheelSample): SwipeStep {
	const distance = state.distance + sample.dx;
	if (Math.abs(distance) >= SWIPE_DISTANCE) {
		const speed = Math.abs(sample.dx) / Math.max(sample.time - state.lastX, 4);
		return {
			state: { ...SWIPE_IDLE, phase: "spent", last: sample.time, lastX: sample.time, peak: speed },
			turn: distance > 0 ? 1 : -1,
			offset: 0,
			claimed: true,
		};
	}
	return {
		state: { ...state, distance, last: sample.time, lastX: sample.time },
		turn: 0,
		offset: offsetOf(distance),
		claimed: true,
	};
}

/** What one wheel event does to the gesture. */
export function swipeWheel(state: SwipeState, sample: WheelSample): SwipeStep {
	const sideways = Math.abs(sample.dx) > Math.abs(sample.dy);
	const gap = sample.time - state.last;
	const moved = state.phase === "y" ? Math.abs(sample.dy) : Math.abs(sample.dx);
	const current = gap >= SWIPE_GAP && moved / gap < QUIET_SPEED ? SWIPE_IDLE : state;

	if (current.phase === "idle") {
		if (sideways) return startX(sample);
		if (sample.dy === 0) return { state: current, turn: 0, offset: 0, claimed: false };
		return { state: { ...SWIPE_IDLE, phase: "y", last: sample.time }, turn: 0, offset: 0, claimed: false };
	}
	if (current.phase === "y") {
		return { state: { ...current, last: sample.time }, turn: 0, offset: 0, claimed: false };
	}
	// Mostly-vertical events inside a sideways swipe keep it alive and do nothing else.
	if (!sideways) {
		const offset = current.phase === "x" ? offsetOf(current.distance) : 0;
		return { state: { ...current, last: sample.time }, turn: 0, offset, claimed: true };
	}
	if (current.phase === "x") return advanceX(current, sample);

	// Spent: ignore it all unless a new swipe starts.
	const dt = Math.max(sample.time - current.lastX, 4);
	const speed = Math.abs(sample.dx) / dt;
	const next = { ...current, last: sample.time, lastX: sample.time };
	const slowed = current.low !== Infinity;
	if (slowed && current.slowFor >= SLOW_FOR && speed >= NEW_SWIPE_SPEED && speed >= 2 * current.low) {
		if (current.rising >= 1) return startX(sample);
		return { state: { ...next, rising: current.rising + 1 }, turn: 0, offset: 0, claimed: true };
	}
	if (speed < SETTLED * current.peak) {
		next.low = Math.min(current.low, speed);
		next.slowFor = current.slowFor + dt;
	} else if (!slowed) next.peak = Math.max(current.peak, speed);
	next.rising = 0;
	return { state: next, turn: 0, offset: 0, claimed: true };
}
