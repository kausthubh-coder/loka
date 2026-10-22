// When the sky's stars drift. Settings > Appearance > Moving stars picks the mode; whether the window shows, the
// system's reduced motion and the time since the last input in the window decide the moment.

import type { StarMotion } from "./ui-prefs.logic";

/** "While I'm using Loka": the stars stop this long after the last pointer, key or wheel input in the window. */
export const STARS_REST_AFTER_MS = 15_000;

export interface SkyMoment {
	motion: StarMotion;
	/** Milliseconds since the last pointer, key or wheel input in the window. */
	sinceInput: number;
	/** The window is minimised or covered: the page's document.visibilityState is "hidden". */
	hidden: boolean;
	/** The system asks for less motion (prefers-reduced-motion: reduce). */
	reducedMotion: boolean;
}

/**
 * Whether the stars move at this moment, and in how many milliseconds that changes by itself if no input or
 * visibility change comes first (null: only an event can change it).
 */
export function starsMoving(moment: SkyMoment): { moving: boolean; changesIn: number | null } {
	if (moment.motion === "off" || moment.hidden || moment.reducedMotion) return { moving: false, changesIn: null };
	if (moment.motion === "always") return { moving: true, changesIn: null };
	const left = STARS_REST_AFTER_MS - moment.sinceInput;
	return left > 0 ? { moving: true, changesIn: left } : { moving: false, changesIn: null };
}
