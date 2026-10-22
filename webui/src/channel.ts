// The one line between a Loka page and the browser's message handlers. chrome.send carries a request, the browser
// answers through cr.webUIResponse and pushes news through cr.webUIListenerCallback. A page can talk to more than one
// handler (the Library at chrome://history has the History handler and the sidebar's), so window.cr is installed once,
// here, and bridge.ts and history-bridge.ts each name their own messages on top of it.

declare global {
	interface Window {
		cr: {
			webUIResponse(id: string, ok: boolean, value: unknown): void;
			webUIListenerCallback(event: string, ...args: unknown[]): void;
		};
	}
}

/** WebUI's chrome.send, which the extension typings (also loaded in this repo) don't describe. */
const send = (message: string, args: unknown[]) =>
	(globalThis as unknown as { chrome: { send(message: string, args: unknown[]): void } }).chrome.send(message, args);

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

/**
 * Requests and events limited to one handler's names. `prefix` starts each request's callback id, so a page's
 * requests can be told apart in a trace.
 */
export function channel<M extends string, E extends string>(prefix: string) {
	return {
		/** A request the browser answers. */
		ask<T>(message: M, ...args: unknown[]): Promise<T> {
			const id = `${prefix}-${nextId++}`;
			return new Promise((resolve) => {
				pending.set(id, resolve as (value: unknown) => void);
				send(message, [id, ...args]);
			});
		},
		/** A request with no answer. */
		tell(message: M, ...args: unknown[]) {
			send(message, args);
		},
		/** Listens for news the browser pushes; returns what stops listening. */
		on(event: E, listener: (...args: unknown[]) => void): () => void {
			const set = listeners.get(event) ?? new Set();
			listeners.set(event, set);
			set.add(listener);
			return () => set.delete(listener);
		},
	};
}
