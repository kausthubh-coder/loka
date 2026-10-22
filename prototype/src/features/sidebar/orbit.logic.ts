// The space switch: the orbit turns (the v1 mockup's). The horizon's big planet and its two neighbours are three
// places on one orbit. Switching turns it: the planet you were on shrinks into the neighbour place it now belongs in,
// while the one you picked grows out of its place until its surface fills the horizon. Nothing disappears; every
// planet travels to where it belongs next. These are the paths, as keyframes of transform and opacity only, so the
// compositor runs them and the sidebar's own layout never changes during a switch.

/** Timing. A switch is as frequent as a tab change, so it can't make anyone wait: the list is there on the first
 * frame and the orbit is decoration over it. A switch within `repeatMs` of the last runs `fast`, so a quick flick
 * through spaces keeps up. The leaving planet lands at `leaveEnd` of the way, before the arriving one, which starts
 * `lag` late: an exit shouldn't hold up the entrance. */
export const ORBIT = { duration: 380, fast: 200, repeatMs: 250, lag: 0.06, leaveEnd: 0.8 };

/** The horizon's drawing of the big planet (`.world`): a 360 px box whose top is 36 px down, the body 92% of it. */
const WORLD_TOP = 36;
const WORLD = 360;
const RADIUS = (WORLD / 2) * 0.92;
/** A neighbour (`.neighbour`): a 22 px planet 22 px in from the side, 20 px down. */
const NEIGHBOUR = 22;
const NEIGHBOUR_INSET = 22;
const NEIGHBOUR_TOP = 20;

export type OrbitPlace = "horizon" | "left" | "right" | "offLeft" | "offRight";

/** A planet's place: the body's centre across, its top edge, and its scale against the big planet's drawing. */
export interface OrbitPoint {
	x: number;
	top: number;
	s: number;
	/** Past the horizon's edge: the planet fades on the way there. */
	off: boolean;
}

/** Where each place is in a horizon `width` px wide. */
export function orbitPoint(place: OrbitPlace, width: number): OrbitPoint {
	if (place === "horizon") return { x: width / 2, top: WORLD_TOP + WORLD / 2 - RADIUS, s: 1, off: false };
	const s = NEIGHBOUR / WORLD;
	const top = NEIGHBOUR_TOP + NEIGHBOUR / 2 - RADIUS * s;
	const centre = NEIGHBOUR_INSET + NEIGHBOUR / 2;
	const x = { left: centre, right: width - centre, offLeft: -centre, offRight: width + centre }[place];
	return { x, top, s, off: place === "offLeft" || place === "offRight" };
}

// Close to cubic-bezier(0.23, 1, 0.32, 1): almost all its work in the first third.
const snappy = (u: number) => 1 - (1 - u) ** 5;
const easeOut = (u: number) => 1 - (1 - u) ** 3;
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const smooth = (a: number, b: number, u: number) => {
	const x = clamp01((u - a) / (b - a));
	return x * x * (3 - 2 * x);
};

interface PathPoint {
	/** The body's centre and scale. */
	x: number;
	y: number;
	s: number;
	/** The whole planet's opacity. */
	o: number;
	/** How much of the horizon's drawing shows; the round drawing takes over as it shrinks. */
	h: number;
}

/** A point between two places. Size changes exponentially, as a camera's zoom does; the top edge moves with it. */
function between(a: OrbitPoint, b: OrbitPoint, ux: number, us: number) {
	const s = a.s * (b.s / a.s) ** us;
	const top = a.top + (b.top - a.top) * us;
	return { x: a.x + (b.x - a.x) * ux, y: top + RADIUS * s, s };
}

/** Leaving the horizon: it shrinks faster than it travels sideways, so the path curves like an orbit. */
export function leavePath(end: OrbitPoint, width: number): (t: number) => PathPoint {
	const start = orbitPoint("horizon", width);
	return (t) => {
		const u = clamp01(t / ORBIT.leaveEnd);
		const us = snappy(u);
		return {
			...between(start, end, easeOut(u), us),
			o: end.off ? 1 - smooth(0.4, 1, u) : 1,
			h: 1 - smooth(0.02, 0.35, us),
		};
	};
}

/** Arriving at the horizon: it swings in sideways faster than it grows, then settles. */
export function arrivePath(start: OrbitPoint, width: number): (t: number) => PathPoint {
	const end = orbitPoint("horizon", width);
	return (t) => {
		const u = clamp01((t - ORBIT.lag) / (1 - ORBIT.lag));
		const us = easeOut(u);
		return { ...between(start, end, snappy(u), us), o: start.off ? smooth(0, 0.3, u) : 1, h: smooth(0.4, 0.85, us) };
	};
}

/**
 * A path as keyframes, `steps` + 1 of them: the stand-in planet's move (moved from where the big planet sits) and
 * fade, and the crossfade between its horizon drawing and its round one.
 */
export function orbitFrames(path: (t: number) => PathPoint, width: number, steps = 48) {
	const home = orbitPoint("horizon", width);
	const centreY = home.top + RADIUS;
	const body: Keyframe[] = [];
	const horizon: Keyframe[] = [];
	const round: Keyframe[] = [];
	for (let k = 0; k <= steps; k++) {
		const offset = k / steps;
		const p = path(offset);
		body.push({
			offset,
			transform: `translate3d(${(p.x - home.x).toFixed(2)}px, ${(p.y - centreY).toFixed(2)}px, 0) scale(${p.s.toFixed(4)})`,
			opacity: p.o,
		});
		horizon.push({ offset, opacity: p.h });
		round.push({ offset, opacity: Math.min(1, 2 * (1 - p.h)) });
	}
	return { body, horizon, round };
}
