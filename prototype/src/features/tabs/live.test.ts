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

	test("a tab Loka asked for is only linked, not added a second time", () => {
		const [s0, live0] = start();
		const [state, live] = tabCreated(s0, live0, tab(30, "https://lit.dev/docs"), NOW, "t-lit");
		expect(state).toBe(s0);
		expect(live).toEqual({ ...live0, "t-lit": 30 });
	});

	test("closing an open tab in the browser removes it; closing a pinned one only unloads it", () => {
		const [s0, live0] = start();
		const [withNew, live1] = tabCreated(s0, live0, tab(40, "https://x.example/"), NOW);
		const newId = Object.keys(live1).find((id) => live1[id] === 40) ?? "";
		const [afterOpen] = tabRemoved(withNew, live1, 40);
		expect(afterOpen.tabs[newId]).toBeUndefined();
		const [afterPinned, live2] = tabRemoved(s0, live0, 21);
		expect(homeOf(afterPinned, "t-canvas")).toBe("s-school");
		expect(live2["t-canvas"]).toBeUndefined();
	});

	test("an open tab follows its page; a pinned tab keeps the address it was pinned with", () => {
		const [s0, live0] = start();
		const [withNew, live1] = tabCreated(s0, live0, tab(50, "https://x.example/"), NOW);
		const moved = tabUpdated(withNew, live1, tab(50, "https://y.example/", { title: "Y" }));
		const newId = Object.keys(live1).find((id) => live1[id] === 50) ?? "";
		expect([moved.tabs[newId]?.url, moved.tabs[newId]?.title]).toEqual(["https://y.example/", "Y"]);
		const away = tabUpdated(s0, live0, tab(21, "https://canvas.example.edu/inbox", { title: "Inbox" }));
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

	test("switching to a space with nothing showing shows its first loaded tab, or a new tab if it has none", () => {
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
		expect(planReconcile(home, live, browser, {}, true)).toEqual([{ op: "new-tab" }, ...groups]);
		expect(planReconcile(home, live, browser, {}, false)).toEqual(groups);
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
