// The background worker: keeps the browser's real tabs and Loka's spaces in step, both ways.
//
// Two rules keep the two sides from fighting:
// 1. Only a Loka page moves the browser's focus. When the user picks a tab or a space in the sidebar, the browser
//    follows ("ui" passes). When the change came from the browser (a click in its tab strip, a new tab), Loka just
//    records it and never activates anything back ("browser" passes); otherwise late events bounce focus around.
// 2. Every job starts from the saved spaces and saves its change straight away, before any slow browser call, so a
//    Loka page's change that landed in between is never written over. Tab operations only save the runtime links.

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
} from "./live.logic";
import { type Groups, readSession, readState, readUi, STATE_KEY, writeSession, writeState } from "./store";

let live: LiveMap = {};
let groups: Groups = {};
/** The last spaces text this worker wrote, so it can tell its own writes from a Loka page's. */
let written = "";
/** The space the browser was last made to show, to notice when the user switches. */
let shownSpace = "";
let ready: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();

type Pass = "ui" | "browser";

/**
 * Runs one job at a time: `change` updates the freshly read spaces (and the links), it's saved at once, then the
 * browser is brought in line.
 */
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

function asBrowserTab(t: chrome.tabs.Tab): BrowserTab | null {
	if (t.id === undefined || t.id === chrome.tabs.TAB_ID_NONE) return null;
	return {
		id: t.id,
		url: t.pendingUrl ?? t.url ?? "",
		title: t.title ?? "",
		active: t.active,
		groupId: t.groupId,
		openerTabId: t.openerTabId,
		lastAccessed: t.lastAccessed,
	};
}

async function browserTabs(): Promise<BrowserTab[]> {
	const tabs = await chrome.tabs.query({ windowType: "normal" });
	return tabs.flatMap((t) => asBrowserTab(t) ?? []);
}

/** Once per worker start: picks the links back up, or takes over the tabs the browser already has. */
function start(): Promise<void> {
	ready ??= (async () => {
		const saved = await readState();
		const session = await readSession();
		const tabs = await browserTabs();
		let state = saved;
		if (Object.keys(session.live).length) {
			// The worker restarted while the browser kept running: the links still hold, minus closed tabs.
			const alive = new Set(tabs.map((t) => t.id));
			live = Object.fromEntries(Object.entries(session.live).filter(([, id]) => alive.has(id)));
			groups = session.groups;
		} else {
			[state, live] = adoptTabs(saved, tabs, Date.now());
		}
		written = await writeState(state);
		shownSpace = state.activeSpaceId;
		await writeSession({ live, groups });
	})();
	return ready;
}

/** Makes the browser match the spaces. A "browser" pass never changes which tab is showing. */
async function reconcile(state: BrowserState, pass: Pass) {
	const tabs = await browserTabs();
	const known = new Set((await chrome.tabGroups.query({})).map((g) => g.id));
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
	try {
		if (op.op === "create") {
			const made = await chrome.tabs.create({ url: op.url || undefined, active: true });
			if (made.id !== undefined) live = { ...live, [op.tabId]: made.id };
		} else if (op.op === "new-tab") {
			// Opens the command bar page; the tab joins the current space when the browser reports it.
			await chrome.tabs.create({ active: true });
		} else if (op.op === "activate") {
			await chrome.tabs.update(op.browserId, { active: true });
		} else if (op.op === "remove") {
			await chrome.tabs.remove(op.browserId);
		} else if (op.op === "group") {
			const existing = groups[op.spaceId]?.id;
			// The planner never sends an empty list.
			const tabIds = op.browserIds as [number, ...number[]];
			const groupId: number = await chrome.tabs.group(
				existing === undefined ? { tabIds } : { tabIds, groupId: existing },
			);
			await chrome.tabGroups.update(groupId, { title: op.title, color: op.color });
			groups = { ...groups, [op.spaceId]: { id: groupId, collapsed: false } };
		} else if (op.op === "ungroup") {
			await chrome.tabs.ungroup(op.browserIds as [number, ...number[]]);
		} else if (op.op === "collapse") {
			await chrome.tabGroups.update(op.groupId, { collapsed: op.collapsed });
			groups = Object.fromEntries(
				Object.entries(groups).map(([id, g]) => [id, g.id === op.groupId ? { ...g, collapsed: op.collapsed } : g]),
			);
		}
	} catch (error) {
		// A tab can close, or sit in another window, between planning and doing; the next pass catches up.
		console.warn("loka: skipped", op.op, error);
	}
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

chrome.runtime.onInstalled.addListener((details) => {
	void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
	if (details.reason === "install") void chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
	void chrome.alarms.create("archive", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => void serial("browser"));

chrome.tabs.onCreated.addListener((t) => {
	const tab = asBrowserTab(t);
	if (!tab) return;
	void serial("browser", (s) => {
		const [state, next] = tabCreated(s, live, tab, Date.now());
		live = next;
		return state;
	});
});

chrome.tabs.onRemoved.addListener((browserId) => {
	void serial("browser", async (s) => {
		const [state, next] = tabRemoved(s, live, browserId);
		live = next;
		const { media } = await readSession();
		if (media && live[media.tabId] === undefined) await writeSession({ media: null });
		return state;
	});
});

chrome.tabs.onUpdated.addListener((browserId, change, t) => {
	if (!("title" in change || "url" in change || "audible" in change || "mutedInfo" in change)) return;
	const tab = asBrowserTab(t);
	if (!tab) return;
	void serial("browser", async (s) => {
		const lokaId = Object.entries(live).find(([, id]) => id === browserId)?.[0];
		if (lokaId && change.audible) {
			// Something started playing: it becomes the sidebar's now-playing card.
			await writeSession({
				media: { tabId: lokaId, artist: hostOf(tab.url), playing: true, muted: t.mutedInfo?.muted ?? false },
			});
		} else if (lokaId && "mutedInfo" in change) {
			const { media } = await readSession();
			if (media?.tabId === lokaId) await writeSession({ media: { ...media, muted: change.mutedInfo?.muted ?? false } });
		}
		return tabUpdated(s, live, tab);
	});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
	void serial("browser", (s) => tabActivated(s, live, tabId, Date.now()));
});

// A Loka page changed the spaces (a click in the sidebar, the tour, settings): make the browser follow.
chrome.storage.onChanged.addListener((changes, area) => {
	const change = changes[STATE_KEY];
	if (area !== "local" || !change || change.newValue === written) return;
	void serial("ui");
});

// The opt-in archive, once a minute.
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name !== "archive") return;
	void serial("browser", async (s) => {
		const hours = (await readUi()).archiveAfterHours;
		return hours ? archiveStale(s, Date.now(), hours * 60 * 60 * 1000) : s;
	});
});

void serial("browser");
