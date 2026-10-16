// Which computer Loka runs on, for what the page draws: macOS keeps its window buttons (the traffic lights) at the
// top left and names shortcuts with ⌘, Windows and Linux draw their own buttons on the right and say Ctrl.

export type Platform = "mac" | "windows" | "linux";

/**
 * The platform from what the browser says: navigator.userAgentData.platform ("macOS", "Windows", "Linux") where it
 * exists, else the older navigator.platform ("MacIntel", "Win32", "Linux x86_64").
 */
export function platformFrom(userAgentDataPlatform: string | undefined, navigatorPlatform: string): Platform {
	const name = (userAgentDataPlatform || navigatorPlatform).toLowerCase();
	if (name.startsWith("mac")) return "mac";
	if (name.startsWith("win")) return "windows";
	return "linux";
}

/** macOS's order for modifier symbols: Control, Option, Shift, Command. */
const MAC_ORDER = "⌃⌥⇧⌘";

/**
 * A shortcut as written for Windows ("Ctrl+H", "Ctrl Shift F", "Ctrl 1 to 9"), as this platform names it. On a Mac
 * Ctrl is ⌘, Alt is ⌥ and Shift is ⇧, written together in macOS's order before the key: "⇧⌘F".
 */
export function shortcutLabel(label: string, platform: Platform): string {
	if (platform !== "mac") return label;
	const symbols: Record<string, string> = { Ctrl: "⌘", Alt: "⌥", Shift: "⇧" };
	const replaced = label.replace(/\b(Ctrl|Alt|Shift)[+ ]/g, (_, key: string) => symbols[key] ?? key);
	return replaced.replace(/[⌃⌥⇧⌘]{2,}/g, (run) =>
		[...run].sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b)).join(""),
	);
}
