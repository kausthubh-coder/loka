// The cases the browser's C++ model (components/loka/core in patches/loka/loka-core.patch) must answer exactly as
// this model does. Each one runs a rule from sidebar.logic.ts or live.logic.ts and records what it gave; the C++ test
// (model_cases_unittest.cc) runs the same op on the same input and expects the same output. model-cases.json is this
// file's output: `bun run model:cases` writes it, model-cases.test.ts fails while it's stale, and
// `bun run model:cases -- --cpp` builds and runs the C++ side against it.
//
// Ids and times come in through the arguments ("ids" for the rules that make several), so the output is the same on
// every run.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	adoptTabs,
	type BrowserTab,
	firstState,
	type GroupRecord,
	groupColor,
	type LiveMap,
	planReconcile,
	tabActivated,
	tabCreated,
	tabRemoved,
	tabUpdated,
} from "../tabs/live.logic";
import { applyIntent, type Intent } from "./intents.logic";
import {
	activateTab,
	archiveStale,
	type BrowserState,
	closeTab,
	createFolder,
	createSpace,
	deleteSpace,
	focusOrOpen,
	groupIntoFolder,
	importState,
	moveItem,
	moveItems,
	moveSpace,
	navigateTab,
	openTab,
	type Place,
	renameFolder,
	restoreArchived,
	revealTab,
	type SpaceLook,
	stepTab,
	switchSpace,
	toggleFolder,
	ungroupFolder,
	updateSpace,
} from "./sidebar.logic";
import { seedState } from "./sidebar.seed";
import { toDelta } from "./spaces-delta.logic";

const NOW = Date.UTC(2026, 9, 15, 3, 0);
const HOUR = 60 * 60 * 1000;

type Json = unknown;
interface Case {
	name: string;
	op: string;
	/** A name in `states`, or a state spelled out. */
	state?: string;
	args: Record<string, Json>;
	expect: Record<string, Json>;
}

/** Hands out the given ids in order, as the C++ side does. */
function idsFrom(ids: string[]): () => string {
	let next = 0;
	return () => {
		const id = ids[next++];
		if (id === undefined) throw new Error("the case gave too few ids");
		return id;
	};
}

const pairs = (live: LiveMap): [string, number][] => Object.entries(live);
const tab = (id: number, url: string, extra: Partial<BrowserTab> = {}): BrowserTab => ({
	id,
	url,
	title: url,
	active: false,
	groupId: -1,
	windowId: 1,
	...extra,
});

export function modelCases(): { states: Record<string, BrowserState>; cases: Case[] } {
	const seed = seedState(NOW);
	const states: Record<string, BrowserState> = {
		seed,
		first: firstState("s-first"),
		// Build shows Hacker News; School shows Canvas.
		showing: activateTab(seed, "t-hn", NOW),
		archived: archiveStale(seed, NOW, 4 * HOUR),
		home: switchSpace(seed, "s-home"),
		zenShown: activateTab(seed, "t-zen", NOW),
		cscClosed: toggleFolder(seed, "f-csc281"),
		schoolClosed: switchSpace(toggleFolder(seed, "f-csc281"), "s-school"),
	};
	const cases: Case[] = [];
	// The sidebar's own changes run as intents, the way the page sends them; `run` says the same thing with the rule
	// itself, so the dispatcher is checked too.
	const on = (name: string, state: string, op: string, args: Record<string, Json>, run: (s: BrowserState) => Json) => {
		const s = states[state];
		if (!s) throw new Error(`no state ${state}`);
		const next = applyIntent(s, { op, ...args } as Intent);
		if (!Bun.deepEquals(next, run(s))) throw new Error(`applyIntent and ${op} disagree on "${name}"`);
		cases.push({ name, op, state, args, expect: { delta: toDelta(s, next), state: next } });
	};

	// ---- moving tabs and folders ----
	const move = (name: string, state: string, id: string, to: Place) =>
		on(name, state, "moveItem", { id, to }, (s) => moveItem(s, id, to));
	move("an open tab pins at the top", "seed", "t-hn", { area: "pinned", spaceId: "s-build", parentId: null, index: 0 });
	move("moving down the same list counts from before the move", "seed", "t-hn", {
		area: "open",
		spaceId: "s-build",
		index: 2,
	});
	move("moving up the same list", "seed", "t-zen", { area: "open", spaceId: "s-build", index: 0 });
	move("a tab joins the Essentials", "seed", "t-arc", { area: "essentials", index: 1 });
	move("an Essential goes to another space's open tabs", "seed", "t-gh", { area: "open", spaceId: "s-home", index: 0 });
	move("past the end means the end", "seed", "t-hn", { area: "open", spaceId: "s-school", index: Infinity });
	move("a negative index means the start", "seed", "t-arc", { area: "essentials", index: -3 });
	move("a tab sent to another space stops being the one its old space shows", "showing", "t-hn", {
		area: "open",
		spaceId: "s-home",
		index: 0,
	});
	move("a tab dropped in a closed folder opens it", "seed", "t-hn", {
		area: "pinned",
		spaceId: "s-school",
		parentId: "f-game",
		index: 1,
	});
	move("into a folder two levels down", "seed", "t-zen", {
		area: "pinned",
		spaceId: "s-build",
		parentId: "f-docs",
		index: 0,
	});
	move("a folder can't go inside its own subfolder", "seed", "f-loka", {
		area: "pinned",
		spaceId: "s-build",
		parentId: "f-docs",
		index: 0,
	});
	move("a folder can't leave the pinned tree", "seed", "f-docs", { area: "open", spaceId: "s-build", index: 0 });
	move("a folder moves to another space's pinned tree", "seed", "f-docs", {
		area: "pinned",
		spaceId: "s-home",
		parentId: null,
		index: 0,
	});
	move("a folder that doesn't exist refuses the drop", "seed", "t-hn", {
		area: "pinned",
		spaceId: "s-build",
		parentId: "f-nowhere",
		index: 0,
	});
	move("an unknown id moves nothing", "seed", "t-nowhere", { area: "essentials", index: 0 });
	move("a pinned tab goes back to open tabs", "seed", "t-canvas", { area: "open", spaceId: "s-school", index: 0 });

	// ---- the Essentials limit (ESSENTIALS_LIMIT, 12) ----
	const grow = (count: number) =>
		["t-hn", "t-arc", "t-zen", "t-helium", "t-chromium", "t-lit", "t-canvas", "t-music"]
			.slice(0, count - seed.essentials.length)
			.reduce((s, id) => moveItem(s, id, { area: "essentials", index: Infinity }), seed);
	states.essentialsEleven = grow(11);
	states.essentialsFull = grow(12);
	move("a 13th Essential is refused", "essentialsFull", "t-gdd", { area: "essentials", index: 0 });
	move("full Essentials still reorder", "essentialsFull", "t-music", { area: "essentials", index: 0 });
	move("a full Essential can leave", "essentialsFull", "t-mail", { area: "open", spaceId: "s-build", index: 0 });

	// ---- moving several at once ----
	const moveMany = (name: string, state: string, ids: string[], to: Place) =>
		on(name, state, "moveItems", { itemIds: ids, to }, (s) => moveItems(s, ids, to));
	moveMany("several open tabs pin at the end in the order given", "seed", ["t-zen", "t-hn"], {
		area: "pinned",
		spaceId: "s-build",
		parentId: null,
		index: Infinity,
	});
	moveMany("several land together at the top of another space's open tabs", "seed", ["t-helium", "t-lit", "t-arc"], {
		area: "open",
		spaceId: "s-home",
		index: 0,
	});
	moveMany("within one list the first counts before the move, the rest follow it", "seed", ["t-zen", "t-hn"], {
		area: "open",
		spaceId: "s-build",
		index: 2,
	});
	moveMany("several into a folder two levels down, first to last", "seed", ["t-hn", "t-arc"], {
		area: "pinned",
		spaceId: "s-build",
		parentId: "f-docs",
		index: 0,
	});
	moveMany("several to nearly full Essentials: as many as fit, in order", "essentialsEleven", ["t-gdd", "t-ref"], {
		area: "essentials",
		index: Infinity,
	});
	moveMany("a folder or an unknown id is skipped, the rest move", "seed", ["f-docs", "t-x", "t-hn"], {
		area: "essentials",
		index: 0,
	});
	moveMany("nothing allowed changes nothing", "essentialsFull", ["t-gdd", "f-docs"], { area: "essentials", index: 0 });
	moveMany("no ids changes nothing", "seed", [], { area: "open", spaceId: "s-home", index: 0 });

	// ---- tabs ----
	on(
		"a new tab goes to the top of the space and shows",
		"seed",
		"openTab",
		{ url: "https://a.example/", title: "A", now: NOW, id: "n-a" },
		(s) => openTab(s, "https://a.example/", "A", NOW, "n-a"),
	);
	on(
		"navigating changes the address and title",
		"seed",
		"navigateTab",
		{ tabId: "t-hn", url: "https://b.example/", title: "B" },
		(s) => navigateTab(s, "t-hn", "https://b.example/", "B"),
	);
	on("navigating a missing tab changes nothing", "seed", "navigateTab", { tabId: "t-x", url: "u", title: "t" }, (s) =>
		navigateTab(s, "t-x", "u", "t"),
	);
	on(
		"activating marks the time and shows it in the current space",
		"seed",
		"activateTab",
		{ tabId: "t-zen", now: NOW },
		(s) => activateTab(s, "t-zen", NOW),
	);
	on("an Essential shows in the current space", "seed", "activateTab", { tabId: "t-mail", now: NOW }, (s) =>
		activateTab(s, "t-mail", NOW),
	);
	on("activating a missing tab changes nothing", "seed", "activateTab", { tabId: "t-x", now: NOW }, (s) =>
		activateTab(s, "t-x", NOW),
	);
	on(
		"closing the shown open tab archives it and shows its neighbour",
		"showing",
		"closeTab",
		{ tabId: "t-hn", now: NOW },
		(s) => closeTab(s, "t-hn", NOW),
	);
	on("closing the last open tab shows the one before", "zenShown", "closeTab", { tabId: "t-zen", now: NOW }, (s) =>
		closeTab(s, "t-zen", NOW),
	);
	on(
		"closing a pinned tab keeps it, with nothing shown, and archives nothing",
		"seed",
		"closeTab",
		{ tabId: "t-helium", now: NOW },
		(s) => closeTab(s, "t-helium", NOW),
	);
	on("closing a space's only open tab", "seed", "closeTab", { tabId: "t-music", now: NOW }, (s) =>
		closeTab(s, "t-music", NOW),
	);
	on("switching spaces", "seed", "switchSpace", { spaceId: "s-school" }, (s) => switchSpace(s, "s-school"));
	on("switching to a missing space changes nothing", "seed", "switchSpace", { spaceId: "s-x" }, (s) =>
		switchSpace(s, "s-x"),
	);

	// ---- spaces ----
	const look: SpaceLook = { name: "Work", hue: 30, planet: "cratered", scheme: "dark" };
	on(
		"a new space shows at once",
		"seed",
		"createSpace",
		{ look, id: "s-work" },
		(s) => createSpace(s, look, "s-work")[0],
	);
	const noScheme: SpaceLook = { name: "Plain", hue: 300, planet: "ocean" };
	on(
		"a new space without a scheme follows the system",
		"seed",
		"createSpace",
		{ look: noScheme, id: "s-plain" },
		(s) => createSpace(s, noScheme, "s-plain")[0],
	);
	const rename: SpaceLook = { name: "  Making  ", hue: 99.5, planet: "banded" };
	on(
		"an edit trims the name and keeps the scheme it isn't given",
		"seed",
		"updateSpace",
		{ spaceId: "s-build", look: rename },
		(s) => updateSpace(s, "s-build", rename),
	);
	const blank: SpaceLook = { name: "   ", hue: 1, planet: "banded" };
	on("a blank name is refused", "seed", "updateSpace", { spaceId: "s-build", look: blank }, (s) =>
		updateSpace(s, "s-build", blank),
	);
	on("deleting the shown space shows the next one", "seed", "deleteSpace", { spaceId: "s-build" }, (s) =>
		deleteSpace(s, "s-build"),
	);
	on("deleting the last space along shows the one before", "home", "deleteSpace", { spaceId: "s-home" }, (s) =>
		deleteSpace(s, "s-home"),
	);
	on("deleting another space keeps the one showing", "seed", "deleteSpace", { spaceId: "s-school" }, (s) =>
		deleteSpace(s, "s-school"),
	);
	on("the only space can't be deleted", "first", "deleteSpace", { spaceId: "s-first" }, (s) =>
		deleteSpace(s, "s-first"),
	);
	// `toIndex` counts after the move: where the space ends up.
	const moveTo = (name: string, state: string, spaceId: string, toIndex: number) =>
		on(name, state, "moveSpace", { spaceId, toIndex }, (s) => moveSpace(s, spaceId, toIndex));
	moveTo("the space showing moves to the end and keeps showing", "seed", "s-build", 2);
	moveTo("a space moves to the start", "seed", "s-home", 0);
	moveTo("a space moves one place down", "seed", "s-build", 1);
	moveTo("a space moves one place up", "home", "s-home", 1);
	moveTo("a space past the end goes to the end", "seed", "s-build", 99);
	moveTo("a space before the start goes to the start", "seed", "s-home", -3);
	moveTo("a space moved to its own place changes nothing", "seed", "s-school", 1);
	moveTo("moving a missing space changes nothing", "seed", "s-x", 0);
	moveTo("the only space has nowhere to go", "first", "s-first", 1);
	on(
		"an address already pinned in another space is shown there",
		"seed",
		"focusOrOpen",
		{
			url: "https://lit.dev/docs",
			title: "Lit",
			now: NOW,
			id: "n-lit",
		},
		(s) => focusOrOpen(s, "https://lit.dev/docs", "Lit", NOW, "n-lit"),
	);
	on(
		"an Essential's address shows the Essential",
		"seed",
		"focusOrOpen",
		{
			url: "https://github.com",
			title: "GH",
			now: NOW,
			id: "n-gh",
		},
		(s) => focusOrOpen(s, "https://github.com", "GH", NOW, "n-gh"),
	);
	on(
		"a new address opens a tab",
		"seed",
		"focusOrOpen",
		{ url: "chrome://settings", title: "Settings", now: NOW, id: "n-set" },
		(s) => focusOrOpen(s, "chrome://settings", "Settings", NOW, "n-set"),
	);

	// ---- folders ----
	on(
		"a folder at the end of the pinned tree",
		"seed",
		"createFolder",
		{ spaceId: "s-home", parentId: null, name: "New", id: "f-new" },
		(s) => createFolder(s, "s-home", null, "New", "f-new")[0],
	);
	on(
		"a folder inside a closed folder opens it",
		"seed",
		"createFolder",
		{
			spaceId: "s-school",
			parentId: "f-game",
			name: "Art",
			id: "f-art",
		},
		(s) => createFolder(s, "s-school", "f-game", "Art", "f-art")[0],
	);
	on(
		"a folder in a missing folder is refused",
		"seed",
		"createFolder",
		{
			spaceId: "s-school",
			parentId: "f-x",
			name: "X",
			id: "f-y",
		},
		(s) => createFolder(s, "s-school", "f-x", "X", "f-y")[0],
	);
	on(
		"a folder in a missing space is refused",
		"seed",
		"createFolder",
		{ spaceId: "s-x", parentId: null, name: "X", id: "f-y" },
		(s) => createFolder(s, "s-x", null, "X", "f-y")[0],
	);
	on("renaming a folder deep down", "seed", "renameFolder", { folderId: "f-game", name: "Game" }, (s) =>
		renameFolder(s, "f-game", "Game"),
	);
	on("toggling a folder", "seed", "toggleFolder", { folderId: "f-docs" }, (s) => toggleFolder(s, "f-docs"));
	on("ungrouping keeps the insides in the folder's place", "seed", "ungroupFolder", { folderId: "f-loka" }, (s) =>
		ungroupFolder(s, "f-loka"),
	);
	on("ungrouping a nested folder opens its parent", "cscClosed", "ungroupFolder", { folderId: "f-game" }, (s) =>
		ungroupFolder(s, "f-game"),
	);
	on("ungrouping a tab does nothing", "seed", "ungroupFolder", { folderId: "t-hn" }, (s) => ungroupFolder(s, "t-hn"));
	const group = (name: string, state: string, targetId: string, draggedId: string) => {
		// Refused, the spaces stay as they were.
		on(name, state, "groupIntoFolder", { targetId, draggedId, name: "Group", id: "f-group" }, (s) =>
			groupIntoFolder(s, targetId, draggedId, "Group", "f-group")[1] === null
				? s
				: groupIntoFolder(s, targetId, draggedId, "Group", "f-group")[0],
		);
	};
	group("two pinned tabs become a folder in the target's place", "seed", "t-lit", "t-chromium");
	group("an open target puts both at the end of pinned", "seed", "t-hn", "t-zen");
	group("a tab from another space joins", "seed", "t-canvas", "t-music");
	group("an Essential can be dragged onto a tab", "seed", "t-hn", "t-mail");
	group("an Essential can't be the target", "seed", "t-mail", "t-hn");
	group("a tab can't group with itself", "seed", "t-hn", "t-hn");
	group("a missing tab can't group", "seed", "t-hn", "t-x");

	// ---- archive ----
	const archive = (name: string, state: string, maxAgeMs: number, keep: string[] = []) =>
		on(name, state, "archiveStale", { now: NOW, maxAgeMs, keep }, (s) => archiveStale(s, NOW, maxAgeMs, new Set(keep)));
	archive("open tabs older than the limit are archived, newest first", "seed", 4 * HOUR);
	archive("nothing old enough changes nothing", "seed", 24 * HOUR);
	archive("tabs playing sound stay", "seed", 4 * HOUR, ["t-arc"]);
	archive("the shown tab, pinned tabs and Essentials stay", "showing", 1);
	archive("archiving again adds to the front", "archived", 1);
	on(
		"a restored tab comes back to the top of its space and shows",
		"archived",
		"restoreArchived",
		{ tabId: "t-zen", now: NOW },
		(s) => restoreArchived(s, "t-zen", NOW),
	);
	on("restoring a missing tab changes nothing", "archived", "restoreArchived", { tabId: "t-x", now: NOW }, (s) =>
		restoreArchived(s, "t-x", NOW),
	);
	states.archivedNoBuild = deleteSpace(states.archived as BrowserState, "s-build");
	on(
		"a tab whose space is gone comes back to the current one",
		"archivedNoBuild",
		"restoreArchived",
		{
			tabId: "t-arc",
			now: NOW,
		},
		(s) => restoreArchived(s, "t-arc", NOW),
	);

	on(
		"Clear archives every open tab in one change",
		"seed",
		"closeTabs",
		{ tabIds: ["t-hn", "t-arc", "t-zen"], now: NOW },
		(s) => closeTab(closeTab(closeTab(s, "t-hn", NOW), "t-arc", NOW), "t-zen", NOW),
	);
	on("clearing the archive", "archived", "clearArchive", {}, (s) => ({ ...s, archive: [] }));
	on("clearing an empty archive changes nothing", "seed", "clearArchive", {}, (s) => s);
	on("replacing the spaces with a good file", "seed", "replaceState", { state: states.home }, () => states.home);
	on("a bad replacement is refused", "seed", "replaceState", { state: { ...seed, activeSpaceId: "s-x" } }, (s) => s);

	// ---- finding and stepping ----
	on(
		"revealing a tab in a closed folder in another space opens the way to it",
		"seed",
		"revealTab",
		{ tabId: "t-ref", now: NOW },
		(s) => revealTab(s, "t-ref", NOW),
	);
	on("revealing an Essential just shows it", "seed", "revealTab", { tabId: "t-cal", now: NOW }, (s) =>
		revealTab(s, "t-cal", NOW),
	);
	on("revealing a missing tab changes nothing", "seed", "revealTab", { tabId: "t-x", now: NOW }, (s) =>
		revealTab(s, "t-x", NOW),
	);
	on("stepping forward", "seed", "stepTab", { step: 1, now: NOW }, (s) => stepTab(s, 1, NOW));
	on("stepping back from nothing shown goes to the last", "home", "stepTab", { step: -1, now: NOW }, (s) =>
		stepTab(s, -1, NOW),
	);
	on("stepping skips the insides of closed folders", "schoolClosed", "stepTab", { step: 1, now: NOW }, (s) =>
		stepTab(s, 1, NOW),
	);

	// ---- importing ----
	const imports = (name: string, json: Json) => {
		const parsed = importState(JSON.stringify(json));
		cases.push({ name, op: "importState", args: { json }, expect: parsed ? { state: parsed } : { refused: true } });
	};
	imports("the seed imports as it is", seed);
	const old = JSON.parse(JSON.stringify(seed));
	delete old.archive;
	for (const s of old.spaces) {
		delete s.planet;
		delete s.scheme;
	}
	imports("a file from before planets, schemes and the archive gets them", old);
	imports(
		"the 0.1.0 alpha's export comes without its own pages",
		JSON.parse(readFileSync(join(import.meta.dirname, "alpha-0.1.0-export.json"), "utf8")),
	);
	imports("a tab in two places is refused", { ...seed, essentials: [...seed.essentials, "t-hn"] });
	imports("a tab in no place is refused", {
		...seed,
		tabs: { ...seed.tabs, "t-lost": { id: "t-lost", title: "x", url: "y" } },
	});
	imports("a place with no tab is refused", { ...seed, essentials: [...seed.essentials, "t-ghost"] });
	imports("a missing active space is refused", { ...seed, activeSpaceId: "s-x" });
	imports("another version is refused", { ...seed, version: 2 });
	imports("a tab under the wrong id is refused", {
		...seed,
		tabs: { ...seed.tabs, "t-hn": { id: "t-other", title: "x", url: "y" } },
	});
	const noActive = JSON.parse(JSON.stringify(seed));
	delete noActive.spaces[2].activeTabId;
	imports("a space without activeTabId is refused", noActive);
	const badPlanet = JSON.parse(JSON.stringify(seed));
	badPlanet.spaces[0].planet = "square";
	imports("an unknown planet is refused", badPlanet);
	const nullTime = JSON.parse(JSON.stringify(seed));
	nullTime.tabs["t-hn"].lastActiveAt = null;
	imports("a null time is refused", nullTime);

	// ---- the browser's tabs ----
	const adopt = (name: string, state: string, tabs: BrowserTab[], ids: string[], keepUnloaded = false) => {
		const s = states[state];
		if (!s) throw new Error(`no state ${state}`);
		const [next, live] = adoptTabs(s, tabs, NOW, idsFrom(ids), keepUnloaded);
		cases.push({
			name,
			op: "adoptTabs",
			state,
			args: { tabs, now: NOW, ids, keepUnloaded },
			expect: { state: next, live: pairs(live) },
		});
	};
	adopt(
		"at start tabs match by address, new ones join, unmatched open tabs go",
		"seed",
		[
			tab(11, "https://github.com/imputnet/helium-windows"),
			tab(12, "https://news.ycombinator.com"),
			tab(13, "https://example.org/", { title: "Example", active: true }),
		],
		["n1"],
	);
	adopt(
		"a tab with no page yet waits",
		"first",
		[tab(3, "about:blank", { active: true }), tab(4, "chrome://newtab/")],
		[],
	);
	adopt(
		"a first launch takes every tab into one space",
		"first",
		[tab(1, "https://a.example/"), tab(2, "https://b.example/", { lastAccessed: NOW - HOUR })],
		["n1", "n2"],
	);
	adopt(
		"one saved tab takes the first browser tab at its address; the rest are new",
		"seed",
		[
			tab(5, "https://news.ycombinator.com"),
			tab(6, "https://news.ycombinator.com", { active: true }),
			tab(7, "https://news.ycombinator.com"),
		],
		["n1", "n2"],
	);
	adopt("the shown browser tab's space shows", "seed", [tab(8, "https://music.youtube.com", { active: true })], []);
	adopt(
		"a restored tab takes the tab it saved, before another tab at its address",
		"seed",
		[
			tab(31, "https://news.ycombinator.com"),
			tab(32, "https://news.ycombinator.com", { lokaId: "t-hn", active: true }),
		],
		["n1"],
	);
	adopt(
		"a restored tab keeps its tab though it went to another page",
		"seed",
		[
			tab(33, "https://lit.dev/docs/components/overview/", { title: "Components", lokaId: "t-lit" }),
			tab(34, "https://zen-browser.app/download", { title: "Download Zen", lokaId: "t-zen", active: true }),
		],
		[],
	);
	adopt(
		"a saved tab that's gone, or taken already, falls back to the address",
		"seed",
		[
			tab(35, "https://github.com", { lokaId: "t-gone" }),
			tab(36, "https://calendar.google.com", { lokaId: "t-cal" }),
			tab(37, "https://example.org/", { lokaId: "t-cal" }),
		],
		["n1"],
	);
	adopt(
		"after an import, its open tabs stay though no browser tab shows them",
		"seed",
		[tab(9, "https://news.ycombinator.com", { active: true }), tab(10, "https://kept.example/")],
		["n1"],
		true,
	);

	const [linkedState, linked] = adoptTabs(
		seed,
		[
			tab(21, "https://canvas.example.edu/courses/281"),
			tab(22, "https://news.ycombinator.com"),
			tab(23, "https://mail.google.com"),
		],
		NOW,
		idsFrom([]),
	);
	states.linked = linkedState;
	const live = pairs(linked);
	const withLive = (
		name: string,
		op: string,
		args: Record<string, Json>,
		run: (s: BrowserState, l: LiveMap) => [BrowserState, LiveMap] | BrowserState,
		state = "linked",
	) => {
		const s = states[state];
		if (!s) throw new Error(`no state ${state}`);
		const out = run(s, Object.fromEntries(live));
		cases.push({
			name,
			op,
			state,
			args: { live, ...args },
			expect: Array.isArray(out) ? { state: out[0], live: pairs(out[1]) } : { state: out },
		});
	};
	states.linkedHome = switchSpace(linkedState, "s-home");
	const opened = tab(30, "https://docs.example.edu/", { openerTabId: 21 });
	withLive(
		"a link from a School tab lands in School while Home shows",
		"tabCreated",
		{ tab: opened, now: NOW, ids: ["n1"] },
		(s, l) => tabCreated(s, l, opened, NOW, undefined, idsFrom(["n1"])),
		"linkedHome",
	);
	const fromEssential = tab(31, "https://x.example/", { openerTabId: 23, active: true });
	withLive(
		"a link from an Essential lands in the space showing",
		"tabCreated",
		{ tab: fromEssential, now: NOW, ids: ["n1"] },
		(s, l) => tabCreated(s, l, fromEssential, NOW, undefined, idsFrom(["n1"])),
	);
	const onItsWay = tab(34, "about:blank", { active: true });
	withLive("a new tab with no page yet waits for one", "tabCreated", { tab: onItsWay, now: NOW, ids: [] }, (s, l) =>
		tabCreated(s, l, onItsWay, NOW, undefined, idsFrom([])),
	);
	const empty = tab(32, "chrome://newtab/", { openerTabId: 21 });
	withLive("an empty tab never joins", "tabCreated", { tab: empty, now: NOW, ids: [] }, (s, l) =>
		tabCreated(s, l, empty, NOW, undefined, idsFrom([])),
	);
	const asked = tab(33, "https://lit.dev/docs");
	withLive(
		"a tab Loka asked for only gets linked",
		"tabCreated",
		{ tab: asked, now: NOW, forTabId: "t-lit", ids: [] },
		(s, l) => tabCreated(s, l, asked, NOW, "t-lit", idsFrom([])),
	);
	const again = tab(22, "https://news.ycombinator.com");
	withLive("a tab already linked isn't added twice", "tabCreated", { tab: again, now: NOW, ids: [] }, (s, l) =>
		tabCreated(s, l, again, NOW, undefined, idsFrom([])),
	);
	withLive("closing an open tab's browser tab archives it", "tabRemoved", { browserId: 22, now: NOW }, (s, l) =>
		tabRemoved(s, l, 22, NOW),
	);
	withLive("closing a pinned tab's browser tab keeps it", "tabRemoved", { browserId: 21, now: NOW }, (s, l) =>
		tabRemoved(s, l, 21, NOW),
	);
	withLive("closing an unknown tab changes nothing", "tabRemoved", { browserId: 99, now: NOW }, (s, l) =>
		tabRemoved(s, l, 99, NOW),
	);
	// Hacker News's browser tab closed an hour ago, then the browser's Reopen closed tab brings it back.
	const [hnClosed, hnClosedLive] = tabRemoved(linkedState, Object.fromEntries(live), 22, NOW - HOUR);
	states.linkedHnClosed = hnClosed;
	const reopened = tab(41, "https://news.ycombinator.com", { lokaId: "t-hn", active: true });
	const [reopenedState, reopenedLive] = tabCreated(hnClosed, hnClosedLive, reopened, NOW, undefined, idsFrom([]));
	cases.push({
		name: "a closed tab reopened by the browser comes back out of the archive",
		op: "tabCreated",
		state: "linkedHnClosed",
		args: { live: pairs(hnClosedLive), tab: reopened, now: NOW, ids: [] },
		expect: { state: reopenedState, live: pairs(reopenedLive) },
	});
	const fromClosedWindow = tab(42, "https://lit.dev/docs", { lokaId: "t-lit" });
	withLive(
		"a tab from a reopened window takes the row it saved",
		"tabCreated",
		{ tab: fromClosedWindow, now: NOW, ids: [] },
		(s, l) => tabCreated(s, l, fromClosedWindow, NOW, undefined, idsFrom([])),
	);
	const update = (name: string, t: BrowserTab, ids: string[] = []) =>
		withLive(name, "tabUpdated", { tab: t, now: NOW, ids }, (s, l) => tabUpdated(s, l, t, NOW, idsFrom(ids)));
	update("an open tab follows its page", tab(22, "https://news.ycombinator.com/item", { title: "Item" }));
	update("an open tab with no title takes its address", tab(22, "https://news.ycombinator.com/new", { title: "" }));
	update(
		"a pinned tab keeps its address while it wanders",
		tab(21, "https://canvas.example.edu/other", { title: "Other" }),
	);
	update(
		"a pinned tab takes a new title on its own address",
		tab(21, "https://canvas.example.edu/courses/281", { title: "Canvas 2" }),
	);
	update("an open tab turning into an empty tab leaves", tab(22, "chrome://loka-newtab/"));
	update("an unlinked tab that gets a page joins", tab(40, "https://y.example/", { active: true }), ["n1"]);
	update("an unlinked blank tab waits", tab(41, "about:blank"));
	update("nothing new changes nothing", tab(22, "https://news.ycombinator.com", { title: "Hacker News" }));
	withLive("picking a School tab in the browser shows School", "tabActivated", { browserId: 21, now: NOW }, (s, l) =>
		tabActivated(s, l, 21, NOW),
	);
	withLive("picking an Essential keeps the space", "tabActivated", { browserId: 23, now: NOW }, (s, l) =>
		tabActivated(s, l, 23, NOW),
	);
	withLive("picking an unknown tab changes nothing", "tabActivated", { browserId: 99, now: NOW }, (s, l) =>
		tabActivated(s, l, 99, NOW),
	);

	// ---- what the browser must do ----
	const plan = (
		name: string,
		state: string,
		links: [string, number][],
		tabs: BrowserTab[],
		groups: [string, GroupRecord][],
		switched = false,
	) => {
		const s = states[state];
		if (!s) throw new Error(`no state ${state}`);
		const ops = planReconcile(s, Object.fromEntries(links), tabs, Object.fromEntries(groups), switched);
		cases.push({ name, op: "planReconcile", state, args: { live: links, tabs, groups, switched }, expect: { ops } });
	};
	plan("the shown tab isn't loaded: load it", "seed", [], [], []);
	plan(
		"the shown tab is loaded but hidden: show it, group Build's tabs",
		"seed",
		[
			["t-helium", 1],
			["t-hn", 2],
		],
		[tab(1, "https://github.com/imputnet/helium-windows"), tab(2, "https://news.ycombinator.com", { active: true })],
		[],
	);
	plan(
		"a deleted tab's browser tab closes; stray empty tabs close",
		"seed",
		[
			["t-helium", 1],
			["t-gone", 2],
		],
		[tab(1, "h", { active: true, groupId: 7 }), tab(2, "x", { groupId: 7 }), tab(3, "chrome://newtab/")],
		[["s-build@1", { id: 7, collapsed: false, title: "Build", color: "blue" }]],
	);
	plan(
		"after a switch to a space showing nothing, its first loaded tab shows",
		"home",
		[
			["t-helium", 1],
			["t-music", 2],
		],
		[tab(1, "h", { active: true, groupId: 7 }), tab(2, "m", { groupId: 8 })],
		[
			["s-build@1", { id: 7, collapsed: false, title: "Build", color: "blue" }],
			["s-home@1", { id: 8, collapsed: true, title: "Home", color: "green" }],
		],
		true,
	);
	states.homeEmpty = closeTab(states.home as BrowserState, "t-music");
	plan(
		"after a switch to an empty space, an empty tab",
		"homeEmpty",
		[["t-helium", 1]],
		[tab(1, "h", { active: true, groupId: 7 })],
		[["s-build@1", { id: 7, collapsed: false, title: "Build", color: "blue" }]],
		true,
	);
	plan(
		"already on an empty tab, it stays, out of any group",
		"homeEmpty",
		[["t-helium", 1]],
		[tab(1, "h", { groupId: 7 }), tab(2, "chrome://newtab/", { active: true, groupId: 7 })],
		[["s-build@1", { id: 7, collapsed: true, title: "Build", color: "blue" }]],
		true,
	);
	plan(
		"a renamed space's group takes the new look",
		"seed",
		[["t-helium", 1]],
		[tab(1, "h", { active: true, groupId: 7 })],
		[["s-build@1", { id: 7, collapsed: false, title: "Old name", color: "red" }]],
	);
	plan(
		"a group record without a look isn't touched",
		"seed",
		[["t-helium", 1]],
		[tab(1, "h", { active: true, groupId: 7 })],
		[["s-build@1", { id: 7, collapsed: false }]],
	);
	plan(
		"Essentials leave groups; other spaces' groups fold",
		"seed",
		[
			["t-helium", 1],
			["t-mail", 2],
			["t-canvas", 3],
		],
		[tab(1, "h", { active: true, groupId: 7 }), tab(2, "m", { groupId: 7 }), tab(3, "c", { groupId: 9 })],
		[
			["s-build@1", { id: 7, collapsed: true, title: "Build", color: "blue" }],
			["s-school@1", { id: 9, collapsed: false, title: "School", color: "orange" }],
		],
	);
	plan(
		"a space open in two windows has a group in each",
		"seed",
		[
			["t-helium", 1],
			["t-hn", 2],
		],
		[tab(1, "h", { active: true, groupId: 7 }), tab(2, "n", { windowId: 2 })],
		[["s-build@1", { id: 7, collapsed: false, title: "Build", color: "blue" }]],
	);

	for (const hue of [0, 14, 15, 16, 30, 200, 215, 300, 359, 360, 725, -40, 99.5, 250]) {
		cases.push({
			name: `hue ${hue}'s group color`,
			op: "groupColor",
			args: { hue },
			expect: { color: groupColor(hue) },
		});
	}
	cases.push({
		name: "a first state",
		op: "firstState",
		args: { id: "s-one" },
		expect: { state: firstState("s-one") },
	});

	// What the file holds: Infinity becomes null, undefined fields go.
	return JSON.parse(JSON.stringify({ states, cases }));
}
