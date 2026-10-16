// Loka has no new tab page. Ctrl+T, the sidebar's New tab and its + menu open the command bar and make no tab; a tab
// exists once something is picked. A window with nothing to show shows an empty tab (isEmptyTab in live.logic), and
// a window that starts on one opens the bar over it, as Zen does on startup.

import { isEmptyTab } from "../../prototype/src/features/tabs/live.logic";

/** What the command bar starts with for Ctrl+L: the shown page's address, or nothing on an empty tab. */
export function shownAddress(tab: { url: string } | undefined): string {
	return tab && !isEmptyTab(tab.url) ? tab.url : "";
}

/**
 * Whether a window that just opened starts on an empty tab (a new window, a start with nothing to restore), so the
 * command bar opens over it. Null while the tab on screen is still on its way to its first page (about:blank until
 * one commits): the window hasn't shown anything yet.
 */
export function startsEmpty(tabs: readonly { url: string; active: boolean }[]): boolean | null {
	const shown = tabs.find((t) => t.active);
	if (!shown || shown.url === "" || shown.url === "about:blank") return null;
	return isEmptyTab(shown.url);
}
