// The Library's line to the browser's history (chrome://history, history.html, Ctrl+H). LokaHistoryHandler answers
// these, not the sidebar's handler: it only knows these messages. Same plumbing as bridge.ts (channel.ts), which the
// Library also uses for the spaces and the downloads.

import { channel } from "./channel";
import type { HistoryEvent, HistoryMessage } from "./messages";

/** One visit to a page, as the browser's history keeps it. */
export interface HistoryItem {
	url: string;
	title: string;
	/** When it was visited, in ms since 1970. */
	time: number;
}

/** A page of history, newest first. `done` says there's nothing older. */
export interface HistoryPage {
	items: HistoryItem[];
	done: boolean;
}

const { ask, tell, on } = channel<HistoryMessage, HistoryEvent>("loka-history");

export const history = {
	/**
	 * Visits whose title or address contains `text` ("" for all), newest first, from before `beforeMs` (0 is now),
	 * at most `maxCount` (up to 200). For the next page, pass the last item's time as `beforeMs`.
	 */
	queryHistory: (text: string, beforeMs: number, maxCount: number) =>
		ask<HistoryPage>("queryHistory", text, beforeMs, maxCount),
	/** Removes every visit to these addresses. The browser then sends history-changed. */
	deleteUrls: (urls: string[]) => tell("deleteUrls", urls),
	/** Removes every visit between the two times (ms since 1970). The browser then sends history-changed. */
	deleteRange: (beginMs: number, endMs: number) => tell("deleteRange", beginMs, endMs),
	/** Opens a page: in this tab, or in a new one (Ctrl+click, middle click). */
	openUrl: (url: string, newTab: boolean) => tell("openUrl", url, newTab),
	/** History changed (something was deleted): query again. */
	onHistoryChanged: (listener: () => void) => on("history-changed", () => listener()),
};

/** Everything the History section can ask of the browser. The prototype's fake (prototype/src/demo/) has this shape. */
export type HistoryBridge = typeof history;
