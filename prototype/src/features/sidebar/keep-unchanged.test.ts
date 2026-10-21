import { expect, test } from "bun:test";
import type { LiveTabs } from "./favicon";
import { keepUnchanged } from "./keep-unchanged.logic";
import { activateTab, type BrowserState, moveItem, switchSpace, toggleFolder } from "./sidebar.logic";
import { seedState } from "./sidebar.seed";

/** The state as the store hands it back: the same data, every object new. */
const reread = (state: BrowserState): BrowserState => JSON.parse(JSON.stringify(state));

test("the same spaces read back from the store are the very objects the sidebar already has", () => {
	const state = seedState(0);
	expect(keepUnchanged(state, reread(state))).toBe(state);
});

test("a retitled tab is the only new tab; every other tab, space and list stays the same object", () => {
	const state = seedState(0);
	const after = reread(state);
	after.tabs["t-lit"] = { id: "t-lit", title: "Lit: reactive controllers", url: "https://lit.dev/docs" };
	const kept = keepUnchanged(state, after);
	expect(kept).not.toBe(state);
	expect(kept.tabs["t-lit"]?.title).toBe("Lit: reactive controllers");
	expect(kept.tabs["t-lit"]).not.toBe(state.tabs["t-lit"]);
	for (const id of Object.keys(state.tabs).filter((id) => id !== "t-lit")) expect(kept.tabs[id]).toBe(state.tabs[id]);
	kept.spaces.forEach((space, i) => {
		expect(space).toBe(state.spaces[i] as (typeof state.spaces)[number]);
	});
	expect(kept.essentials).toBe(state.essentials);
});

test("a space switch keeps every space, tab and folder; only the active space id differs", () => {
	const state = seedState(0);
	const kept = keepUnchanged(state, reread(switchSpace(state, "s-school")));
	expect(kept.activeSpaceId).toBe("s-school");
	expect(kept.spaces).toBe(state.spaces);
	expect(kept.tabs).toBe(state.tabs);
});

test("a tab shown in a space changes that tab and that space, nothing else", () => {
	const state = seedState(0);
	const kept = keepUnchanged(state, reread(activateTab(state, "t-lit", 5)));
	expect(kept.tabs["t-lit"]?.lastActiveAt).toBe(5);
	expect(kept.tabs["t-gh"]).toBe(state.tabs["t-gh"]);
	const build = kept.spaces.find((s) => s.id === "s-build");
	const school = kept.spaces.find((s) => s.id === "s-school");
	expect(build?.activeTabId).toBe("t-lit");
	expect(build).not.toBe(state.spaces.find((s) => s.id === "s-build"));
	expect(school).toBe(state.spaces.find((s) => s.id === "s-school"));
	// The pinned tree of the space whose active tab changed is still the old tree.
	expect(build?.pinned).toBe(state.spaces.find((s) => s.id === "s-build")?.pinned);
});

test("a folder closed keeps its sibling nodes, matched by id, as the same objects", () => {
	const state = seedState(0);
	const build = state.spaces.find((s) => s.id === "s-build");
	const folder = build?.pinned.find((n) => n.kind === "folder");
	if (!build || folder?.kind !== "folder") throw new Error("the seed's Build space has a folder");
	const kept = keepUnchanged(state, reread(toggleFolder(state, folder.id)));
	const keptBuild = kept.spaces.find((s) => s.id === "s-build");
	const keptFolder = keptBuild?.pinned.find((n) => n.id === folder.id);
	expect(keptFolder?.kind === "folder" && keptFolder.open).toBe(!folder.open);
	expect(keptFolder?.kind === "folder" && keptFolder.children).toBe(folder.children);
	for (const node of build.pinned.filter((n) => n.id !== folder.id))
		expect(keptBuild?.pinned.find((n) => n.id === node.id)).toBe(node);
});

test("a tab moved to the top of a list keeps every node object, though each one's index moved", () => {
	const state = seedState(0);
	const build = state.spaces.find((s) => s.id === "s-build");
	const last = build?.pinned.at(-1);
	if (!build || !last) throw new Error("the seed's Build space has pinned items");
	const moved = moveItem(state, last.id, { area: "pinned", spaceId: "s-build", parentId: null, index: 0 });
	const keptBuild = keepUnchanged(state, reread(moved)).spaces.find((s) => s.id === "s-build");
	expect(keptBuild?.pinned.map((n) => n.id)).toEqual([last.id, ...build.pinned.slice(0, -1).map((n) => n.id)]);
	for (const node of build.pinned) expect(keptBuild?.pinned.find((n) => n.id === node.id)).toBe(node);
});

test("live tabs: unchanged pages keep their objects, and an unchanged set is the old set", () => {
	const live: LiveTabs = { "t-lit": { icon: "a.png", loading: false }, "t-gh": { icon: "b.png", audible: true } };
	expect(
		keepUnchanged(live, { "t-lit": { icon: "a.png", loading: false }, "t-gh": { icon: "b.png", audible: true } }),
	).toBe(live);
	const kept = keepUnchanged(live, {
		"t-lit": { icon: "a.png", loading: true },
		"t-gh": { icon: "b.png", audible: true },
	});
	expect(kept["t-lit"]).toEqual({ icon: "a.png", loading: true });
	expect(kept["t-gh"]).toBe(live["t-gh"] as (typeof live)[string]);
});

test("a tab gone from the live set makes a new set without it", () => {
	const live: LiveTabs = { "t-lit": { icon: "a.png" }, "t-gh": { icon: "b.png" } };
	const kept = keepUnchanged(live, { "t-gh": { icon: "b.png" } });
	expect(Object.keys(kept)).toEqual(["t-gh"]);
	expect(kept["t-gh"]).toBe(live["t-gh"] as (typeof live)[string]);
});
