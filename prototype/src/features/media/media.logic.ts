import type { NativeMedia } from "../../../../webui/src/bridge";

/**
 * Which media session the now-playing card shows: never the tab already on screen (its page has its own controls),
 * and something playing before something paused. Among equals, the browser's order.
 */
export function nowPlaying(media: NativeMedia[] | null, shownTabId: number | undefined): NativeMedia | null {
	const elsewhere = (media ?? []).filter((m) => m.tabId !== shownTabId);
	return elsewhere.find((m) => m.playing) ?? elsewhere[0] ?? null;
}
