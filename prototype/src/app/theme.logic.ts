import type { SpaceScheme } from "../features/sidebar/sidebar.logic";

export type Scheme = "light" | "dark";

/** The scheme a space shows: its own choice, or the computer's when it follows the system. */
export function resolveScheme(scheme: SpaceScheme, systemDark: boolean): Scheme {
	if (scheme === "system") return systemDark ? "dark" : "light";
	return scheme;
}
