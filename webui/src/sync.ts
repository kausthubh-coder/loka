// Keeps this window's real tabs and Loka's spaces in step, both ways. The sidebar page runs it for its own window.
//
// Two rules keep the two sides from fighting:
// 1. Only Loka moves the browser's focus. When the user picks a tab or a space in the sidebar, the browser follows
//    ("ui" passes). When the change came from the browser (a click on a page link, a new tab), Loka just records it
//    and never activates anything back ("browser" passes); otherwise late events bounce focus around.
// 2. Every job starts from the saved spaces and saves its change straight away, before any slow browser call, so a
//    change that landed in between (from another window's sidebar) is never written over.

import { archiveStale, type BrowserState } from "../../prototype/src/features/sidebar/sidebar.logic";
import {
	adoptTabs,
	type BrowserTab,
	type LiveMap,
	type Op,
	planReconcile,
	tabActivated,
	tabCreated,
	tabRemoved,
	tabUpdated,
} from "../../prototype/src/features/tabs/live.logic";
import { browser, type NativeTab } from "./bridge";
import { type Groups, readState, readUi, writeSession, writeState } from "./store";

let live: LiveMap = {};
let groups: Groups = {};
/** The last spaces text this window wrote, so it can tell its own writes from another window's. */
let written = "";
/** The space the browser was last made to show, to notice when the user switches. */
let shownSpace = "";
let started: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();
/** The tabs as last seen, to turn each new snapshot into created, removed, updated and activated. */
let seen = new Map<number, NativeTab>();
/** This window, as far as the planner cares: every tab here shares it. */
const WINDOW = 1;

type Pass = "ui" | "browser";

function serial(pass: Pass, change: (state: BrowserState) => BrowserState | Promise<BrowserState> = (s) => s) {
	queue = queue
		.then(() => start())
		.then(async () => {
			const before = await readState();
			const state = await change(before);
			if (state !== before) written = await writeState(state);
			await reconcile(state, pass);
		})
		.catch((error) => console.error("loka:", error));
	return queue;
}

function asBrowserTab(t: NativeTab): BrowserTab {
	return {
		id: t.id,
		url: t.url,
		title: t.title,
		active: t.active,
		groupId: t.groupId,
		windowId: WINDOW,
		openerTabId: t.openerId,
		lastAccessed: t.lastAccessed,
	};
}

function start(): Promise<void> {
	started ??= (async () => {
		const saved = await readState();
		const tabs = await browser.tabs();
		see(tabs);
		let state: BrowserState;
		[state, live] = adoptTabs(saved, tabs.map(asBrowserTab), Date.now());
		written = await writeState(state);
		shownSpace = state.activeSpaceId;
		await writeSession({ live, groups });
	})();
	return started;
}

function see(tabs: NativeTab[]) {
	seen = new Map(tabs.map((t) => [t.id, t]));
}

async function reconcile(state: BrowserState, pass: Pass) {
	const tabs = (await browser.tabs()).map(asBrowserTab);
	const known = new Set((await browser.groups()).map((g) => g.id));
	groups = Object.fromEntries(Object.entries(groups).filter(([, g]) => known.has(g.id)));
	const switched = pass === "ui" && shownSpace !== state.activeSpaceId;
	shownSpace = state.activeSpaceId;
	const ops = planReconcile(state, live, tabs, groups, switched).filter(
		(op) => pass === "ui" || (op.op !== "activate" && op.op !== "create" && op.op !== "new-tab"),
	);
	for (const op of ops) await run(op);
	await writeSession({ live, groups });
}

async function run(op: Op) {
	if (op.op === "create") {
		const made = await browser.createTab(op.url, true);
		if (made !== null) live = { ...live, [op.tabId]: made };
	} else if (op.op === "new-tab") {
		await browser.createTab("", true);
	} else if (op.op === "activate") {
		browser.activateTab(op.browserId);
	} else if (op.op === "remove") {
		browser.closeTab(op.browserId);
	} else if (op.op === "group") {
		const existing = groups[op.key]?.id ?? -1;
		const groupId = await browser.groupTabs(op.browserIds, existing);
		if (groupId === null) return;
		browser.updateGroup(groupId, { title: op.title, color: op.color });
		groups = { ...groups, [op.key]: { id: groupId, collapsed: false, title: op.title, color: op.color } };
	} else if (op.op === "look") {
		browser.updateGroup(op.groupId, { title: op.title, color: op.color });
		const record = groups[op.key];
		if (record) groups = { ...groups, [op.key]: { ...record, title: op.title, color: op.color } };
	} else if (op.op === "ungroup") {
		browser.ungroupTabs(op.browserIds);
	} else if (op.op === "collapse") {
		browser.updateGroup(op.groupId, { collapsed: op.collapsed });
		groups = Object.fromEntries(
			Object.entries(groups).map(([id, g]) => [id, g.id === op.groupId ? { ...g, collapsed: op.collapsed } : g]),
		);
	}
}

/** Turns a fresh snapshot of the window's tabs into the events the model understands. */
function onTabs(tabs: NativeTab[]) {
	const before = seen;
	see(tabs);
	for (const t of tabs) {
		const old = before.get(t.id);
		if (!old) {
			void serial("browser", (s) => {
				const [state, next] = tabCreated(s, live, asBrowserTab(t), Date.now());
				live = next;
				return state;
			});
			continue;
		}
		if (old.title !== t.title || old.url !== t.url) {
			void serial("browser", (s) => tabUpdated(s, live, asBrowserTab(t)));
		}
		if (t.active && !old.active) void serial("browser", (s) => tabActivated(s, live, t.id, Date.now()));
	}
	for (const id of before.keys()) {
		if (seen.has(id)) continue;
		void serial("browser", (s) => {
			const [state, next] = tabRemoved(s, live, id);
			live = next;
			return state;
		});
	}
}

/** Starts the sync for this window. `changedHere` is told when the sidebar's own edits have been written. */
export function startSync() {
	browser.onTabsChanged(onTabs);
	void serial("browser");
	// The opt-in archive, once a minute.
	window.setInterval(() => {
		void serial("browser", async (s) => {
			const hours = (await readUi()).archiveAfterHours;
			return hours ? archiveStale(s, Date.now(), hours * 60 * 60 * 1000) : s;
		});
	}, 60_000);
}

/** The sidebar changed the spaces: make the browser follow. Changes this window wrote itself are skipped. */
export function spacesChanged(json: string | null) {
	if (json !== null && json === written) return;
	void serial("ui");
}

/** The browser tab showing a Loka tab right now, if it's loaded. */
export function browserTabOf(lokaTabId: string): number | undefined {
	return live[lokaTabId];
}

/** Which browser tab shows each loaded Loka tab. */
export function linkedTabs(): LiveMap {
	return live;
}
