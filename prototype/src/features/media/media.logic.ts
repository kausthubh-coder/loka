import type { NativeMedia } from "../../../../webui/src/bridge";

/**
 * Which media session the now-playing card shows: never the tab already on screen (its page has its own controls),
 * and something playing before something paused. While the tab on screen plays, only other playing media shows: a
 * paused tab elsewhere isn't what you're listening to. Among equals, the browser's order.
 */
export function nowPlaying(media: NativeMedia[] | null, shownTabId: number | undefined): NativeMedia | null {
	const all = media ?? [];
	const shownPlays = all.some((m) => m.tabId === shownTabId && m.playing);
	const elsewhere = all.filter((m) => m.tabId !== shownTabId);
	return elsewhere.find((m) => m.playing) ?? (shownPlays ? null : (elsewhere[0] ?? null));
}
