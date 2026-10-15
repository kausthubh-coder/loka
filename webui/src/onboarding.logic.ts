// The spaces the user made in Loka's setup page (chrome://setup) become the sidebar's spaces. Setup saves them as
// {"version":1,"spaces":[{name, hue, planet}]}; the sidebar applies them once.

import { type BrowserState, createSpace, type SpaceLook, updateSpace } from "../../prototype/src/features/sidebar/sidebar.logic";

const PLANETS = new Set(["ringed", "banded", "ocean", "cratered"]);

/** The spaces in setup's saved value, in the order they were made; [] if it's empty or unreadable. */
export function onboardingSpaces(json: string): SpaceLook[] {
	try {
		const parsed = JSON.parse(json) as { spaces?: unknown };
		if (!Array.isArray(parsed.spaces)) return [];
		return parsed.spaces.flatMap((s): SpaceLook[] => {
			const { name, hue, planet } = (s ?? {}) as Record<string, unknown>;
			if (typeof name !== "string" || !name.trim() || typeof hue !== "number" || !PLANETS.has(String(planet))) {
				return [];
			}
			return [{ name: name.trim(), hue, planet: planet as SpaceLook["planet"] }];
		});
	} catch {
		return [];
	}
}

/**
 * Applies setup's spaces: the first one becomes the space the browser started in (keeping its tabs), the rest are
 * added after it. The first space ends up showing.
 */
export function applyOnboarding(state: BrowserState, spaces: SpaceLook[]): BrowserState {
	const [first, ...rest] = spaces;
	const start = state.spaces[0];
	if (!first || !start) return state;
	let next = updateSpace(state, start.id, first);
	for (const look of rest) [next] = createSpace(next, look);
	return { ...next, activeSpaceId: start.id };
}
