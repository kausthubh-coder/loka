// The spaces the user made in Loka's setup page (chrome://setup) become the sidebar's spaces. Setup saves them as
// {"version":1,"spaces":[{name, hue, planet}]}; the sidebar applies them once.

import type { Intent } from "../../prototype/src/features/sidebar/intents.logic";
import { type BrowserState, newId, type SpaceLook } from "../../prototype/src/features/sidebar/sidebar.logic";

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
 * What applying setup's spaces asks of the browser: the first one becomes the space the browser started in (keeping
 * its tabs), the rest are added after it, and the first ends up showing. Intents, so a tab the browser takes in
 * meanwhile isn't written over.
 */
export function onboardingIntents(state: BrowserState, spaces: SpaceLook[], makeId = newId): Intent[] {
	const [first, ...rest] = spaces;
	const start = state.spaces[0];
	if (!first || !start) return [];
	return [
		{ op: "updateSpace", spaceId: start.id, look: first },
		...rest.map((look): Intent => ({ op: "createSpace", look, id: makeId() })),
		{ op: "switchSpace", spaceId: start.id },
	];
}
