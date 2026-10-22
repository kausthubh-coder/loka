import { describe, expect, test } from "bun:test";
import { activateTab, activeTab, closeTab, switchSpace, updateSpace } from "../sidebar/sidebar.logic";
import { seedState } from "../sidebar/sidebar.seed";
import {
	adoptTabs,
	type BrowserTab,
	firstState,
	groupColor,
	homeOf,
	planReconcile,
	tabActivated,
	tabCreated,
	tabRemoved,
	tabUpdated,
} from "./live.logic";

const NOW = Date.UTC(2026, 9, 15, 3, 0);
const tab = (id: number, url: string, extra: Partial<BrowserTab> = {}): BrowserTab => ({
	id,
	url,
	title: url,
	active: false,
	groupId: -1,
	windowId: 1,
	...extra,
});
const titles = (state: ReturnType<typeof seedState>, ids: string[]) => ids.map((id) => state.tabs[id]?.title);

describe("when Loka starts, it takes over the browser's tabs", () => {
	test("tabs are matched by address; new ones join the current space; open tabs with no browser tab are dropped", () => {
		const browser = [
			tab(11, "https://github.com/imputnet/helium-windows"),
			tab(12, "https://news.ycombinator.com"),
			tab(13, "https://example.org/", { title: "Example", active: true }),
		];
		const [state, live] = adoptTabs(seedState(NOW), browser, NOW);
		expect([live["t-helium"], live["t-hn"]]).toEqual([11, 12]);
		const build = state.spaces.find((s) => s.id === "s-build");
		expect(titles(state, build?.open ?? [])).toEqual(["Example", "Hacker News"]);
		expect(activeTab(state)?.title).toBe("Example");
		// Home's open Lo-fi tab had no browser tab, so it's gone; pinned and Essentials stay.
		expect(state.spaces.find((s) => s.id === "s-home")?.open).toEqual([]);
		expect(state.essentials).toEqual(seedState().essentials);
	});

	test("a tab still on its way to its first page waits; once it has one it joins, unless it's an empty tab", () => {
		// A new window's tab says about:blank until chrome://newtab commits; taken in now, it would flash as a row.
		const [state, live] = adoptTabs(firstState(), [tab(3, "about:blank", { active: true })], NOW);
		expect([state.spaces[0]?.open, live]).toEqual([[], {}]);
		expect(tabUpdated(state, live, tab(3, "chrome://loka-newtab/", { active: true }), NOW)).toEqual([state, live]);
		const [later, linked] = tabUpdated(state, live, tab(3, "https://a.example/", { active: true }), NOW);
		expect(later.spaces[0]?.open.map((id) => later.tabs[id]?.url)).toEqual(["https://a.example/"]);
		expect(Object.values(linked)).toEqual([3]);
	});

	test("after a restart a tab takes the Loka tab it saved, not the first at its address", () => {
		// Two browser tabs on Hacker News; the second showed the sidebar's Hacker News row before the restart.
		const [state, live] = adoptTabs(
			seedState(NOW),
			[
				tab(31, "https://news.ycombinator.com"),
				tab(32, "https://news.ycombinator.com", { title: "Hacker News", lokaId: "t-hn" }),
				tab(33, "https://zen-browser.app/download", { title: "Download Zen", lokaId: "t-zen" }),
			],
			NOW,
		);
		expect(live["t-hn"]).toBe(32);
		expect(live["t-zen"]).toBe(33);
		expect(state.tabs["t-zen"]).toMatchObject({ url: "https://zen-browser.app/download", title: "Download Zen" });
		// The other Hacker News tab is a new open tab in the current space.
		const build = state.spaces.find((s) => s.id === "s-build");
		expect(titles(state, build?.open ?? [])).toEqual(["https://news.ycombinator.com", "Hacker News", "Download Zen"]);
	});

	test("a first launch starts with one space holding every open browser tab", () => {
		const [state, live] = adoptTabs(firstState(), [tab(1, "https://a.example/"), tab(2, "https://b.example/")], NOW);
		const opened = state.spaces.map((s) => ({ name: s.name, open: s.open.map((id) => state.tabs[id]?.url) }));
		expect(opened).toEqual([{ name: "Personal", open: ["https://b.example/", "https://a.example/"] }]);
		const linked = Object.entries(live).map(([lokaId, browserId]) => [state.tabs[lokaId]?.url, browserId]);
		expect(linked.sort()).toEqual([
			["https://a.example/", 1],
			["https://b.example/", 2],
		]);
	});
});

describe("the browser's tab events update the spaces", () => {
	const start = () => adoptTabs(seedState(NOW), [tab(21, "https://canvas.example.edu/courses/281")], NOW);

	test("a link opened from a School tab lands in School, even while another space is showing", () => {
		const [s0, live0] = start();
		const elsewhere = switchSpace(s0, "s-home");
		const [state] = tabCreated(elsewhere, live0, tab(22, "https://docs.example.edu/", { openerTabId: 21 }), NOW);
		const school = state.spaces.find((s) => s.id === "s-school");
		expect(titles(state, school?.open ?? [])).toEqual(["https://docs.example.edu/"]);
	});

	test("an empty tab never joins a space, wherever it was opened from", () => {
		const [s0, live0] = start();
		const home = switchSpace(s0, "s-home");
		for (const url of ["chrome://loka-newtab/", "chrome://newtab/", "chrome://new-tab-page/"]) {
			const [state, live] = tabCreated(home, live0, tab(23, url, { openerTabId: 21, active: true }), NOW);
			expect([state, live]).toEqual([home, live0]);
		}
	});

	test("a page picked on an empty tab joins the space on screen, not the empty tab's opener's", () => {
		const [s0, live0] = start();
		const home = switchSpace(s0, "s-home");
		// The empty tab (24) was opened from School's tab (21); the picked page names the empty tab as its opener.
		const [state, live] = tabCreated(home, live0, tab(25, "https://picked.example/", { openerTabId: 24 }), NOW);
		const lokaId = Object.keys(live).find((id) => live[id] === 25) ?? "";
		expect(homeOf(state, lokaId)).toBe("s-home");
	});

	test("a new tab waits for its first page, so one that turns out to be an empty tab never joins a space", () => {
		const [s0, live0] = start();
		// Before its first page commits, the browser says about:blank: no "about:blank" row.
		const [withNew, live1] = tabCreated(s0, live0, tab(26, "about:blank", { active: true }), NOW);
		expect([withNew, live1]).toEqual([s0, live0]);
		const [state, live] = tabUpdated(withNew, live1, tab(26, "chrome://loka-newtab/", { active: true }), NOW);
		expect([state, live]).toEqual([s0, live0]);
		// One that gets a real page joins then.
		const [joined, linked] = tabUpdated(withNew, live1, tab(26, "https://real.example/", { active: true }), NOW);
		const newId = Object.keys(linked).find((id) => linked[id] === 26) ?? "";
		expect(homeOf(joined, newId)).toBe("s-build");
	});

	test("an empty tab that goes to a page joins the space on screen; until then it stays out", () => {
		const [s0, live0] = start();
		const home = switchSpace(s0, "s-home");
		expect(tabUpdated(home, live0, tab(27, "chrome://loka-newtab/"), NOW)).toEqual([home, live0]);
		const [state, live] = tabUpdated(home, live0, tab(27, "https://dropped.example/", { title: "Dropped" }), NOW);
		const lokaId = Object.keys(live).find((id) => live[id] === 27) ?? "";
		expect([homeOf(state, lokaId), state.tabs[lokaId]?.title]).toEqual(["s-home", "Dropped"]);
	});

	test("a pinned tab saved on chrome://newtab keeps its place", () => {
		const [s0, live0] = start();
		// Canvas (21) is pinned in School; whatever its page does, a pinned tab stays.
		const [state, live] = tabUpdated(s0, live0, tab(21, "chrome://newtab/"), NOW);
		expect(homeOf(state, "t-canvas")).toBe("s-school");
		expect(live).toEqual(live0);
	});

	test("a tab Loka asked for is only linked, not added a second time", () => {
		const [s0, live0] = start();
		const [state, live] = tabCreated(s0, live0, tab(30, "https://lit.dev/docs"), NOW, "t-lit");
		expect(state).toBe(s0);
		expect(live).toEqual({ ...live0, "t-lit": 30 });
	});

	test("closing an open tab in the browser archives it; closing a pinned one only unloads it", () => {
		const [s0, live0] = start();
		const [withNew, live1] = tabCreated(s0, live0, tab(40, "https://x.example/"), NOW);
		const newId = Object.keys(live1).find((id) => live1[id] === 40) ?? "";
		const [afterOpen] = tabRemoved(withNew, live1, 40, NOW);
		expect(afterOpen.tabs[newId]).toBeUndefined();
		expect(afterOpen.archive[0]).toMatchObject({ tab: { id: newId, url: "https://x.example/" }, archivedAt: NOW });
		const [afterPinned, live2] = tabRemoved(s0, live0, 21, NOW);
		expect(afterPinned.archive).toEqual(s0.archive);
		expect(homeOf(afterPinned, "t-canvas")).toBe("s-school");
		expect(live2["t-canvas"]).toBeUndefined();
	});

	test("an open tab follows its page; a pinned tab keeps the address it was pinned with", () => {
		const [s0, live0] = start();
		const [withNew, live1] = tabCreated(s0, live0, tab(50, "https://x.example/"), NOW);
		const [moved] = tabUpdated(withNew, live1, tab(50, "https://y.example/", { title: "Y" }), NOW);
		const newId = Object.keys(live1).find((id) => live1[id] === 50) ?? "";
		expect([moved.tabs[newId]?.url, moved.tabs[newId]?.title]).toEqual(["https://y.example/", "Y"]);
		const [away] = tabUpdated(s0, live0, tab(21, "https://canvas.example.edu/inbox", { title: "Inbox" }), NOW);
		expect([away.tabs["t-canvas"]?.url, away.tabs["t-canvas"]?.title]).toEqual([
			"https://canvas.example.edu/courses/281",
			"Canvas: CSC 281",
		]);
	});

	test("picking a tab of another space in the browser switches Loka to that space", () => {
		const [s0, live0] = start();
		const state = tabActivated(switchSpace(s0, "s-build"), live0, 21, NOW);
		expect([state.activeSpaceId, activeTab(state)?.title]).toEqual(["s-school", "Canvas: CSC 281"]);
	});
});

describe("Loka tells the browser what to do", () => {
	test("showing an unloaded pinned tab loads it; a closed Loka tab closes its browser tab", () => {
		const [s0, live0] = adoptTabs(seedState(NOW), [tab(61, "https://news.ycombinator.com", { active: true })], NOW);
		const browser = [tab(61, "https://news.ycombinator.com", { active: true })];
		// Hacker News is open and showing; now the user picks the unloaded Lit docs and closes Hacker News.
		const picked = closeTab(
			{ ...s0, spaces: s0.spaces.map((s) => (s.id === "s-build" ? { ...s, activeTabId: "t-lit" } : s)) },
			"t-hn",
		);
		const ops = planReconcile(picked, live0, browser, {});
		expect(ops.filter((o) => o.op !== "group")).toEqual([
			{ op: "create", tabId: "t-lit", url: "https://lit.dev/docs" },
			{ op: "remove", browserId: 61 },
		]);
	});

	test("live tabs are grouped by space, other spaces fold away, and a matching browser needs nothing", () => {
		const [state, live] = adoptTabs(
			seedState(NOW),
			[
				tab(71, "https://github.com/imputnet/helium-windows", { active: true }),
				tab(72, "https://canvas.example.edu/courses/281"),
			],
			NOW,
		);
		const browser = [
			tab(71, "https://github.com/imputnet/helium-windows", { active: true }),
			tab(72, "https://canvas.example.edu/courses/281"),
		];
		expect(planReconcile(state, live, browser, {})).toEqual([
			{ op: "group", key: "s-build@1", browserIds: [71], title: "Build", color: "blue" },
			{ op: "group", key: "s-school@1", browserIds: [72], title: "School", color: "orange" },
		]);
		const grouped = [{ ...browser[0], groupId: 1 } as BrowserTab, { ...browser[1], groupId: 2 } as BrowserTab];
		const groups = { "s-build@1": { id: 1, collapsed: false }, "s-school@1": { id: 2, collapsed: false } };
		expect(planReconcile(state, live, grouped, groups)).toEqual([{ op: "collapse", groupId: 2, collapsed: true }]);
		const folded = { ...groups, "s-school@1": { id: 2, collapsed: true } };
		expect(planReconcile(state, live, grouped, folded)).toEqual([]);
	});

	test("switching to a space with nothing showing shows its first loaded tab, or an empty tab if it has none", () => {
		const [state, live] = adoptTabs(
			seedState(NOW),
			[
				tab(81, "https://github.com/imputnet/helium-windows", { active: true }),
				tab(82, "https://canvas.example.edu/courses/281"),
			],
			NOW,
		);
		const browser = [
			tab(81, "https://github.com/imputnet/helium-windows", { active: true }),
			tab(82, "https://canvas.example.edu/courses/281"),
		];
		const school = {
			...switchSpace(state, "s-school"),
			spaces: state.spaces.map((s) => ({ ...s, activeTabId: null })),
		};
		expect(planReconcile(school, live, browser, {}, true).find((o) => o.op === "activate")).toEqual({
			op: "activate",
			browserId: 82,
		});
		const home = { ...school, activeSpaceId: "s-home" };
		const groups: ReturnType<typeof planReconcile> = [
			{ op: "group", key: "s-build@1", browserIds: [81], title: "Build", color: "blue" },
			{ op: "group", key: "s-school@1", browserIds: [82], title: "School", color: "orange" },
		];
		expect(planReconcile(home, live, browser, {}, true)).toEqual([{ op: "empty-tab" }, ...groups]);
		expect(planReconcile(home, live, browser, {}, false)).toEqual(groups);
		// From one empty space to another, the empty tab on screen stays.
		const onEmpty = [{ ...browser[0], active: false } as BrowserTab, browser[1] as BrowserTab];
		const emptyTab = tab(83, "chrome://loka-newtab/", { active: true });
		expect(planReconcile(home, live, [...onEmpty, emptyTab], {}, true)).toEqual(groups);
	});

	test("closing the last tab of the space on screen shows an empty tab before it goes, so the window stays", () => {
		const browser = [tab(55, "https://example.org/", { active: true })];
		const [adopted, live] = adoptTabs(firstState(), browser, NOW);
		const only = Object.keys(live)[0] ?? "";
		const ops = planReconcile(closeTab(adopted, only), live, browser, {}).filter((o) => o.op !== "group");
		expect(ops).toEqual([{ op: "empty-tab" }, { op: "remove", browserId: 55 }]);
	});

	test("an empty tab on screen leaves the tab group it landed in, so that space's group can fold", () => {
		// It was grouped with Research as a new tab, before its page committed and showed it was an empty tab.
		const browser = [
			tab(59, "https://example.org/", { groupId: 4 }),
			tab(60, "chrome://loka-newtab/", { active: true, groupId: 4 }),
		];
		const [state, live] = adoptTabs(firstState(), browser, NOW);
		const key = `${state.spaces[0]?.id}@1`;
		expect(planReconcile(state, live, browser, { [key]: { id: 4, collapsed: false } })).toContainEqual({
			op: "ungroup",
			browserIds: [60],
		});
	});

	test("an empty tab no longer on screen is closed; one on screen, or a Loka tab on chrome://newtab, stays", () => {
		const browser = [
			tab(56, "https://example.org/", { active: true }),
			tab(57, "chrome://loka-newtab/"),
			tab(58, "chrome://newtab/"),
		];
		const [state, live] = adoptTabs(firstState(), browser, NOW);
		// Taking over the window leaves the empty tabs out of the sidebar.
		expect(Object.values(live)).toEqual([56]);
		expect(state.spaces[0]?.open.map((id) => state.tabs[id]?.url)).toEqual(["https://example.org/"]);
		const ops = planReconcile(state, live, browser, {}).filter((o) => o.op !== "group");
		expect(ops).toEqual([
			{ op: "remove", browserId: 57 },
			{ op: "remove", browserId: 58 },
		]);
		const onEmpty = browser.map((t) => ({ ...t, active: t.id === 57 }));
		expect(planReconcile(state, live, onEmpty, {}).filter((o) => o.op === "remove")).toEqual([
			{ op: "remove", browserId: 58 },
		]);
		// A tab pinned on chrome://newtab before Loka had empty tabs, loaded in 58.
		const withPinned = {
			...state,
			tabs: { ...state.tabs, saved: { id: "saved", title: "Start", url: "chrome://newtab/" } },
			spaces: state.spaces.map((s) => ({ ...s, pinned: [{ kind: "tab" as const, id: "saved" }] })),
		};
		expect(planReconcile(withPinned, { ...live, saved: 58 }, browser, {}).filter((o) => o.op === "remove")).toEqual([
			{ op: "remove", browserId: 57 },
		]);
	});

	test("a space open in two windows gets a tab group in each, since a group can't span windows", () => {
		const browser = [
			tab(91, "https://github.com/imputnet/helium-windows", { active: true }),
			tab(92, "https://lit.dev/docs", { windowId: 2 }),
		];
		const [state, live] = adoptTabs(seedState(NOW), browser, NOW);
		expect(planReconcile(state, live, browser, {}).filter((o) => o.op === "group")).toEqual([
			{ op: "group", key: "s-build@1", browserIds: [91], title: "Build", color: "blue" },
			{ op: "group", key: "s-build@2", browserIds: [92], title: "Build", color: "blue" },
		]);
	});

	test("renaming or recoloring a space retitles its tab group; a group already matching needs nothing", () => {
		const browser = [tab(61, "https://github.com/imputnet/helium-windows", { active: true, groupId: 5 })];
		const [state, live] = adoptTabs(seedState(NOW), browser, NOW);
		const groups = { "s-build@1": { id: 5, collapsed: false, title: "Build", color: "blue" as const } };
		expect(planReconcile(state, live, browser, groups)).toEqual([]);
		const renamed = updateSpace(state, "s-build", { name: "Make", hue: 30, planet: "ringed" });
		expect(planReconcile(renamed, live, browser, groups)).toEqual([
			{ op: "look", key: "s-build@1", groupId: 5, title: "Make", color: "orange" },
		]);
	});

	test("closing the shown tab shows the next one before the browser closes it, so it never picks its own", () => {
		const browser = [
			tab(51, "https://news.ycombinator.com", { active: true }),
			tab(52, "https://browsercompany.substack.com"),
		];
		const [adopted, live] = adoptTabs(seedState(NOW), browser, NOW);
		const shown = activateTab(adopted, "t-hn");
		const ops = planReconcile(closeTab(shown, "t-hn"), live, browser, {}).filter((o) => o.op !== "group");
		expect(ops).toEqual([
			{ op: "activate", browserId: 52 },
			{ op: "remove", browserId: 51 },
		]);
	});

	test("each space color maps to the nearest tab group color", () => {
		expect([200, 30, 150, 330, 260, 0, 175].map(groupColor)).toEqual([
			"blue",
			"orange",
			"green",
			"pink",
			"purple",
			"red",
			"cyan",
		]);
	});
});
