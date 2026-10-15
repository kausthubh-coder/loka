// Loka's History page's line to the browser. The page is chrome://history (history.html, Ctrl+H), a normal tab
// page with its own handler, not the sidebar's: it only knows these messages. Same plumbing as bridge.ts:
// chrome.send carries a request, the browser answers through cr.webUIResponse and pushes news through
// cr.webUIListenerCallback. Load this or bridge.ts on a page, never both: each installs window.cr.

declare global {
	interface Window {
		cr: {
			webUIResponse(id: string, ok: boolean, value: unknown): void;
			webUIListenerCallback(event: string, ...args: unknown[]): void;
		};
	}
}

const send = (message: string, args: unknown[]) =>
	(globalThis as unknown as { chrome: { send(message: string, args: unknown[]): void } }).chrome.send(message, args);

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

const pending = new Map<string, (value: unknown) => void>();
const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
let nextId = 0;

window.cr = {
	webUIResponse(id, _ok, value) {
		pending.get(id)?.(value);
		pending.delete(id);
	},
	webUIListenerCallback(event, ...args) {
		for (const listener of listeners.get(event) ?? []) listener(...args);
	},
};

function ask<T>(message: string, ...args: unknown[]): Promise<T> {
	const id = `loka-history-${nextId++}`;
	return new Promise((resolve) => {
		pending.set(id, resolve as (value: unknown) => void);
		send(message, [id, ...args]);
	});
}

function tell(message: string, ...args: unknown[]) {
	send(message, args);
}

function on(event: string, listener: (...args: unknown[]) => void): () => void {
	const set = listeners.get(event) ?? new Set();
	listeners.set(event, set);
	set.add(listener);
	return () => set.delete(listener);
}

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

/** Everything the History page can ask of the browser. The prototype's fake (prototype/src/demo/) has this shape. */
export type HistoryBridge = typeof history;
