import { type Platform, platformFrom, shortcutLabel } from "./platform.logic";

/** This computer's platform, read once from the browser. */
export const PLATFORM: Platform = platformFrom(
	(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform,
	navigator.platform,
);

/** A shortcut written the Windows way ("Ctrl+H"), as this computer names it ("⌘H" on a Mac). */
export const keys = (label: string) => shortcutLabel(label, PLATFORM);

/** The key held for Loka's shortcuts, on its own: "⌘" on a Mac, "Ctrl" elsewhere. */
export const MOD = PLATFORM === "mac" ? "⌘" : "Ctrl";
