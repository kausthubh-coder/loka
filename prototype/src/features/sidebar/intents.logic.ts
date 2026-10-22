// What the sidebar asks to change, as data: an intent names a model rule and its arguments. The page applies one to
// its own copy at once (so the click paints in the same frame) and sends it to the browser, whose C++ model
// (components/loka/core/intents.cc) applies the same rule to the saved spaces; the prototype applies it to its own.
// Ids and times travel in the intent, so both sides make the same change. The shared cases (model-cases.ts) run as
// intents, which keeps the two dispatchers equal.

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
	navigateTab,
	openTab,
	type Place,
	renameFolder,
	restoreArchived,
	revealTab,
	type SpaceLook,
	stepTab,
	switchSpace,
	type TabId,
	toggleFolder,
	ungroupFolder,
	updateSpace,
} from "./sidebar.logic";

export type Intent =
	| { op: "moveItem"; id: string; to: Place }
	/** Several rows as one change: a selection's Pin, Unpin, Move to space, Add to Essentials, New folder with these. */
	| { op: "moveItems"; itemIds: string[]; to: Place }
	| { op: "openTab"; url: string; title: string; now: number; id: TabId }
	| { op: "navigateTab"; tabId: TabId; url: string; title: string }
	| { op: "activateTab"; tabId: TabId; now: number }
	/** A close by hand: an open tab goes to the archive, stamped `now`. */
	| { op: "closeTab"; tabId: TabId; now: number }
	/** Clear, and Close others: one change for many tabs. */
	| { op: "closeTabs"; tabIds: TabId[]; now: number }
	| { op: "switchSpace"; spaceId: string }
	| { op: "createSpace"; look: SpaceLook; id: string }
	| { op: "updateSpace"; spaceId: string; look: SpaceLook }
	| { op: "deleteSpace"; spaceId: string }
	| { op: "focusOrOpen"; url: string; title: string; now: number; id: TabId }
	| { op: "createFolder"; spaceId: string; parentId: string | null; name: string; id: string }
	| { op: "renameFolder"; folderId: string; name: string }
	| { op: "toggleFolder"; folderId: string }
	| { op: "ungroupFolder"; folderId: string }
	| { op: "groupIntoFolder"; targetId: TabId; draggedId: TabId; name: string; id: string }
	| { op: "archiveStale"; now: number; maxAgeMs: number; keep: TabId[] }
	| { op: "restoreArchived"; tabId: TabId; now: number }
	| { op: "clearArchive" }
	| { op: "revealTab"; tabId: TabId; now: number }
	| { op: "stepTab"; step: 1 | -1; now: number }
	/**
	 * Everything at once, for the rare changes made outside the rules (an import, setup's spaces, taking another
	 * device's spaces). The browser checks it the way it checks a file (importState) and refuses a bad one.
	 */
	| { op: "replaceState"; state: BrowserState };

/** The spaces after `intent`, or the same object when it changes nothing or isn't allowed. */
export function applyIntent(state: BrowserState, intent: Intent): BrowserState {
	switch (intent.op) {
		case "moveItem":
			return moveItem(state, intent.id, intent.to);
		case "moveItems":
			return moveItems(state, intent.itemIds, intent.to);
		case "openTab":
			return openTab(state, intent.url, intent.title, intent.now, intent.id);
		case "navigateTab":
			return navigateTab(state, intent.tabId, intent.url, intent.title);
		case "activateTab":
			return activateTab(state, intent.tabId, intent.now);
		case "closeTab":
			return closeTab(state, intent.tabId, intent.now);
		case "closeTabs":
			return intent.tabIds.reduce((s, id) => closeTab(s, id, intent.now), state);
		case "switchSpace":
			return switchSpace(state, intent.spaceId);
		case "createSpace":
			return createSpace(state, intent.look, intent.id)[0];
		case "updateSpace":
			return updateSpace(state, intent.spaceId, intent.look);
		case "deleteSpace":
			return deleteSpace(state, intent.spaceId);
		case "focusOrOpen":
			return focusOrOpen(state, intent.url, intent.title, intent.now, intent.id);
		case "createFolder":
			return createFolder(state, intent.spaceId, intent.parentId, intent.name, intent.id)[0];
		case "renameFolder":
			return renameFolder(state, intent.folderId, intent.name);
		case "toggleFolder":
			return toggleFolder(state, intent.folderId);
		case "ungroupFolder":
			return ungroupFolder(state, intent.folderId);
		case "groupIntoFolder":
			return groupIntoFolder(state, intent.targetId, intent.draggedId, intent.name, intent.id)[0];
		case "archiveStale":
			return archiveStale(state, intent.now, intent.maxAgeMs, new Set(intent.keep));
		case "restoreArchived":
			return restoreArchived(state, intent.tabId, intent.now);
		case "clearArchive":
			return state.archive.length ? { ...state, archive: [] } : state;
		case "revealTab":
			return revealTab(state, intent.tabId, intent.now);
		case "stepTab":
			return stepTab(state, intent.step, intent.now);
		case "replaceState":
			return importState(JSON.stringify(intent.state)) ?? state;
	}
}
