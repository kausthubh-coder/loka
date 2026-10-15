import { describe, expect, test } from "bun:test";
import { activeTab, closeTab, switchSpace } from "../../prototype/src/features/sidebar/sidebar.logic";
import { seedState } from "../../prototype/src/features/sidebar/sidebar.seed";
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
		expect(state.spaces).toHaveLength(1);
		expect(state.spaces[0]?.open).toHaveLength(2);
		expect(Object.values(live).sort()).toEqual([1, 2]);
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
		expect(live["t-lit"]).toBe(30);
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
			{ op: "remove", browserId: 61 },
			{ op: "create", tabId: "t-lit", url: "https://lit.dev/docs" },
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
			{ op: "group", spaceId: "s-build", browserIds: [71], title: "Build", color: "blue" },
			{ op: "group", spaceId: "s-school", browserIds: [72], title: "School", color: "orange" },
		]);
		const grouped = [{ ...browser[0], groupId: 1 } as BrowserTab, { ...browser[1], groupId: 2 } as BrowserTab];
		const groups = { "s-build": { id: 1, collapsed: false }, "s-school": { id: 2, collapsed: false } };
		expect(planReconcile(state, live, grouped, groups)).toEqual([{ op: "collapse", groupId: 2, collapsed: true }]);
		const folded = { ...groups, "s-school": { id: 2, collapsed: true } };
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
		expect(planReconcile(home, live, browser, {}, true)[0]).toEqual({ op: "new-tab" });
		expect(planReconcile(home, live, browser, {}, false).some((o) => o.op === "new-tab")).toBe(false);
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
