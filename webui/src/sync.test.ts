// The sync against a stand-in for LokaSidebarHandler: chrome.send answers through cr.webUIResponse and pushes
// tabs-changed and store-changed through cr.webUIListenerCallback, a task later, as the browser does.
import { expect, test } from "bun:test";
import type { BrowserState } from "../../prototype/src/features/sidebar/sidebar.logic";
import type { NativeTab } from "./bridge";

type Group = { id: number; title: string; collapsed: boolean };
const browserSide = {
	store: {} as Record<string, string>,
	tabs: [] as NativeTab[],
	groups: [] as Group[],
	nextTab: 1,
	nextGroup: 1,
};

const later = (fn: () => void) => setTimeout(fn, 0);
const answer = (id: unknown, value: unknown) => later(() => window.cr.webUIResponse(String(id), true, value));
const push = (event: string, value: unknown) => later(() => window.cr.webUIListenerCallback(event, value));
const copyTabs = () => browserSide.tabs.map((t) => ({ ...t }));

function newTab(url: string, opener?: number): NativeTab {
	for (const t of browserSide.tabs) t.active = false;
	const tab: NativeTab = {
		id: browserSide.nextTab++,
		index: browserSide.tabs.length,
		url,
		title: url === "chrome://newtab/" ? "New Tab" : url,
		favicon: "",
		active: true,
		pinned: false,
		loading: false,
		audible: false,
		muted: false,
		groupId: -1,
		openerId: opener,
		lastAccessed: Date.now(),
	};
	browserSide.tabs.push(tab);
	return tab;
}

function send(message: string, args: unknown[]) {
	const [first, ...rest] = args;
	if (message === "getStore") answer(first, { ...browserSide.store });
	else if (message === "getTabs") answer(first, copyTabs());
	else if (message === "getGroups")
		answer(
			first,
			browserSide.groups.map((g) => ({ ...g })),
		);
	else if (message === "setStore") {
		const [key, value] = [String(first), rest[0]];
		if (typeof value === "string") browserSide.store[key] = value;
		else delete browserSide.store[key];
		push("store-changed", { ...browserSide.store });
	} else if (message === "createTab") {
		// The browser names the tab that was showing as the new tab's opener.
		const shown = browserSide.tabs.find((t) => t.active)?.id;
		const made = newTab(String(rest[0]) || "chrome://newtab/", shown);
		answer(first, made.id);
		push("tabs-changed", copyTabs());
	} else if (message === "activateTab") {
		for (const t of browserSide.tabs) t.active = t.id === first;
		push("tabs-changed", copyTabs());
	} else if (message === "closeTab") {
		const closed = browserSide.tabs.find((t) => t.id === first);
		browserSide.tabs = browserSide.tabs.filter((t) => t.id !== first);
		// When the tab on screen closes, the browser shows another one itself (here the last).
		const last = browserSide.tabs.at(-1);
		if (closed?.active && last) last.active = true;
		push("tabs-changed", copyTabs());
	} else if (message === "groupTabs") {
		const [ids, asked] = rest as [number[], number];
		const groupId = asked > 0 ? asked : browserSide.nextGroup++;
		if (!browserSide.groups.some((g) => g.id === groupId))
			browserSide.groups.push({ id: groupId, title: "", collapsed: false });
		for (const t of browserSide.tabs) if (ids.includes(t.id)) t.groupId = groupId;
		answer(first, groupId);
	} else if (message === "updateGroup") {
		const group = browserSide.groups.find((g) => g.id === first);
		if (group && typeof rest[0] === "string") group.title = rest[0];
		if (group && typeof rest[2] === "boolean") group.collapsed = rest[2];
	}
}

Object.assign(globalThis, { window: globalThis, chrome: { send } });

/** Waits until the sync's queue has nothing left: no job and no message in flight for a while. */
const settle = () => new Promise((done) => setTimeout(done, 100));
const saved = (): BrowserState => JSON.parse(browserSide.store["state.v1"] ?? "null");
const spaceOf = (state: BrowserState, url: string) =>
	state.spaces.find((s) => s.open.some((id) => state.tabs[id]?.url === url))?.name;

test("a first run takes in setup's spaces while the sync takes over the window's first tab", async () => {
	browserSide.store.onboarding = JSON.stringify({
		version: 1,
		spaces: [
			{ name: "Research", hue: 150, planet: "ocean" },
			{ name: "Play", hue: 330, planet: "cratered" },
		],
	});
	newTab("https://first.example/");
	const { startSync, changeSpaces } = await import("./sync");
	const { readState, pendingOnboarding, markOnboardingApplied } = await import("./store");
	const { applyOnboarding, onboardingSpaces } = await import("./onboarding.logic");

	// What the sidebar page does as it starts, at the same time as the sync (main.ts connectedCallback).
	startSync();
	const pageCopy = await readState();
	const json = await pendingOnboarding();
	expect(json).toBe(browserSide.store.onboarding ?? null);
	markOnboardingApplied(json ?? "");
	await changeSpaces((s) => applyOnboarding(s, onboardingSpaces(json ?? "")));
	await settle();

	const state = saved();
	expect(state.spaces.map((s) => s.name)).toEqual(["Research", "Play"]);
	expect(state.activeSpaceId).toBe(state.spaces[0]?.id ?? "");
	// The page's first copy and the sync's are the same space, so neither writes over the other.
	expect(pageCopy.spaces[0]?.id).toBe(state.spaces[0]?.id ?? "");
	expect(spaceOf(state, "https://first.example/")).toBe("Research");
	expect(browserSide.groups.map((g) => g.title)).toEqual(["Research"]);
	expect(await pendingOnboarding()).toBeNull();
});

const shownTab = () => browserSide.tabs.find((t) => t.active);
const openCounts = () => saved().spaces.map((s) => [s.name, s.open.length]);

test("switching to an empty space shows an empty tab, which is none of its tabs", async () => {
	const { changeSpaces } = await import("./sync");
	const { switchSpace } = await import("../../prototype/src/features/sidebar/sidebar.logic");
	const play = saved().spaces[1]?.id ?? "";
	await changeSpaces((s) => switchSpace(s, play));
	await settle();

	expect(browserSide.tabs.map((t) => t.url)).toEqual(["https://first.example/", "chrome://newtab/"]);
	expect(shownTab()?.url).toBe("chrome://newtab/");
	expect(openCounts()).toEqual([
		["Research", 1],
		["Play", 0],
	]);
	expect(saved().spaces[1]?.activeTabId).toBeNull();
	expect(browserSide.groups.map((g) => [g.title, g.collapsed])).toEqual([["Research", true]]);
});

test("a page picked on the empty tab is one new tab in the space on screen, and the empty tab goes", async () => {
	// What the command bar does with a pick (command.ts): open it in a tab of its own.
	const { browser } = await import("./bridge");
	await browser.createTab("https://picked.example/", true);
	await settle();

	expect(browserSide.tabs.map((t) => t.url)).toEqual(["https://first.example/", "https://picked.example/"]);
	expect(shownTab()?.url).toBe("https://picked.example/");
	expect(spaceOf(saved(), "https://picked.example/")).toBe("Play");
	expect(openCounts()).toEqual([
		["Research", 1],
		["Play", 1],
	]);
	expect(browserSide.groups.find((g) => g.id === shownTab()?.groupId)?.title).toBe("Play");
});

test("closing the last tab of the space on screen shows an empty tab, so the window keeps one", async () => {
	const { changeSpaces } = await import("./sync");
	const { closeTab } = await import("../../prototype/src/features/sidebar/sidebar.logic");
	const picked = saved().spaces[1]?.open[0] ?? "";
	await changeSpaces((s) => closeTab(s, picked));
	await settle();

	expect(browserSide.tabs.map((t) => t.url)).toEqual(["https://first.example/", "chrome://newtab/"]);
	expect(shownTab()?.url).toBe("chrome://newtab/");
	expect(openCounts()).toEqual([
		["Research", 1],
		["Play", 0],
	]);
	expect(saved().activeSpaceId).toBe(saved().spaces[1]?.id ?? "");
});

test("leaving the empty tab for a space with tabs closes it", async () => {
	const { changeSpaces } = await import("./sync");
	const { switchSpace } = await import("../../prototype/src/features/sidebar/sidebar.logic");
	const research = saved().spaces[0]?.id ?? "";
	await changeSpaces((s) => switchSpace(s, research));
	await settle();

	expect(browserSide.tabs.map((t) => [t.url, t.active])).toEqual([["https://first.example/", true]]);
});

test("moving the tab on screen to another space leaves the browser on this space, not on the moved tab", async () => {
	const { changeSpaces } = await import("./sync");
	const { moveItem } = await import("../../prototype/src/features/sidebar/sidebar.logic");
	const [research, play] = saved().spaces;
	const shownId = research?.activeTabId ?? "";
	await changeSpaces((s) => moveItem(s, shownId, { area: "open", spaceId: play?.id ?? "", index: 0 }));
	await settle();

	// Research had nothing else loaded, so the browser shows an empty tab, as on a switch to an empty space.
	expect(openCounts()).toEqual([
		["Research", 0],
		["Play", 1],
	]);
	expect(saved().activeSpaceId).toBe(research?.id ?? "");
	expect(shownTab()?.url).toBe("chrome://newtab/");
	expect(browserSide.groups.find((g) => g.id === shownTab()?.groupId)).toBeUndefined();
});
