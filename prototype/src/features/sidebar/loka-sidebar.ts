import { css, html, LitElement, nothing, render, svg, type TemplateResult } from "lit";
import { guard } from "lit/directives/guard.js";
import { keyed } from "lit/directives/keyed.js";
import { repeat } from "lit/directives/repeat.js";
import type { Browser, NativeDownload, NativeExtension } from "../../../../webui/src/bridge";
import type { Act } from "../../app/loka-app";
import { EASE_IN, EASE_OUT, leave, reducedMotion } from "../../app/theme";
import { type ActionId, type CommandMode, spaceShortcut } from "../command-bar/command-bar.logic";
import { faviconBackground, faviconInner, hostOf, type LiveTabs } from "./favicon";
import "../archive/loka-archive-panel";
import { newlyFinished, overallProgress } from "../downloads/downloads.logic";
import "../downloads/loka-downloads";
import { extensionMenuItems, toolbarExtensions, withPinned } from "../extensions/extensions.logic";
import { extensionIcon, extensionIconStyles } from "../extensions/loka-extensions";
import "../media/loka-media-card";
import "../menu/loka-menu";
import type { NowPlaying } from "../media/loka-media-card";
import type { LokaMenu } from "../menu/loka-menu";
import { itemAt, type MenuItem, menuHeight, toEntries } from "../menu/menu.logic";
import "../search/loka-sidebar-search";
import { keys, PLATFORM } from "../../app/platform";
import { playCue } from "../sound/sound";
import type { Cue } from "../sound/sound.logic";
import { autoScrollStep, type DropMode, dropModeAt } from "./drag.logic";
import { essentialsDropSlots } from "./empty-states.logic";
import { builtSpaceIds, rowsMoved } from "./lists.logic";
import { arrivePath, leavePath, ORBIT, type OrbitPlace, orbitFrames, orbitPoint } from "./orbit.logic";
import { planet } from "./planet";
import {
	activeSpace,
	activeTab,
	type BrowserState,
	exportState,
	type FolderNode,
	folderHolds,
	groupIntoFolder,
	importState,
	newId,
	type PinnedRow,
	type Place,
	pinnedRows,
	type Space,
	switchesForward,
	type Tab,
	type TabId,
} from "./sidebar.logic";
import { SWIPE_GAP, SWIPE_IDLE, type SwipeState, swipeWheel } from "./swipe.logic";

/**
 * What a drop target takes: its key (for the drop line), where an item lands for each mode, what its middle does
 * (`into`), which way it's laid out, or a space to switch to while hovering it.
 */
interface DropZone {
	key: string;
	place?: (mode: DropMode) => Place | null;
	into?: "folder" | "tab" | null;
	axis?: "x" | "y";
	switchTo?: string;
	/** A zone whose halves land in different places names the drop line by mode (the divider). */
	keyFor?: (mode: DropMode) => string;
}
/** A drop target element: the zone is set on it as a property by the template (`.dropZone=${...}`). */
type ZoneElement = HTMLElement & { dropZone?: DropZone };
interface Drop {
	key: string;
	mode: DropMode;
	place: Place;
	/** Dropping into the middle of a tab row makes a folder of both tabs; this is that tab. */
	groupWith?: TabId;
}

export type Panel = "extensions" | "downloads" | "archive" | "search";
/** An open menu: where it was asked for, its items, and a header naming what it's for (an extension's menu). */
interface Menu {
	x: number;
	y: number;
	items: MenuItem[];
	title?: string;
}

const PANEL_NAMES: Record<Panel, string> = {
	extensions: "Extensions",
	downloads: "Downloads",
	archive: "Archived tabs",
	search: "Search the sidebar",
};

/** The rows and Essentials that slide when rows move: the shown list's, never a kept list's. */
const ROW_ELEMENTS = ".scroll.shown [data-key], .essentials [data-key]";

/** Where an element sat before an update, and which list it was in, to animate from. */
interface Was {
	el: HTMLElement;
	rect: DOMRect;
	tile: boolean;
}

/**
 * The Arc- and Zen-style sidebar: the top row (menu, hide, back, forward, reload, the window's own buttons), the
 * address field with the pinned extensions in it, Essentials, the space's pinned tree and open tabs, now playing,
 * and the space switcher. It reaches the browser only through `browser` (the real bridge, or the prototype's
 * fake): extensions and downloads come from there and stay empty until the browser answers.
 */
export class LokaSidebar extends LitElement {
	static override properties = {
		state: { attribute: false },
		apply: { attribute: false },
		dragId: { state: true },
		drop: { state: true },
		menu: { state: true },
		renamingId: { state: true },
		panel: { state: true },
		extensions: { state: true },
		downloads: { state: true },
		unseenDownload: { state: true },
		toast: { state: true },
		said: { state: true },
		playing: { attribute: false },
		live: { attribute: false },
		browser: { attribute: false },
		pinned: { attribute: false },
		soundOn: { attribute: false },
		demo: { type: Boolean },
		floatingMenus: { attribute: false },
	};

	declare state: BrowserState;
	declare apply: Act;
	declare browser: Browser;
	dragId: string | null = null;
	drop: Drop | null = null;
	menu: Menu | null = null;
	/**
	 * In the browser, menus open in a window of their own (the browser's menu.html), so they reach past the sidebar's
	 * edge; the prototype, with no such window, draws them in place.
	 */
	floatingMenus = false;
	renamingId: string | null = null;
	/** The popover open under the address field, if any. */
	panel: Panel | null = null;
	/** The installed extensions and the downloads, as the browser last said. Null until it has answered. */
	extensions: NativeExtension[] | null = null;
	downloads: NativeDownload[] | null = null;
	/** A download finished while the Downloads panel was closed: the bottom row's button wears a dot until it opens. */
	unseenDownload = false;
	/** The download that just finished, said for a moment above the bottom row. */
	toast: NativeDownload | null = null;
	private toastTimer = 0;
	/**
	 * What the live region says to screen readers (a finished download, the space switched to). `count` makes the
	 * same words said twice a new message: the region's text is replaced, not left as it was.
	 */
	said = { text: "", count: 0 };
	private saidTimer = 0;
	private stopWatching: (() => void)[] = [];
	playing: NowPlaying | null = null;
	/** What the browser says about each loaded tab: its page's icon, loading, playing sound. */
	live: LiveTabs = {};
	/** Pinned shows the sidebar always; unpinned, the browser slides it away until the mouse reaches the edge. */
	pinned = true;
	/** Interface sounds are on (a window pref): the menu offers to mute them, and a quiet icon says when they're off. */
	soundOn = true;
	/** The prototype: shows "Reset demo data". The real browser leaves it out. */
	demo = true;

	/** Opens a panel from outside (Ctrl+Shift+F, the command bar). */
	openPanel(panel: Panel) {
		this.menu = null;
		this.panel = panel;
	}

	/** Closes the open panel after its exit, which is quicker and quieter than its entrance. */
	private async closePanel() {
		const open = this.panel;
		if (!open) return;
		await leave(this.renderRoot.querySelector(".panel"));
		if (this.panel === open) this.panel = null;
	}

	/** Listens to the browser for extensions and downloads. */
	private watchBrowser() {
		for (const stop of this.stopWatching) stop();
		const browser = this.browser;
		this.stopWatching = [
			browser.onExtensionsChanged((list) => {
				this.extensions = list;
			}),
			browser.onDownloadsChanged((list) => this.followDownloads(list)),
		];
		// The browser may not answer these yet (the message is new); the toolbar then just shows none.
		void browser.extensions().then((list) => {
			if (this.browser === browser) this.extensions = list;
		});
		void browser.downloads().then((list) => {
			if (this.browser === browser) this.downloads = list;
		});
	}

	/** A new list of downloads: one that just finished marks the Downloads button and shows briefly, unless it's open. */
	private followDownloads(list: NativeDownload[]) {
		const finished = newlyFinished(this.downloads, list).at(-1);
		this.downloads = list;
		if (!finished) return;
		this.say(`${finished.name} downloaded`);
		if (this.panel === "downloads") return;
		this.unseenDownload = true;
		this.toast = finished;
		window.clearTimeout(this.toastTimer);
		this.toastTimer = window.setTimeout(async () => {
			await leave(this.renderRoot.querySelector(".toast"), 160);
			if (this.toast === finished) this.toast = null;
		}, 4000);
	}

	/**
	 * Says `text` once through the sidebar's one polite live region, then clears it after a while so a reader moving
	 * through the page later doesn't find an old message. Nothing else in the sidebar is a live region, so nothing is
	 * said twice.
	 */
	private say(text: string) {
		this.said = { text, count: this.said.count + 1 };
		window.clearTimeout(this.saidTimer);
		this.saidTimer = window.setTimeout(() => {
			this.said = { text: "", count: this.said.count };
		}, 7000);
	}

	/** Opens a panel, or closes it if it's the one open (its button, pressed again). */
	private togglePanel(e: Event, panel: Panel) {
		e.stopPropagation();
		this.menu = null;
		if (this.panel === panel) void this.closePanel();
		else this.panel = panel;
	}

	private pinExtension = (id: string, pinned: boolean) => {
		playCue(pinned ? "pin" : "unpin");
		this.extensions = withPinned(this.extensions ?? [], id, pinned);
		this.browser.setExtensionPinned(id, pinned);
	};

	/** Clicks an extension's toolbar button: the browser opens its popup next to the button, or runs it. */
	private runExtension(e: Event, id: string) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		this.browser.runExtension(id, { x: r.x, y: r.y, width: r.width, height: r.height });
	}

	/** Closes a tab, telling the browser too: unloading a pinned tab changes nothing in the spaces, only the browser. */
	private closeTabFor(tabId: TabId) {
		playCue("tab-close");
		this.apply({ op: "closeTab", tabId, now: Date.now() });
		this.dispatchEvent(new CustomEvent("loka-tab-closed", { detail: tabId, bubbles: true, composed: true }));
	}

	// Escape closes a panel or menu wherever focus is: a click inside a panel can re-render the button that had it.
	private onEscape = (e: KeyboardEvent) => {
		if (e.key !== "Escape" || (!this.panel && !this.menu)) return;
		void this.closePanel();
		this.menu = null;
	};

	override connectedCallback() {
		super.connectedCallback();
		window.addEventListener("keydown", this.onEscape);
	}

	override disconnectedCallback() {
		this.bottomObserver?.disconnect();
		this.bottomObserver = null;
		window.removeEventListener("keydown", this.onEscape);
		window.clearTimeout(this.toastTimer);
		window.clearTimeout(this.saidTimer);
		for (const stop of this.stopWatching) stop();
		this.stopWatching = [];
		super.disconnectedCallback();
	}

	// ---- drag and drop -------------------------------------------------------
	//
	// Dragging is pointer events, not HTML5 drag and drop: inside the browser's own window an HTML5 drag is an OS
	// drag, which is cancelled by any layout change as it starts and can't be driven or checked without moving the
	// real mouse. A press on a row that moves 5 px starts a drag: a copy of the row follows the pointer, the
	// zone under it shows where it would land, the list scrolls near its edges, Escape cancels, and letting go drops.

	/** The press that may become a drag, until it moves far enough or lets go. */
	private press: { id: string; x: number; y: number; pointerId: number; source: HTMLElement } | null = null;
	/** The copy of the dragged row under the pointer. */
	private ghost: HTMLElement | null = null;
	private pointer = { x: 0, y: 0 };
	private scrollFrame = 0;
	/** The space last switched to by hovering its planet, so hovering doesn't switch it again on every move. */
	private hoveredSpace: string | null = null;

	/** A press on a row, tile or folder: watched until it moves far enough to be a drag. */
	private pressDrag(e: PointerEvent, id: string) {
		if (e.button !== 0 || e.pointerType === "touch" || this.press || this.dragId) return;
		// The row's own buttons (close, sound) and the rename field are pressed, not dragged.
		if ((e.composedPath()[0] as Element).closest?.("button.close, button.sound, input")) return;
		this.press = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, source: e.currentTarget as HTMLElement };
		window.addEventListener("pointermove", this.onDragMove, true);
		window.addEventListener("pointerup", this.onDragUp, true);
		window.addEventListener("pointercancel", this.cancelDrag, true);
		window.addEventListener("keydown", this.onDragKey, true);
	}

	private onDragMove = (e: PointerEvent) => {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		this.pointer = { x: e.clientX, y: e.clientY };
		if (!this.dragId) {
			if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return;
			this.beginDrag(press);
		}
		e.preventDefault();
		this.moveGhost();
		this.overPoint(e.clientX, e.clientY);
	};

	private beginDrag(press: NonNullable<typeof this.press>) {
		this.dragId = press.id;
		this.hold("drag", true);
		this.hoveredSpace = this.state.activeSpaceId;
		const rect = press.source.getBoundingClientRect();
		const ghost = press.source.cloneNode(true) as HTMLElement;
		ghost.classList.remove("active", "dragging");
		ghost.classList.add("drag-ghost");
		ghost.removeAttribute("data-key");
		ghost.setAttribute("aria-hidden", "true");
		ghost.inert = true;
		Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px` });
		ghost.dataset.dx = String(press.x - rect.left);
		ghost.dataset.dy = String(press.y - rect.top);
		this.renderRoot.querySelector("aside")?.append(ghost);
		this.ghost = ghost;
		try {
			this.renderRoot.querySelector("aside")?.setPointerCapture(press.pointerId);
		} catch {}
		this.scrollFrame = requestAnimationFrame(this.autoScroll);
	}

	private moveGhost() {
		const ghost = this.ghost;
		if (!ghost) return;
		const x = this.pointer.x - Number(ghost.dataset.dx);
		const y = this.pointer.y - Number(ghost.dataset.dy);
		ghost.style.translate = `${x}px ${y}px`;
	}

	/** The drop zone under a point, if any. */
	private zoneAt(x: number, y: number): { zone: DropZone; el: HTMLElement } | null {
		let el = (this.shadowRoot?.elementFromPoint(x, y) ?? null) as ZoneElement | null;
		while (el && el !== this) {
			if (el.dropZone) return { zone: el.dropZone, el };
			el = el.parentElement as ZoneElement | null;
		}
		return null;
	}

	/**
	 * Works out where the drag would land at a point. `into` says what the middle of a row does: on a folder it puts
	 * the item inside; on a tab, when a tab is being dragged, it makes a new folder of the two.
	 */
	private overPoint(x: number, y: number) {
		const dragId = this.dragId;
		if (!dragId) return;
		const found = this.zoneAt(x, y);
		if (!found) {
			this.drop = null;
			return;
		}
		const { zone, el } = found;
		if (zone.switchTo) {
			// Hovering a space while dragging switches to it, like Arc.
			if (this.hoveredSpace !== zone.switchTo) {
				this.hoveredSpace = zone.switchTo;
				this.switchTo(zone.switchTo);
			}
			this.drop = null;
			return;
		}
		this.hoveredSpace = this.state.activeSpaceId;
		if (!zone.place || dragId === zone.key) {
			this.drop = null;
			return;
		}
		const rect = el.getBoundingClientRect();
		const ratio = zone.axis === "x" ? (x - rect.left) / rect.width : (y - rect.top) / rect.height;
		const { mode, grouping } = dropModeAt(ratio, zone.into, this.state.tabs[dragId] !== undefined);
		const target = grouping ? zone.place("before") : zone.place(mode);
		if (!target) {
			this.drop = null;
			return;
		}
		const key = zone.keyFor?.(mode) ?? zone.key;
		if (this.drop?.key !== key || this.drop.mode !== mode) {
			this.drop = { key, mode, place: target, groupWith: grouping ? zone.key : undefined };
		}
	}

	/** Near the list's top or bottom edge, the list scrolls towards it, faster the closer the pointer is. */
	private autoScroll = () => {
		if (!this.dragId) return;
		const list = this.renderRoot.querySelector<HTMLElement>(".scroll.shown");
		if (list) {
			const r = list.getBoundingClientRect();
			const { x, y } = this.pointer;
			const step = autoScrollStep(y, r.top, r.bottom);
			if (step && x >= r.left && x <= r.right) {
				list.scrollTop += step;
				this.overPoint(x, y);
			}
		}
		this.scrollFrame = requestAnimationFrame(this.autoScroll);
	};

	private onDragUp = (e: PointerEvent) => {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		const dragged = this.dragId !== null;
		if (dragged) {
			this.overPoint(e.clientX, e.clientY);
			// The click that follows a drag isn't a click on whatever was under the pointer.
			window.addEventListener("click", this.swallowClick, { capture: true, once: true });
			setTimeout(() => window.removeEventListener("click", this.swallowClick, true), 0);
		}
		const drop = this.drop;
		const id = this.dragId;
		this.cancelDrag();
		if (dragged && id && drop) this.dropItem(id, drop);
	};

	private swallowClick = (e: Event) => {
		e.stopPropagation();
		e.preventDefault();
	};

	private onDragKey = (e: KeyboardEvent) => {
		if (e.key !== "Escape" || !this.press) return;
		e.preventDefault();
		e.stopPropagation();
		this.cancelDrag();
	};

	/** Ends the press or drag without dropping: Escape, a cancelled pointer, or after a drop. */
	private cancelDrag = () => {
		window.removeEventListener("pointermove", this.onDragMove, true);
		window.removeEventListener("pointerup", this.onDragUp, true);
		window.removeEventListener("pointercancel", this.cancelDrag, true);
		window.removeEventListener("keydown", this.onDragKey, true);
		cancelAnimationFrame(this.scrollFrame);
		if (this.dragId) this.hold("drag", false);
		this.ghost?.remove();
		this.ghost = null;
		this.press = null;
		this.dragId = null;
		this.drop = null;
		this.hoveredSpace = null;
	};

	private dropItem(id: string, drop: Drop) {
		if (drop.groupWith) {
			const folderId = newId();
			if (groupIntoFolder(this.state, drop.groupWith, id, "New folder", folderId)[1] === null) return;
			playCue("into-folder");
			this.apply({ op: "groupIntoFolder", targetId: drop.groupWith, draggedId: id, name: "New folder", id: folderId });
			this.renamingId = folderId;
			return;
		}
		// A move within the same list is silent; landing in a folder, or crossing between open and saved, is not.
		const wasOpen = this.state.spaces.some((s) => s.open.includes(id));
		const toOpen = drop.place.area === "open";
		if (drop.mode === "into") playCue("into-folder");
		else if (wasOpen && !toOpen) playCue("pin");
		else if (!wasOpen && toOpen) playCue("unpin");
		this.apply({ op: "moveItem", id, to: drop.place });
	}

	private dropClass(key: string): string {
		if (this.drop?.key !== key) return "";
		// New tab stays first: a drop there goes to the first open tab's place, so the line shows under it.
		if (key === "open-start") return "drop-after";
		return `drop-${this.drop.mode}`;
	}

	// ---- menus ---------------------------------------------------------------

	/** What opened the menu, so focus can go back to it when the menu closes. */
	private menuOpener: HTMLElement | null = null;
	/** The menu just opened: focus goes into it on the next render. */
	private focusMenu = false;
	/** A menu item ran: if nothing took focus after it, focus goes back to the opener. */
	private refocus = false;

	private openMenu(e: MouseEvent, items: MenuItem[], title?: string) {
		e.preventDefault();
		e.stopPropagation();
		const opener = e.currentTarget as HTMLElement;
		this.menuOpener = opener;
		// The context-menu key and Shift+F10 open it from the keyboard, where the point isn't on what's focused:
		// it opens under that instead.
		const r = opener.getBoundingClientRect();
		const onIt = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
		this.showMenu(onIt ? { x: e.clientX, y: e.clientY, items, title } : { x: r.left, y: r.bottom + 4, items, title });
	}

	/** Opens `menu`: in place, or in the browser's menu window, which hands back what's picked (menuPicked). */
	private showMenu(menu: Menu) {
		this.menu = menu;
		this.focusMenu = true;
		if (!this.floatingMenus) return;
		const space = activeSpace(this.state);
		this.browser.showMenu(
			{ title: menu.title, items: toEntries(menu.items), hue: space.hue, scheme: space.scheme },
			menu.x,
			menu.y,
		);
	}

	/** The browser's menu window picked the item at `path`. */
	menuPicked(path: number[]) {
		const item = this.menu && itemAt(this.menu.items, path);
		this.closeMenu();
		this.refocus = true;
		item?.run?.();
	}

	/** The browser's menu window closed with nothing picked (Escape, a click elsewhere). */
	menuClosed() {
		this.closeMenu();
		this.menuOpener?.focus();
	}

	/** Right-click on an extension's icon, in the address field or the Extensions panel: its own menu. */
	private extensionMenu = (e: MouseEvent, id: string) => {
		const x = this.extensions?.find((each) => each.id === id);
		if (!x) return;
		const items = extensionMenuItems(x).map(
			({ action, label }): MenuItem => ({
				label,
				danger: action === "remove",
				divider: action === "remove",
				run: () => {
					if (action === "pin" || action === "unpin") this.pinExtension(id, action === "pin");
					else this.browser.extensionAction(id, action);
				},
			}),
		);
		this.openMenu(e, items, x.name);
	};

	private closeMenu = () => {
		// Closed from here (Escape, a click on the sidebar): the browser's menu window goes too.
		if (this.menu && this.floatingMenus) this.browser.closeMenu();
		this.menu = null;
	};

	/** Asks the window to act on the page a tab shows; the sidebar has no page of its own. */
	private tabEvent(name: "loka-tab-mute" | "loka-tab-reload", tabId: TabId) {
		this.dispatchEvent(new CustomEvent(name, { detail: tabId, bubbles: true, composed: true }));
	}

	/** Puts a tab's address on the clipboard; the old copy command covers a page the clipboard API refuses. */
	private async copyLink(url: string) {
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			const area = Object.assign(document.createElement("textarea"), { value: url });
			this.renderRoot.appendChild(area);
			area.select();
			document.execCommand("copy");
			area.remove();
		}
	}

	private tabMenu(tabId: TabId): MenuItem[] {
		const state = this.state;
		const space = activeSpace(state);
		const tab = state.tabs[tabId];
		const isEssential = state.essentials.includes(tabId);
		const isOpen = space.open.includes(tabId);
		const items: MenuItem[] = [];
		const move = (cue: Cue, place: Place) => () => {
			playCue(cue);
			this.apply({ op: "moveItem", id: tabId, to: place });
		};
		if (isOpen) {
			items.push({
				label: "Pin to space",
				run: move("pin", { area: "pinned", spaceId: space.id, parentId: null, index: Infinity }),
			});
		} else if (!isEssential) {
			items.push({ label: "Unpin", run: move("unpin", { area: "open", spaceId: space.id, index: 0 }) });
		}
		if (!isEssential) {
			items.push({ label: "Add to Essentials", run: move("pin", { area: "essentials", index: Infinity }) });
		} else {
			items.push({
				label: "Remove from Essentials",
				run: move("unpin", { area: "open", spaceId: space.id, index: 0 }),
			});
		}
		const others = state.spaces.filter((s) => s.id !== space.id);
		if (others.length && !isEssential) {
			items.push({
				label: "Move to space",
				items: others.map((other) => ({
					label: other.name,
					run: () => {
						playCue("space");
						this.apply({ op: "moveItem", id: tabId, to: { area: "open", spaceId: other.id, index: 0 } });
					},
				})),
			});
		}
		if (!isEssential) {
			items.push({
				label: "New folder with this tab",
				run: () => {
					const folderId = newId();
					playCue("into-folder");
					this.apply({ op: "createFolder", spaceId: space.id, parentId: null, name: "New folder", id: folderId });
					this.apply({
						op: "moveItem",
						id: tabId,
						to: { area: "pinned", spaceId: space.id, parentId: folderId, index: 0 },
					});
					this.renamingId = folderId;
				},
			});
		}
		if (tab) {
			items.push(
				{
					label: "Duplicate",
					divider: true,
					run: () => {
						playCue("tab-open");
						this.apply({ op: "openTab", url: tab.url, title: tab.title, now: Date.now(), id: newId() });
					},
				},
				{ label: "Copy link", run: () => void this.copyLink(tab.url) },
			);
		}
		items.push(
			{
				label: this.live[tabId]?.muted ? "Unmute tab" : "Mute tab",
				run: () => this.tabEvent("loka-tab-mute", tabId),
			},
			{ label: "Reload", run: () => this.tabEvent("loka-tab-reload", tabId) },
			{
				label: isOpen ? "Close tab" : "Unload tab",
				divider: true,
				danger: isOpen,
				run: () => this.closeTabFor(tabId),
			},
		);
		const closable = space.open.filter((id) => id !== tabId);
		if (closable.length) {
			items.push({
				label: "Close other tabs",
				danger: true,
				run: () => {
					playCue("clear");
					this.apply({ op: "closeTabs", tabIds: closable, now: Date.now() });
				},
			});
		}
		return items;
	}

	/** Right-click on the sidebar's background: what you'd make here, and the space and sidebar themselves. */
	private emptyMenu(): MenuItem[] {
		const space = activeSpace(this.state);
		return [
			{ label: "New tab", run: () => this.command("new-tab") },
			{ label: "New folder", run: () => this.newFolder(null) },
			{ label: "New space", divider: true, run: () => this.action("new-space") },
			{ label: `Edit ${space.name}`, run: () => this.action("edit-space") },
			{
				label: this.pinned ? "Hide sidebar" : "Keep sidebar open",
				divider: true,
				run: () => this.action("toggle-sidebar"),
			},
		];
	}

	/** Right-click anywhere on the sidebar without a menu of its own (rows stop the event) opens the background's. */
	private backgroundMenu(e: MouseEvent) {
		const target = e.composedPath()[0];
		if (target instanceof Element && target.closest("input")) return;
		if (target instanceof Element && target.closest(".top, .panel, .menu")) {
			e.preventDefault();
			return;
		}
		this.openMenu(e, this.emptyMenu());
	}

	/** The bottom row's +: what you'd make next. */
	private newMenu(e: MouseEvent) {
		this.menuOpener = e.currentTarget as HTMLElement;
		const r = this.menuOpener.getBoundingClientRect();
		this.showMenu({
			x: r.left,
			y: r.top - 8 - 34 * 3 - 8,
			items: [
				{ label: "New tab", run: () => this.command("new-tab") },
				{ label: "New folder", run: () => this.newFolder(null) },
				{ label: "New space", run: () => this.action("new-space") },
			],
		});
		e.stopPropagation();
	}

	/**
	 * Keys on a sidebar row, following the tree pattern: Up and Down move between rows, Enter runs the row, Right
	 * opens a closed folder and Left closes an open one.
	 */
	private rowKey(e: KeyboardEvent, run: () => void, folderOpen?: boolean) {
		if (e.key === "Enter") run();
		else if (e.key === "ArrowRight" && folderOpen === false) run();
		else if (e.key === "ArrowLeft" && folderOpen === true) run();
		else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const rows = [...this.renderRoot.querySelectorAll<HTMLElement>('.scroll.shown [role="treeitem"]')];
			const at = rows.indexOf(e.currentTarget as HTMLElement);
			rows[at + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
		} else return;
		e.preventDefault();
	}

	private folderMenu(folderId: string): MenuItem[] {
		const spaceId = activeSpace(this.state).id;
		return [
			{ label: "Rename", run: () => (this.renamingId = folderId) },
			{
				label: "New folder inside",
				run: () => {
					const id = newId();
					this.apply({ op: "createFolder", spaceId, parentId: folderId, name: "New folder", id });
					this.renamingId = id;
				},
			},
			{ label: "Ungroup (keep tabs)", divider: true, run: () => this.apply({ op: "ungroupFolder", folderId }) },
		];
	}

	private toggle(folderId: string, open: boolean) {
		playCue(open ? "folder-close" : "folder-open");
		this.apply({ op: "toggleFolder", folderId });
	}

	private newFolder(parentId: string | null) {
		const id = newId();
		this.apply({ op: "createFolder", spaceId: activeSpace(this.state).id, parentId, name: "New folder", id });
		this.renamingId = id;
	}

	/** Back, forward and reload act on the page; the prototype's stand-in page has none, the real browser's does. */
	private nav(action: "back" | "forward" | "reload") {
		this.dispatchEvent(new CustomEvent("loka-nav", { detail: action, bubbles: true, composed: true }));
	}

	/** Commands the window handles (the space editor, pages, the tour) go up as one event, like the command bar's. */
	private action(action: ActionId) {
		this.dispatchEvent(new CustomEvent("loka-action", { detail: action, bubbles: true, composed: true }));
	}

	/** Asks the window for the command bar: to open a new tab, or to change the address of the one on screen. */
	private command(mode: CommandMode) {
		this.dispatchEvent(new CustomEvent<CommandMode>("loka-command", { detail: mode, bubbles: true, composed: true }));
	}

	// ---- spaces: the horizon ------------------------------------------------

	/** The space `step` places away from the current one, wrapping around. Null when there is no other space. */
	private neighbourAt(step: 1 | -1, state = this.state): Space | null {
		const spaces = state.spaces;
		if (spaces.length < 2) return null;
		// With two spaces both neighbours are the same one; show it once, on the right.
		if (spaces.length === 2 && step === -1) return null;
		const index = spaces.findIndex((s) => s.id === state.activeSpaceId);
		return spaces[(index + step + spaces.length) % spaces.length] ?? null;
	}

	private neighbour(target: Space | null, side: "left" | "right"): TemplateResult | typeof nothing {
		if (!target) return nothing;
		const shortcut = spaceShortcut(this.state.spaces.indexOf(target), this.state.spaces.length);
		return html`<button
			class="neighbour ${side}"
			aria-label=${shortcut ? `${target.name} (${keys(shortcut.replace("+", " "))})` : target.name}
			title=${shortcut ? `${target.name}, ${keys(shortcut)}` : target.name}
			@click=${() => this.switchTo(target.id)}
			.dropZone=${{ key: `space-${target.id}`, switchTo: target.id } satisfies DropZone}
		>
			${planet(target.planet, target.hue, 22)}
		</button>`;
	}

	private switchTo(spaceId: string) {
		if (spaceId === this.state.activeSpaceId) return;
		playCue("space");
		this.apply({ op: "switchSpace", spaceId });
	}

	private spacesMenu(): MenuItem[] {
		return [
			...this.state.spaces.map((s, i) => {
				const shortcut = spaceShortcut(i, this.state.spaces.length);
				return { label: s.name, hint: shortcut && keys(shortcut), run: () => this.switchTo(s.id) };
			}),
			{ label: "Edit this space", divider: true, run: () => this.action("edit-space") },
			{ label: "New space", run: () => this.action("new-space") },
		];
	}

	/** The sideways swipe in progress (swipe.logic.ts). */
	private gesture: SwipeState = SWIPE_IDLE;
	private settleTimer = 0;

	/**
	 * A sideways two-finger swipe anywhere on the sidebar drags the space's list with the fingers. Far enough and it
	 * turns to the next or previous space, one space per swipe however hard; let go before that and it springs back.
	 */
	private onWheel = {
		passive: false,
		handleEvent: (e: WheelEvent) => {
			// Lines and pages (a mouse's tilt wheel on some setups) count as about 16 px a line, like a scroll would.
			const unit = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 1 : 16;
			const step = swipeWheel(this.gesture, { dx: e.deltaX * unit, dy: e.deltaY * unit, time: e.timeStamp });
			this.gesture = step.state;
			if (!step.claimed) return;
			e.preventDefault();
			window.clearTimeout(this.settleTimer);
			// A pause springs the list back; whether the next event starts a new swipe is the gesture's to say.
			this.settleTimer = window.setTimeout(() => this.showSwipe(0), SWIPE_GAP);
			const target = step.turn ? (this.neighbourAt(step.turn) ?? this.neighbourAt(1)) : null;
			// With one space there is nowhere to go: the list stays put rather than following the fingers.
			this.showSwipe(this.neighbourAt(1) ? step.offset : 0);
			if (target) this.switchTo(target.id);
		},
	};

	/**
	 * Draws the list and the planet following the fingers. Straight onto the page's style, not through a render: a
	 * swipe sends an event a frame, and re-rendering the whole sidebar for each would be most of that frame.
	 */
	private showSwipe(offset: number) {
		const aside = this.renderRoot.querySelector("aside");
		if (!aside) return;
		aside.style.setProperty("--swipe", String(offset));
		aside.style.setProperty("--swipe-size", String(Math.abs(offset)));
		aside.classList.toggle("swiping", offset !== 0);
	}

	/** Which way the list slides in after a switch: from the right when moving forward, as if turning a page. */
	private slideFrom: "left" | "right" | null = null;

	/** Where each row and Essential was before this update, to animate from. Null when nothing should move. */
	private rowsBefore: Map<string, Was> | null = null;
	/** The rows' and Essentials' running slides and fades, so a new move can stop them without asking every row. */
	private rowAnimations = new Set<Animation>();
	/** The space shown before this one, whose list stays built for a switch back (builtSpaceIds). */
	private lastSpaceId: string | null = null;
	/** Lists sliding out after a switch, by list, so a switch back can stop one. */
	private listExits = new Map<HTMLElement, Animation>();
	/** A space whose list is no longer kept, still in the page until the switch has painted (builtSpaceIds). */
	private leavingSpaceId: string | null = null;

	/** Takes the list no longer kept out of the page after the frame that shows the switch. */
	private dropLeavingList() {
		const leaving = this.leavingSpaceId;
		if (!leaving) return;
		requestAnimationFrame(() =>
			setTimeout(() => {
				if (this.leavingSpaceId !== leaving) return;
				this.leavingSpaceId = null;
				this.requestUpdate();
			}, 0),
		);
	}
	/** The space's list before a switch, which slides out as the new one slides in. */
	private listBefore: { el: HTMLElement; rect: DOMRect; scrollTop: number; forward: boolean } | null = null;
	/** The horizon before a space switch: the space it showed and that space's neighbours, where the orbit turns from. */
	private horizonBefore: { space: Space; left: Space | null; right: Space | null; forward: boolean } | null = null;
	/** The orbit playing (animateHorizon): its animations, and when the last one ended, to run a burst of switches fast. */
	private orbitAnimations: Animation[] = [];
	private orbitRun = 0;
	private orbitEndedAt = Number.NEGATIVE_INFINITY;

	/** The now-playing card on screen: what plays, or for a moment after the browser stops reporting it, what did. */
	private shownPlaying: NowPlaying | null = null;
	private lingerTimer = 0;

	/**
	 * A tab can drop out of the browser's media sessions for a moment (pausing, resuming, a new track): the card
	 * stays 1.5 s after the last report before it leaves, so a short gap never makes it blink.
	 */
	private followPlaying() {
		window.clearTimeout(this.lingerTimer);
		if (this.playing) {
			this.shownPlaying = this.playing;
			return;
		}
		if (!this.shownPlaying) return;
		this.lingerTimer = window.setTimeout(async () => {
			if (this.playing) return;
			const card = this.renderRoot.querySelector("loka-media-card");
			await leave(card, 160);
			if (this.playing) {
				// It came back while fading: undo the fade, which otherwise holds it invisible.
				for (const fade of card?.getAnimations() ?? []) fade.cancel();
				return;
			}
			this.shownPlaying = null;
			this.requestUpdate();
		}, 1500);
	}

	protected override willUpdate(changed: Map<string, unknown>) {
		if (changed.has("panel") && this.panel === "downloads") {
			// Seen: the dot and the toast have said what they had to.
			this.unseenDownload = false;
			this.toast = null;
		}
		if (changed.has("browser") && this.browser) this.watchBrowser();
		if (changed.has("playing")) this.followPlaying();
		const before = changed.get("state") as BrowserState | undefined;
		if (!before) return;
		if (before.activeSpaceId !== this.state.activeSpaceId) {
			// The planet's name says where you are on screen; this says it to a screen reader.
			this.say(activeSpace(this.state).name);
			const forward = switchesForward(this.state, before.activeSpaceId, this.state.activeSpaceId);
			this.slideFrom = forward ? "right" : "left";
			// The list kept until now, unless it's the one being shown, leaves the page after this frame (updated).
			this.leavingSpaceId = this.lastSpaceId !== this.state.activeSpaceId ? this.lastSpaceId : null;
			this.lastSpaceId = before.activeSpaceId;
			// Read before the DOM changes, while layout is still clean: reading after would lay out the new list first.
			const list = this.renderRoot.querySelector<HTMLElement>(".scroll.shown");
			this.listBefore = list
				? { el: list, rect: list.getBoundingClientRect(), scrollTop: list.scrollTop, forward }
				: null;
			const was = before.spaces.find((s) => s.id === before.activeSpaceId);
			this.horizonBefore = was
				? { space: was, left: this.neighbourAt(-1, before), right: this.neighbourAt(1, before), forward }
				: null;
			return;
		}
		// Measuring every row costs a layout and a read per row: only when a row moves, comes or goes (a drag, a
		// folder opening, a tab closed), never for a new title, a page loading or the tab shown.
		if (!rowsMoved(before, this.state)) return;
		// Same space, new state: the DOM still shows the old rows, so this is where they are now.
		this.rowsBefore = new Map(
			[...this.renderRoot.querySelectorAll<HTMLElement>(ROW_ELEMENTS)].map((el) => [
				el.dataset.key ?? "",
				{ el, rect: el.getBoundingClientRect(), tile: el.classList.contains("essential") },
			]),
		);
	}

	/**
	 * Rows and Essentials move instead of jumping (FLIP): one that changed place slides from where it was, a tab
	 * pinned into Essentials flies from its row into its tile (and back out), a new one (an opened tab, a folder's
	 * contents) fades in from just above, and one that left fades out where it was while the rest close the gap.
	 * Transforms and opacity only; with reduced motion, only the fades.
	 */
	private animateRows() {
		const before = this.rowsBefore;
		this.rowsBefore = null;
		const scroll = this.renderRoot.querySelector<HTMLElement>(".scroll.shown");
		const grid = this.renderRoot.querySelector<HTMLElement>(".essentials");
		if (!before || !scroll || !grid) return;
		const still = reducedMotion();
		const now = new Map(
			[...this.renderRoot.querySelectorAll<HTMLElement>(ROW_ELEMENTS)].map((el) => [el.dataset.key ?? "", el]),
		);
		// All the writes that change what a read sees, then all the reads, then the animations: reads between writes
		// would lay the list out again for every row.
		for (const animation of this.rowAnimations) animation.cancel();
		this.rowAnimations.clear();
		const rects = new Map([...now].map(([key, el]) => [key, el.getBoundingClientRect()]));
		const animate = (el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
			const animation = el.animate(keyframes, options);
			this.rowAnimations.add(animation);
			animation.finished.then(
				() => this.rowAnimations.delete(animation),
				() => {},
			);
		};
		for (const [key, el] of now) {
			const was = before.get(key);
			const tile = el.classList.contains("essential");
			if (!was) {
				const from = still ? { opacity: 0 } : { opacity: 0, transform: tile ? "scale(0.85)" : "translateY(-6px)" };
				animate(el, [from, { opacity: 1, transform: "none" }], { duration: 220, easing: EASE_OUT });
				continue;
			}
			const rect = rects.get(key);
			if (still || !rect) continue;
			if (was.tile !== tile) {
				// Between a row and a tile: the icon travels, so the new shape grows from where the old one's icon was.
				const fromX = was.tile ? was.rect.left + was.rect.width / 2 : was.rect.left + 20;
				const fromY = was.rect.top + was.rect.height / 2;
				const dx = fromX - (tile ? rect.left + rect.width / 2 : rect.left + 20);
				const dy = fromY - (rect.top + rect.height / 2);
				animate(
					el,
					[
						{ transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.4 },
						{ transform: "none", opacity: 1 },
					],
					{ duration: 320, easing: EASE_OUT },
				);
				continue;
			}
			const dx = was.rect.left - rect.left;
			const dy = was.rect.top - rect.top;
			if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
				animate(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
					duration: 240,
					easing: EASE_OUT,
				});
			}
		}
		const boxes = { grid: grid.getBoundingClientRect(), scroll: scroll.getBoundingClientRect() };
		const scrolled = scroll.scrollTop;
		for (const [key, { el, rect, tile }] of before) {
			if (now.has(key) || el.isConnected) continue;
			// Lit has let go of the old element; put it back where it was, on top, just long enough to fade.
			const home = tile ? grid : scroll;
			const box = tile ? boxes.grid : boxes.scroll;
			el.classList.add("leaving");
			el.inert = true;
			el.setAttribute("aria-hidden", "true");
			el.removeAttribute("data-key");
			el.removeAttribute("role");
			Object.assign(el.style, {
				top: `${rect.top - box.top + (tile ? 0 : scrolled)}px`,
				left: `${rect.left - box.left}px`,
				width: `${rect.width}px`,
				height: `${rect.height}px`,
			});
			home.append(el);
			const to = still ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" };
			void el
				.animate([{ opacity: 1 }, to], { duration: 140, easing: EASE_IN, fill: "forwards" })
				.finished.then(() => el.remove());
		}
	}

	/**
	 * Switching spaces turns the orbit (orbit.logic.ts): the planet you were on shrinks into the neighbour place it
	 * now belongs in, and the one you picked grows out of its place into the horizon. Stand-ins in a layer over the
	 * horizon make the trip; the horizon's own planets stay hidden under them until it ends, so nothing in the
	 * sidebar's layout moves. The list is usable from the first frame: the orbit never blocks input.
	 */
	private animateHorizon() {
		const before = this.horizonBefore;
		this.horizonBefore = null;
		const horizon = this.renderRoot.querySelector<HTMLElement>(".horizon");
		if (!before || !horizon) return;
		const run = ++this.orbitRun;
		const busy = this.orbitAnimations.length > 0;
		for (const a of this.orbitAnimations) a.cancel();
		this.orbitAnimations = [];
		horizon.querySelector(":scope > .orbit")?.remove();
		for (const n of horizon.querySelectorAll(".landing")) n.classList.remove("landing");
		horizon.classList.remove("orbiting");
		if (reducedMotion()) return;
		const duration = busy || performance.now() - this.orbitEndedAt < ORBIT.repeatMs ? ORBIT.fast : ORBIT.duration;
		const width = this.horizonWidth;
		if (!width) return;
		const to = activeSpace(this.state);
		const left = this.neighbourAt(-1);
		const right = this.neighbourAt(1);
		const layer = document.createElement("div");
		layer.className = "orbit";
		layer.setAttribute("aria-hidden", "true");
		horizon.append(layer);
		horizon.classList.add("orbiting");
		const play = (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions = {}) => {
			const a = el.animate(frames, { duration, fill: "both", ...options });
			this.orbitAnimations.push(a);
			return a;
		};

		// The old neighbours, except the one coming in, fade where they are.
		for (const [side, space] of [
			["left", before.left],
			["right", before.right],
		] as const) {
			if (!space || space.id === to.id) continue;
			const ghost = document.createElement("div");
			ghost.className = `ghost ${side}`;
			render(planet(space.planet, space.hue, 22), ghost);
			layer.append(ghost);
			play(
				ghost,
				[
					{ opacity: 1, transform: "none" },
					{ opacity: 0, transform: "scale(0.5)" },
				],
				{
					duration: 0.3 * duration,
					easing: EASE_IN,
				},
			);
		}
		// The new neighbours: the one the leaving planet lands in waits for it; another fades in once the way is clear.
		for (const n of horizon.querySelectorAll<HTMLElement>(":scope > .neighbour")) {
			const space = n.classList.contains("left") ? left : right;
			if (space?.id === before.space.id) n.classList.add("landing");
			else {
				play(
					n,
					[
						{ opacity: 0, transform: "scale(0.5)" },
						{ opacity: 1, transform: "none" },
					],
					{
						duration: 0.5 * duration,
						delay: 0.3 * duration,
						easing: EASE_OUT,
					},
				);
			}
		}
		// The name says where you are, so it's readable almost at once.
		const name = horizon.querySelector(":scope > .world-name");
		if (name) {
			play(
				name,
				[
					{ opacity: 0, transform: "translateY(3px)" },
					{ opacity: 1, transform: "none" },
				],
				{
					duration: 0.5 * duration,
					delay: 0.1 * duration,
					easing: EASE_OUT,
				},
			);
		}

		const placeOf = (id: string, l: Space | null, r: Space | null, off: OrbitPlace): OrbitPlace =>
			l?.id === id ? "left" : r?.id === id ? "right" : off;
		const body = (space: Space, frames: ReturnType<typeof orbitFrames>) => {
			const el = document.createElement("div");
			el.className = "body";
			render(html`${planet(space.planet, space.hue, 360, true)}${planet(space.planet, space.hue, 360)}`, el);
			layer.append(el);
			const [horizonDrawing, roundDrawing] = el.children;
			if (horizonDrawing) play(horizonDrawing, frames.horizon);
			if (roundDrawing) play(roundDrawing, frames.round);
			return play(el, frames.body);
		};
		const end = placeOf(before.space.id, left, right, before.forward ? "offLeft" : "offRight");
		body(before.space, orbitFrames(leavePath(orbitPoint(end, width), width), width));
		const start = placeOf(to.id, before.left, before.right, before.forward ? "offRight" : "offLeft");
		const last = body(to, orbitFrames(arrivePath(orbitPoint(start, width), width), width));
		void last.finished.then(
			() => {
				if (this.orbitRun !== run) return;
				layer.remove();
				horizon.classList.remove("orbiting");
				for (const n of horizon.querySelectorAll(".landing")) n.classList.remove("landing");
				for (const a of this.orbitAnimations) a.cancel();
				this.orbitAnimations = [];
				this.orbitEndedAt = performance.now();
			},
			() => {},
		);
	}

	private moreMenu(e: MouseEvent) {
		this.openMenu(e, [
			{ label: "New space", run: () => this.action("new-space") },
			{ label: "Search the sidebar", run: () => this.openPanel("search") },
			{ label: "Downloads", run: () => this.openPanel("downloads") },
			{ label: `Archived tabs (${this.state.archive.length})`, run: () => this.openPanel("archive") },
			{ label: "History", run: () => this.action("history") },
			{ label: "Library", run: () => this.action("library") },
			{ label: this.soundOn ? "Mute sounds" : "Unmute sounds", run: () => this.action("toggle-sound") },
			{ label: "Settings", run: () => this.action("settings") },
			{ label: "Show the welcome tour", divider: true, run: () => this.action("onboarding") },
			{ label: "Export spaces (JSON)", divider: true, run: () => this.exportFile() },
			{ label: "Import spaces (JSON)", run: () => this.importFile() },
			...(this.demo
				? [
						{
							label: "Reset demo data",
							divider: true,
							run: () => this.dispatchEvent(new CustomEvent("loka-reset", { bubbles: true, composed: true })),
						},
					]
				: []),
		]);
	}

	private exportFile() {
		const blob = new Blob([exportState(this.state)], { type: "application/json" });
		const link = Object.assign(document.createElement("a"), {
			href: URL.createObjectURL(blob),
			download: "loka-spaces.json",
		});
		link.click();
		URL.revokeObjectURL(link.href);
	}

	private importFile() {
		const input = Object.assign(document.createElement("input"), { type: "file", accept: "application/json" });
		input.addEventListener("change", async () => {
			const text = await input.files?.[0]?.text();
			const parsed = text ? importState(text) : null;
			if (parsed) this.apply({ op: "replaceState", state: parsed });
			else alert("That file isn't a Loka spaces export.");
		});
		input.click();
	}

	// ---- rendering -----------------------------------------------------------

	private favicon(tabId: TabId, url: string, size = 18): TemplateResult {
		const live = this.live[tabId];
		return html`<span
			class="fav ${live?.loading ? "loading" : ""}"
			aria-hidden="true"
			style="--fav: ${faviconBackground(url, live)}; --size: ${size}px"
		>${faviconInner(url, live)}</span>`;
	}

	/** The speaker on a row whose page is playing sound, or was muted while it did. Clicking it mutes or unmutes. */
	private sound(tabId: TabId, title: string): TemplateResult | typeof nothing {
		const live = this.live[tabId];
		if (!live?.audible && !live?.muted) return nothing;
		return html`<button
			class="sound ${live.muted ? "muted" : ""}"
			aria-label="${live.muted ? "Unmute" : "Mute"} ${title}"
			aria-pressed=${Boolean(live.muted)}
			@click=${(e: Event) => {
				e.stopPropagation();
				this.dispatchEvent(new CustomEvent("loka-tab-mute", { detail: tabId, bubbles: true, composed: true }));
			}}
		>
			${
				live.muted
					? html`<svg viewBox="0 0 16 16"><path d="M3 6h2.5L9 3v10L5.5 10H3zM11.5 6l3 4m0-4-3 4" /></svg>`
					: html`<svg viewBox="0 0 16 16"><path d="M3 6h2.5L9 3v10L5.5 10H3zM11.5 5.5a3.5 3.5 0 0 1 0 5" /></svg>`
			}
		</button>`;
	}

	/**
	 * A tab's row. `where` names its place (space, folder, index), which `place` works out: the row is drawn again
	 * only when it, the tab, its page or its highlight changes (guard), so a change to one tab redraws one row.
	 */
	private tabRow(
		tabId: TabId,
		depth: number,
		place: (mode: DropMode) => Place | null,
		closable: boolean,
		where: string,
		activeTabId: TabId | null,
	) {
		const tab = this.state.tabs[tabId];
		if (!tab) return nothing;
		const active = activeTabId === tabId;
		const dragging = this.dragId === tabId;
		const drop = this.dropClass(tabId);
		const live = this.live[tabId];
		return guard([tab, live, active, dragging, drop, depth, closable, where], () =>
			this.tabRowView(tab, depth, place, closable, active),
		);
	}

	private tabRowView(
		tab: Tab,
		depth: number,
		place: (mode: DropMode) => Place | null,
		closable: boolean,
		active: boolean,
	): TemplateResult {
		const tabId = tab.id;
		return html`
			<div
				class="row ${active ? "active" : ""} ${this.live[tabId]?.unloaded ? "unloaded" : ""} ${this.dragId === tabId ? "dragging" : ""} ${this.dropClass(tabId)}"
				data-key=${tabId}
				style="--depth: ${depth}"
				role="treeitem"
				aria-level=${depth + 1}
				aria-selected=${active}
				tabindex="0"
				@pointerdown=${(e: PointerEvent) => this.pressDrag(e, tabId)}
				.dropZone=${{ key: tabId, place, into: "tab" } satisfies DropZone}
				@click=${() => this.apply({ op: "activateTab", tabId, now: Date.now() })}
				@mousedown=${(e: MouseEvent) => e.button === 1 && e.preventDefault()}
				@auxclick=${(e: MouseEvent) => {
					// A middle click closes the tab, as on a browser's tab strip; a pinned one unloads.
					if (e.button !== 1) return;
					e.preventDefault();
					this.closeTabFor(tabId);
				}}
				@keydown=${(e: KeyboardEvent) => this.rowKey(e, () => this.apply({ op: "activateTab", tabId, now: Date.now() }))}
				@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.tabMenu(tabId))}
			>
				${this.favicon(tabId, tab.url)}
				<span class="label">${tab.title}</span>
				<span class="trail">
				${this.sound(tabId, tab.title)}
				${
					closable
						? html`<button
								class="close"
								aria-label="Close ${tab.title}"
								title="Close tab"
								@click=${(e: Event) => {
									e.stopPropagation();
									this.closeTabFor(tabId);
								}}
							>
								<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
							</button>`
						: nothing
				}
				</span>
			</div>
		`;
	}

	private pinnedRow(row: PinnedRow, space: Space) {
		const { node, depth, parentId, index } = row;
		const spaceId = space.id;
		const where = `${spaceId}/${parentId}/${index}`;
		const sibling = (mode: DropMode): Place => ({
			area: "pinned",
			spaceId,
			parentId,
			index: mode === "before" ? index : index + 1,
		});
		if (node.kind === "tab") return this.tabRow(node.id, depth, sibling, false, where, space.activeTabId);

		const folderPlace = (mode: DropMode): Place => {
			// Dropping on the lower half of an open folder puts the item first inside it, which is where it shows.
			if (mode === "into") return { area: "pinned", spaceId, parentId: node.id, index: node.children.length };
			if (mode === "after" && node.open) return { area: "pinned", spaceId, parentId: node.id, index: 0 };
			return sibling(mode);
		};
		const renaming = this.renamingId === node.id;
		const activeId = space.activeTabId;
		const holdsActive = !node.open && activeId !== null && folderHolds(node, activeId);
		const dragging = this.dragId === node.id;
		const drop = this.dropClass(node.id);
		return guard([node, depth, where, renaming, holdsActive, dragging, drop], () =>
			this.folderRowView(node, depth, folderPlace, renaming, holdsActive),
		);
	}

	private folderRowView(
		node: FolderNode,
		depth: number,
		folderPlace: (mode: DropMode) => Place,
		renaming: boolean,
		holdsActive: boolean,
	): TemplateResult {
		return html`
			<div
				class="row folder ${this.dragId === node.id ? "dragging" : ""} ${this.dropClass(node.id)}"
				data-key=${node.id}
				style="--depth: ${depth}"
				role="treeitem"
				aria-level=${depth + 1}
				aria-expanded=${node.open}
				tabindex="0"
				@pointerdown=${(e: PointerEvent) => !renaming && this.pressDrag(e, node.id)}
				.dropZone=${{ key: node.id, place: folderPlace, into: "folder" } satisfies DropZone}
				@click=${() => !renaming && this.toggle(node.id, node.open)}
				@dblclick=${() => (this.renamingId = node.id)}
				@keydown=${(e: KeyboardEvent) => !renaming && this.rowKey(e, () => this.toggle(node.id, node.open), node.open)}
				@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.folderMenu(node.id))}
			>
				${
					node.open
						? html`<svg class="folder-icon" viewBox="0 0 16 16" aria-hidden="true">
								<path class="back" d="M2.4 12.6 1.6 12V4.6c0-.8.6-1.4 1.4-1.4h3l1.6 1.6h4.2c.8 0 1.4.6 1.4 1.4v1.1" />
								<path class="body" d="M4.2 7.4h10.1c.6 0 1 .6.8 1.1l-1.4 4.2c-.2.5-.6.8-1.1.8H2.3c-.6 0-1-.6-.8-1.1l1.5-4.2c.2-.5.6-.8 1.2-.8z" />
							</svg>`
						: html`<svg class="folder-icon" viewBox="0 0 16 16" aria-hidden="true">
								<path class="body" d="M1.6 4.6c0-.8.6-1.4 1.4-1.4h3l1.6 1.6H13c.8 0 1.4.6 1.4 1.4v6.2c0 .8-.6 1.4-1.4 1.4H3c-.8 0-1.4-.6-1.4-1.4z" />
								<path class="lip" d="M1.9 6.6h12.2" />
								${holdsActive ? svg`<circle class="holds" cx="13" cy="12.4" r="2.2" />` : nothing}
							</svg>`
				}
				${
					renaming
						? html`<input
								class="rename"
								.value=${node.name}
								aria-label="Folder name"
								@click=${(e: Event) => e.stopPropagation()}
								@keydown=${(e: KeyboardEvent) => {
									e.stopPropagation();
									if (e.key === "Enter") (e.target as HTMLInputElement).blur();
									if (e.key === "Escape") this.renamingId = null;
								}}
								@blur=${(e: Event) => {
									const name = (e.target as HTMLInputElement).value.trim();
									if (this.renamingId === node.id && name) this.apply({ op: "renameFolder", folderId: node.id, name });
									this.renamingId = null;
								}}
							/>`
						: html`<span class="label">${node.name}</span>`
				}
				<span class="count">${node.open ? "" : node.children.length}</span>
			</div>
		`;
	}

	/**
	 * Switching spaces turns the page, like Arc: the old space's list slides out to one side as the new one slides in
	 * from the other. The old list is the element Lit just let go of, put back where it was for its exit.
	 */
	private animateListExit() {
		const before = this.listBefore;
		this.listBefore = null;
		const aside = this.renderRoot.querySelector("aside");
		if (!before || !aside) return;
		const shown = this.renderRoot.querySelector<HTMLElement>(".scroll.shown");
		// A list shown again while it was still leaving (a quick switch back) stops leaving where it is.
		const leaving = shown && this.listExits.get(shown);
		if (shown && leaving) {
			leaving.cancel();
			this.listExits.delete(shown);
			shown.style.cssText = "";
		}
		const { el, rect } = before;
		if (el === shown || reducedMotion()) return;
		// A kept list leaves where it is and stays built once it's out of sight; one Lit let go of (its space is no
		// longer built) is put back just for its exit.
		const kept = el.isConnected;
		const box = aside.getBoundingClientRect();
		el.classList.remove("from-left", "from-right");
		el.classList.add("leaving-list");
		if (!kept) {
			el.inert = true;
			el.setAttribute("aria-hidden", "true");
		}
		Object.assign(el.style, {
			top: `${rect.top - box.top}px`,
			left: `${rect.left - box.left}px`,
			width: `${rect.width}px`,
			height: `${rect.height}px`,
		});
		if (!kept) aside.append(el);
		el.scrollTop = before.scrollTop;
		const exit = el.animate(
			[
				{ opacity: 1, translate: "0 0" },
				{ opacity: 0, translate: `${before.forward ? -56 : 56}px 0` },
			],
			{ duration: 220, easing: EASE_IN, fill: "forwards" },
		);
		this.listExits.set(el, exit);
		exit.finished.then(
			() => {
				this.listExits.delete(el);
				if (!kept) {
					el.remove();
					return;
				}
				// Out of sight: back to a kept list, hidden by its class rather than by the exit's last frame.
				el.classList.remove("leaving-list");
				el.style.cssText = "";
				exit.cancel();
			},
			() => {},
		);
	}

	/**
	 * Keeps room under the list's last row for what sits over its bottom (the planets, the media card), and the
	 * horizon's width for the orbit: read during a switch, it would lay out the new list a second time.
	 */
	private bottomObserver: ResizeObserver | null = null;
	private horizonWidth = 0;

	private watchBottom() {
		const bottom = this.renderRoot.querySelector<HTMLElement>(".bottom");
		const horizon = this.renderRoot.querySelector<HTMLElement>(".horizon");
		if (this.bottomObserver || !bottom || !horizon) return;
		this.bottomObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const size = entry.borderBoxSize[0];
				if (entry.target === horizon) {
					this.horizonWidth = size?.inlineSize ?? horizon.clientWidth;
					continue;
				}
				// Rows may pass under the fade's clear top; the last one scrolls up to where the card or planet starts.
				const height = size?.blockSize ?? bottom.offsetHeight;
				this.renderRoot.querySelector("aside")?.style.setProperty("--bottom-room", `${Math.max(0, height - 40)}px`);
			}
		});
		this.bottomObserver.observe(bottom);
		this.bottomObserver.observe(horizon);
	}

	/**
	 * Tells the window something here needs a hidden sidebar to stay open (a menu or panel, a drag); the window keeps
	 * the browser told (hold.logic.ts).
	 */
	private hold(reason: "menu" | "drag", on: boolean) {
		this.dispatchEvent(new CustomEvent("loka-hold", { detail: { reason, on }, bubbles: true, composed: true }));
	}
	/** Whether a menu or panel was open at the last update, for the hold. */
	private heldOpen = false;

	protected override updated() {
		const open = this.menu !== null || this.panel !== null;
		if (open !== this.heldOpen) {
			this.heldOpen = open;
			this.hold("menu", open);
		}
		this.watchBottom();
		this.dropLeavingList();
		this.animateListExit();
		this.animateRows();
		this.animateHorizon();
		const input = this.renderRoot.querySelector<HTMLInputElement>("input.rename");
		if (input && document.activeElement !== this && this.shadowRoot?.activeElement !== input) {
			input.focus();
			input.select();
		}
		if (this.focusMenu && this.menu) {
			this.focusMenu = false;
			this.renderRoot.querySelector<LokaMenu>("loka-menu")?.focusFirst();
		}
		if (this.refocus && !this.menu) {
			this.refocus = false;
			if (!this.shadowRoot?.activeElement && this.menuOpener?.isConnected) this.menuOpener.focus();
		}
	}

	/** The top row is the window's title bar too: its empty space drags the window, a double-click maximizes. */
	private onTopPress(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (e.button !== 0 || e.detail !== 1 || target.closest("button")) return;
		this.browser.startWindowDrag();
	}

	private topRow(): TemplateResult {
		const hide = this.pinned;
		const mac = PLATFORM === "mac";
		return html`<div
			class="top"
			@mousedown=${(e: MouseEvent) => this.onTopPress(e)}
			@dblclick=${(e: MouseEvent) => !(e.target as HTMLElement).closest("button") && this.browser.windowAction("maximize")}
		>
			${
				// On a Mac the window's own buttons (the traffic lights) sit at the top left, drawn by macOS: the row leaves
				// them room and draws no window buttons of its own.
				mac ? html`<span class="traffic-lights" aria-hidden="true"></span>` : nothing
			}
			<button class="icon" aria-label="More" title="Menu" @click=${(e: MouseEvent) => this.moreMenu(e)}>
				<svg viewBox="0 0 20 20"><path d="M4.5 10h.01M10 10h.01M15.5 10h.01" class="dots" /></svg>
			</button>
			<button
				class="icon"
				aria-label=${hide ? "Hide sidebar" : "Keep sidebar open"}
				title=${hide ? "Hide the sidebar. It slides back when the mouse reaches the window's edge" : "Keep the sidebar open"}
				@click=${() => this.action("toggle-sidebar")}
			>
				${
					hide
						? html`<svg viewBox="0 0 20 20"><rect x="2.75" y="4" width="14.5" height="12" rx="2.5" /><path d="M7.5 4v12" /><path d="m13.25 8-2 2 2 2" /></svg>`
						: html`<svg viewBox="0 0 20 20"><rect x="2.75" y="4" width="14.5" height="12" rx="2.5" /><path d="M7.5 4v12" /><path class="fill" d="M3.5 5.5a1.5 1.5 0 0 1 1.5-1.5h2.5v12H5a1.5 1.5 0 0 1-1.5-1.5z" /></svg>`
				}
			</button>
			<span class="nav">
				<button class="icon" aria-label="Back" title="Back" @click=${() => this.nav("back")}>
					<svg viewBox="0 0 20 20"><path d="M16 10H4.5M9 5l-5 5 5 5" /></svg>
				</button>
				<button class="icon forward" aria-label="Forward" title="Forward" @click=${() => this.nav("forward")}>
					<svg viewBox="0 0 20 20"><path d="M4 10h11.5M11 5l5 5-5 5" /></svg>
				</button>
				<button class="icon reload" aria-label="Reload" title="Reload" @click=${() => this.nav("reload")}>
					<svg viewBox="0 0 20 20"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.5h-3.5" /></svg>
				</button>
			</span>
			${
				this.soundOn
					? nothing
					: html`<button
							class="icon sounds-off"
							aria-label="Sounds are off"
							title="Sounds are off. Turn them on"
							@click=${() => this.action("toggle-sound")}
						>
							<svg viewBox="0 0 20 20"><path d="M4 8h2.5L10 5v10l-3.5-3H4zM13 8l4 4m0-4-4 4" /></svg>
						</button>`
			}
			<span class="drag" aria-hidden="true"></span>
			${
				mac
					? nothing
					: html`<button class="icon caption" aria-label="Minimize" title="Minimize" @click=${() => this.browser.windowAction("minimize")}>
				<svg viewBox="0 0 20 20"><path d="M5 10h10" /></svg>
			</button>
			<button class="icon caption" aria-label="Maximize" title="Maximize" @click=${() => this.browser.windowAction("maximize")}>
				<svg viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1.5" /></svg>
			</button>
			<button class="icon caption close-window" aria-label="Close window" title="Close" @click=${() => this.browser.windowAction("close")}>
				<svg viewBox="0 0 20 20"><path d="m5.5 5.5 9 9m0-9-9 9" /></svg>
			</button>`
			}
		</div>`;
	}

	/** The address field: the page's site, opening the command bar on this tab; the pinned extensions sit inside it. */
	private addressField(): TemplateResult {
		const current = activeTab(this.state);
		const secure = current?.url.startsWith("https://");
		// Browser and extension pages (an options page) have no site name worth showing; their title says more.
		const own = current ? /^(chrome|chrome-extension|loka|about):/.test(current.url) : false;
		const label = !current ? "" : own ? current.title : hostOf(current.url);
		const loading = current ? this.live[current.id]?.loading : false;
		return html`<div class="url ${loading ? "loading" : ""}">
			<button
				class="address"
				aria-label=${label ? `Address: ${label}` : "Search or enter address"}
				title=${keys("Change the address (Ctrl+L)")}
				@click=${() => this.command(current ? "focus-location" : "new-tab")}
			>
				${
					!current
						? html`<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="m13 13 3.5 3.5" /></svg>`
						: secure
							? html`<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="9" width="10" height="7.5" rx="2" /><path d="M7.25 9V7a2.75 2.75 0 0 1 5.5 0v2" /></svg>`
							: own
								? planet(activeSpace(this.state).planet, activeSpace(this.state).hue, 16)
								: html`<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="M10 7v.01M10 9.5v4" /></svg>`
				}
				<span class="host ${label ? "" : "placeholder"}">${label || "Search or enter address"}</span>
			</button>
			<span class="pill-tools">
				<span class="pinned-ext">
					${toolbarExtensions(this.extensions).map(
						(x) => html`<button
							class="tool"
							aria-label=${x.name}
							title=${x.badge ? `${x.name}: ${x.badge}` : x.name}
							@click=${(e: Event) => this.runExtension(e, x.id)}
							@contextmenu=${(e: MouseEvent) => this.extensionMenu(e, x.id)}
						>
							${extensionIcon(x, 18)}
						</button>`,
					)}
				</span>
				${this.panelButton(
					"extensions",
					"Extensions",
					html`<svg viewBox="0 0 20 20"><path d="M8 3.5h3.5v2.25a1.25 1.25 0 0 0 2.5 0V5.5h2.5v4h-.75a1.25 1.25 0 0 0 0 2.5h.75v4.5H12v-.75a1.25 1.25 0 0 0-2.5 0v.75H3.5V12h.75a1.25 1.25 0 0 0 0-2.5H3.5v-4H8z" /></svg>`,
				)}
			</span>
		</div>`;
	}

	/**
	 * A space's list: its pinned tree, the divider and its open tabs. The one on screen is `shown`; the other built
	 * one stays in the page for a quick switch back, not drawn, laid out or reachable (`kept`, see builtSpaceIds).
	 */
	private spaceList(space: Space, shown: boolean, draggingTab: boolean): TemplateResult {
		const rows = pinnedRows(space.pinned);
		// Above the divider is pinned: a tab dropped on the gap or the divider itself goes to the end of the pinned list.
		const toPinnedEnd = (): Place => ({ area: "pinned", spaceId: space.id, parentId: null, index: Infinity });
		const openStart = (): Place => ({ area: "open", spaceId: space.id, index: 0 });
		const slide = shown && this.slideFrom ? `from-${this.slideFrom}` : "";
		return html`<div
			class="scroll ${shown ? "shown" : "kept"} ${slide}"
			.inert=${!shown}
			aria-hidden=${shown ? nothing : "true"}
		>
			<div class="pinned" role="tree" aria-label="Pinned in ${space.name}">
				${repeat(
					rows,
					(row) => row.node.id,
					(row) => this.pinnedRow(row, space),
				)}
				<div
					class="end-zone ${draggingTab ? "ready" : ""} ${this.dropClass("pinned-end")}"
					data-key="pinned-end"
					.dropZone=${{ key: "pinned-end", place: toPinnedEnd } satisfies DropZone}
				></div>
			</div>

			<div
				class="divider"
				data-key="divider"
				.dropZone=${
					{
						key: "pinned-end",
						// Its top half pins at the end of the pinned list; its bottom half is the first open tab.
						place: (mode: DropMode): Place => (mode === "before" ? toPinnedEnd() : openStart()),
						keyFor: (mode: DropMode) => (mode === "before" ? "pinned-end" : "open-start"),
					} satisfies DropZone
				}
			>
				<span></span>
				${
					space.open.length > 0
						? html`<button
								class="clear"
								title="Close every open tab in ${space.name}"
								@click=${() => {
									playCue("clear");
									this.apply({ op: "closeTabs", tabIds: space.open, now: Date.now() });
								}}
							>
								<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v8M4.5 7.5 8 11l3.5-3.5M4 13.5h8" /></svg>Clear
							</button>`
						: nothing
				}
			</div>

			<div class="open" role="tree" aria-label="Open tabs in ${space.name}">
				<button
					class="row new-tab ${this.dropClass("open-start")}"
					data-key="new-tab"
					@click=${() => this.command("new-tab")}
					.dropZone=${{ key: "open-start", place: openStart } satisfies DropZone}
				>
					<svg class="plus" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg><span class="label">New tab</span>
				</button>
				${repeat(
					space.open,
					(id) => id,
					(id, index) =>
						this.tabRow(
							id,
							0,
							(mode) => ({ area: "open", spaceId: space.id, index: mode === "before" ? index : index + 1 }),
							true,
							`open/${space.id}/${index}`,
							space.activeTabId,
						),
				)}
			</div>
		</div>`;
	}

	override render() {
		const state = this.state;
		const space = activeSpace(state);
		const count = state.essentials.length;
		const draggingTab = this.dragId !== null && state.tabs[this.dragId] !== undefined;
		const slots = essentialsDropSlots(count, draggingTab);
		const toEssentials = (): Place => ({ area: "essentials", index: Infinity });

		return html`
			<aside
				class=${this.pinned ? "" : "floating"}
				@click=${() => {
					this.closeMenu();
					void this.closePanel();
				}}
				@loka-close-panel=${() => void this.closePanel()}
				@dragstart=${(e: DragEvent) => {
					// The browser's own drag of a favicon image would cancel the pointer drag under it (pointercancel):
					// a press on a row's icon then moved nothing. Sidebar drags are pointer events only.
					e.preventDefault();
				}}
				@wheel=${this.onWheel}
				@contextmenu=${(e: MouseEvent) => this.backgroundMenu(e)}>
				${this.topRow()}
				${this.addressField()}

				${
					count === 0
						? // None yet: no room taken. While a tab is dragged, three slots fade in where the address field is, so
							// no row moves under the pointer.
							html`<div class="essentials empty" role="list" aria-label="Essentials">
								${
									slots
										? html`<div class="tray" aria-hidden="true">
												${Array.from(
													{ length: slots },
													(_, i) => html`<div
														class="essential ghost ${this.dropClass(`essentials-slot-${i}`)}"
														.dropZone=${{ key: `essentials-slot-${i}`, place: toEssentials } satisfies DropZone}
													></div>`,
												)}
											</div>`
										: nothing
								}
							</div>`
						: html`<div class="essentials" role="list" aria-label="Essentials">
								${repeat(
									state.essentials,
									(id) => id,
									(id, index) => {
										const tab = state.tabs[id];
										if (!tab) return nothing;
										const active = space.activeTabId === id;
										const dragging = this.dragId === id;
										const drop = this.dropClass(id);
										return guard(
											[tab, this.live[id], active, dragging, drop, index],
											() => html`
											<button
												class="essential ${active ? "active" : ""} ${this.live[id]?.unloaded ? "unloaded" : ""} ${this.dragId === id ? "dragging" : ""} ${this.dropClass(id)}"
												data-key=${id}
												role="listitem"
												title=${tab.title}
												aria-label=${tab.title}
												@pointerdown=${(e: PointerEvent) => this.pressDrag(e, id)}
												.dropZone=${
													{
														key: id,
														place: (mode: DropMode): Place => ({
															area: "essentials",
															index: mode === "before" ? index : index + 1,
														}),
														axis: "x",
													} satisfies DropZone
												}
												@click=${() => this.apply({ op: "activateTab", tabId: id, now: Date.now() })}
												@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.tabMenu(id))}
											>
												${this.favicon(id, tab.url, 24)}
											</button>
										`,
										);
									},
								)}
								${
									// The drop slot sits in a free cell of the last row, never a new row: adding a row
									// when a drag starts would shift everything under the pointer.
									slots
										? html`<div
												class="essential slot ${this.dropClass("essentials-end")}"
												aria-hidden="true"
												.dropZone=${{ key: "essentials-end", place: toEssentials } satisfies DropZone}
											></div>`
										: nothing
								}
							</div>`
				}
				${repeat(
					builtSpaceIds(state, this.lastSpaceId, this.leavingSpaceId),
					(id) => id,
					(id) => {
						const built = state.spaces.find((s) => s.id === id);
						return built ? this.spaceList(built, built.id === space.id, draggingTab) : nothing;
					},
				)}

				<div class="bottom">
				${this.toastView()}
				${
					this.shownPlaying
						? html`<loka-media-card
								class="media"
								.playing=${this.shownPlaying}
								.live=${this.shownPlaying.tab ? this.live[this.shownPlaying.tab.id] : undefined}
							></loka-media-card>`
						: nothing
				}
				<nav class="horizon" aria-label="Spaces">
					${keyed(`left-${this.neighbourAt(-1)?.id}`, this.neighbour(this.neighbourAt(-1), "left"))}
					${keyed(
						space.id,
						html`<button
								class="world"
								aria-label="Spaces: ${space.name}"
								title="All spaces"
								@click=${(e: MouseEvent) => this.openMenu(e, this.spacesMenu())}
							>
								${planet(space.planet, space.hue, 360, true)}
							</button>
							<span class="world-name" aria-hidden="true"><span>${space.name}</span></span>`,
					)}
					${keyed(`right-${this.neighbourAt(1)?.id}`, this.neighbour(this.neighbourAt(1), "right"))}
					<button class="new" aria-label="New" title="New tab, folder or space" @click=${(e: MouseEvent) => this.newMenu(e)}>
						<svg viewBox="0 0 20 20"><path d="M10 4.5v11M4.5 10h11" /></svg>
					</button>
					${this.downloadsButton()}
				</nav>
				</div>

				${
					this.panel
						? html`<div
								class="panel ${this.panel === "downloads" ? "rises" : ""}"
								role="dialog"
								aria-label=${PANEL_NAMES[this.panel]}
								@click=${(e: Event) => e.stopPropagation()}
								@keydown=${(e: KeyboardEvent) => {
									if (e.key === "Escape") void this.closePanel();
								}}
							>
								${this.panelBody(this.panel)}
							</div>`
						: nothing
				}
				${this.menu && !this.floatingMenus ? this.menuView(this.menu) : nothing}
				<div class="said" role="status" aria-live="polite" aria-atomic="true">
					${keyed(this.said.count, html`<span>${this.said.text}</span>`)}
				</div>
			</aside>
		`;
	}

	/** Where a menu fits, nearest to (x, y): kept inside the sidebar and above its bottom. */
	private menuPlace(menu: Menu): { left: number; top: number } {
		const height = menuHeight({ title: menu.title, items: menu.items }, null);
		return {
			left: Math.max(4, Math.min(menu.x, this.getBoundingClientRect().right - 204)),
			top: Math.max(4, Math.min(menu.y, window.innerHeight - 8 - height)),
		};
	}

	/** The open menu, drawn in place (the prototype). */
	private menuView(menu: Menu): TemplateResult {
		const at = this.menuPlace(menu);
		return html`<loka-menu
			class="menu"
			style="left: ${at.left}px; top: ${at.top}px"
			.menu=${{ title: menu.title, items: toEntries(menu.items) }}
			@loka-menu-pick=${(e: CustomEvent<number[]>) => this.menuPicked(e.detail)}
			@loka-menu-close=${() => this.menuClosed()}
		></loka-menu>`;
	}

	/**
	 * Downloads, in the bottom row beside the +, as Arc and Zen have it: a ring fills around it while files come in
	 * (it spins when a size isn't known), and a dot says a finished one hasn't been seen.
	 */
	private downloadsButton(): TemplateResult {
		const progress = overallProgress(this.downloads);
		const open = this.panel === "downloads";
		const status =
			progress === null
				? this.unseenDownload
					? "Downloads: a new file"
					: "Downloads"
				: Number.isNaN(progress)
					? "Downloads: downloading"
					: `Downloads: ${Math.round(progress * 100)}%`;
		return html`<button
			class="downloads ${open ? "on" : ""}"
			aria-label="Downloads"
			aria-expanded=${open}
			title=${status}
			@click=${(e: Event) => this.togglePanel(e, "downloads")}
		>
			<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v8M6.5 9.25 10 12.75l3.5-3.5M5.5 15.5h9" /></svg>
			${
				progress === null
					? nothing
					: html`<svg class="ring ${Number.isNaN(progress) ? "spin" : ""}" viewBox="0 0 28 28" aria-hidden="true">
							<circle cx="14" cy="14" r="12.5" pathLength="100" stroke-dasharray="${Number.isNaN(progress) ? 25 : Math.max(2, progress * 100)} 100" />
						</svg>`
			}
			${this.unseenDownload && progress === null ? html`<span class="dot" aria-hidden="true"></span>` : nothing}
		</button>`;
	}

	/**
	 * A finished download, shown once, quietly, above the bottom row; a click opens Downloads. It isn't a live region:
	 * the sidebar's one live region (say) has already said it.
	 */
	private toastView(): TemplateResult | typeof nothing {
		const done = this.toast;
		if (!done) return nothing;
		return html`<div class="toast">
			<button @click=${(e: Event) => this.togglePanel(e, "downloads")} title="Show in Downloads">
				<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 10.5 2.75 2.75L14.5 7.5" /></svg>
				<span class="toast-name">${done.name}</span>
				<span class="toast-done">Downloaded</span>
			</button>
		</div>`;
	}

	private panelButton(panel: Panel, label: string, icon: TemplateResult): TemplateResult {
		return html`<button
			class="tool ${this.panel === panel ? "on" : ""}"
			aria-label=${label}
			aria-expanded=${this.panel === panel}
			title=${label}
			@click=${(e: Event) => this.togglePanel(e, panel)}
		>
			${icon}
		</button>`;
	}

	private panelBody(panel: Panel): TemplateResult {
		if (panel === "downloads")
			return html`<loka-downloads .downloads=${this.downloads} .browser=${this.browser}></loka-downloads>`;
		if (panel === "archive")
			return html`<loka-archive-panel .state=${this.state} .apply=${this.apply}></loka-archive-panel>`;
		if (panel === "search")
			return html`<loka-sidebar-search .state=${this.state} .apply=${this.apply}></loka-sidebar-search>`;
		return html`<loka-extensions
			.extensions=${this.extensions}
			.browser=${this.browser}
			.pin=${this.pinExtension}
			.menu=${this.extensionMenu}
		></loka-extensions>`;
	}

	static override styles = [
		extensionIconStyles,
		css`
		:host {
			display: block;
			min-height: 0;
			font-size: 14px;
			--text: var(--loka-ink);
			--muted: var(--loka-ink-2);
			--accent: var(--loka-accent);
		}
		aside {
			position: relative;
			display: flex;
			flex-direction: column;
			height: 100%;
			box-sizing: border-box;
			padding: 6px 8px 8px 10px;
			gap: 8px;
			user-select: none;
		}
		button {
			font: inherit;
			color: inherit;
			background: none;
			border: 0;
			padding: 0;
			cursor: default;
		}
		svg {
			width: 18px;
			height: 18px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.5;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		svg .fill {
			fill: currentColor;
			fill-opacity: 0.35;
			stroke: none;
		}
		:focus-visible {
			outline: 2px solid var(--loka-accent);
			outline-offset: -2px;
			border-radius: 8px;
		}

		/* The top row is the window's title bar: menu and hide, the page's own buttons, then the window's. */
		.top {
			flex: none;
			display: flex;
			align-items: center;
			gap: 0;
			height: 36px;
			margin: 0 -4px 0 -6px;
			container-type: inline-size;
		}
		.nav {
			display: flex;
			margin-left: 6px;
		}
		.drag {
			flex: 1;
			align-self: stretch;
		}
		.traffic-lights {
			flex: none;
			width: 70px;
			align-self: stretch;
		}
		.icon {
			display: grid;
			place-items: center;
			flex: none;
			width: 32px;
			height: 32px;
			border-radius: 8px;
			color: var(--loka-ink-2);
		}
		.icon:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		.icon:active,
		.tool:active,
		.close:active,
		.sound:active,
		.clear:active {
			background: var(--loka-pressed);
		}
		.icon .dots {
			stroke-width: 2.4;
		}
		/* Small controls inside dense rows keep their size and take clicks a little past their edge: 32px targets. */
		.close,
		.sound,
		.clear {
			position: relative;
		}
		.close::after,
		.sound::after,
		.clear::after {
			content: "";
			position: absolute;
			inset: -2px;
		}
		.sounds-off {
			width: 28px;
			color: var(--loka-ink-3);
		}
		.sounds-off svg {
			width: 15px;
			height: 15px;
		}
		.caption svg {
			width: 16px;
			height: 16px;
			stroke-width: 1.3;
		}
		.close-window:hover {
			background: #c42b1c;
			color: #fff;
		}
		/* A narrow sidebar keeps the window's buttons and drops the page's least-used ones first. */
		@container (width < 286px) {
			.reload {
				display: none;
			}
		}
		@container (width < 254px) {
			.forward {
				display: none;
			}
		}

		/* The address field, with the pinned extensions and Extensions inside it on the right. */
		.url {
			position: relative;
			flex: none;
			display: flex;
			align-items: center;
			height: 40px;
			padding-right: 4px;
			border-radius: 12px;
			background: var(--loka-fill);
			box-shadow: inset 0 0 0 1px var(--loka-line);
			overflow: hidden;
		}
		.url:hover {
			background: var(--loka-fill-hover);
		}
		.url:has(.address:active) {
			background: var(--loka-pressed);
		}
		.address {
			flex: 1;
			min-width: 0;
			display: flex;
			align-items: center;
			gap: 8px;
			height: 100%;
			padding: 0 6px 0 12px;
			text-align: left;
			color: var(--loka-ink);
			font-size: 14px;
		}
		.address > svg {
			flex: none;
			width: 16px;
			height: 16px;
			color: var(--loka-ink-3);
		}
		.host {
			min-width: 0;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		.host.placeholder {
			color: var(--loka-ink-3);
		}
		/* Loading: a thin line in the space's color runs along the field's bottom edge. */
		.url.loading::after {
			content: "";
			position: absolute;
			left: 12px;
			right: 12px;
			bottom: 0;
			height: 2px;
			border-radius: 1px;
			background: linear-gradient(90deg, transparent, var(--loka-accent), transparent);
			opacity: 0.9;
		}
		.pill-tools {
			display: flex;
			align-items: center;
			flex: none;
			min-width: 0;
		}
		/* Pinned extensions that don't fit wrap onto a hidden second line, so a narrow sidebar hides whole buttons. */
		.pinned-ext {
			display: flex;
			flex-wrap: wrap;
			height: 32px;
			max-width: 96px;
			overflow: hidden;
		}
		.tool {
			position: relative;
			display: grid;
			place-items: center;
			flex: none;
			width: 32px;
			height: 32px;
			border-radius: 8px;
			color: var(--loka-ink-2);
		}
		.tool:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		.tool.on {
			background: var(--loka-selected);
			box-shadow: var(--loka-selected-edge);
			color: var(--loka-ink);
		}

		/* Always four columns, as Arc's Favorites: a tile is a quarter of the row however many there are, and a short
		   row sits at the left rather than stretching one tile across the sidebar. */
		.essentials {
			position: relative;
			flex: none;
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 8px;
		}
		.essential {
			display: grid;
			place-items: center;
			height: 56px;
			border-radius: 12px;
			background: var(--loka-fill);
			box-shadow: inset 0 0 0 1px var(--loka-line);
			position: relative;
		}
		.essential:hover {
			background: var(--loka-fill-hover);
		}
		.essential:active {
			background: var(--loka-pressed);
			scale: 0.97;
		}
		.essential.active {
			background: var(--loka-selected);
			box-shadow:
				inset 0 0 0 1.5px var(--loka-accent),
				var(--loka-selected-edge);
		}
		.essential.slot,
		.essential.ghost {
			background: color-mix(in srgb, var(--loka-accent) 7%, transparent);
			box-shadow: none;
			outline: 1.5px dashed color-mix(in srgb, var(--loka-accent) 55%, transparent);
			outline-offset: -1.5px;
		}
		/* No Essentials: no room taken (the sidebar's gap is given back). While a tab is dragged, the address field
		   fades out and three slots fade in over it, from its top to where the list starts: nothing in the list moves
		   and no row is covered. Dropping in one makes the first Essential; only then does the grid take room. */
		.essentials.empty {
			display: block;
			margin-bottom: -8px;
		}
		.tray {
			position: absolute;
			z-index: 5;
			left: 0;
			right: 0;
			bottom: 0;
			height: 48px;
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 8px;
		}
		.tray .essential.ghost {
			height: auto;
		}
		aside:has(> .essentials .tray) > .url {
			opacity: 0;
			pointer-events: none;
		}
		.essential.ghost {
			height: 56px;
		}
		.essential.ghost.drop-before,
		.essential.ghost.drop-after,
		.essential.slot.drop-before,
		.essential.slot.drop-after {
			background: color-mix(in srgb, var(--loka-accent) 20%, transparent);
			outline-style: solid;
			outline-color: var(--loka-accent);
		}
		.essential.ghost::before,
		.essential.slot::before {
			display: none;
		}
		.essential.drop-before::before,
		.essential.drop-after::before {
			content: "";
			position: absolute;
			top: 8px;
			bottom: 8px;
			width: 2px;
			border-radius: 1px;
			background: var(--loka-accent);
		}
		.essential.drop-before::before {
			left: -5px;
		}
		.essential.drop-after::before {
			right: -5px;
		}
		.essential.slot.drop-before,
		.essential.slot.drop-after {
			box-shadow: inset 0 0 0 1.5px var(--loka-accent);
		}
		.essential.leaving {
			position: absolute;
			z-index: 1;
			pointer-events: none;
		}

		/* The list fades at an edge only while there's more to scroll past it (a scroll-driven mask). */
		.scroll {
			position: relative;
			/* A sideways swipe drags the list with the fingers (--swipe, set while swiping). */
			translate: calc(var(--swipe, 0) * -0.5px) 0;
			opacity: calc(1 - var(--swipe-size, 0) / 180);
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			margin: 0 -4px;
			padding: 0 4px;
			/* No scrollbar: the top fade and the planet's fade say there's more, and wheel, trackpad and keys still
			   scroll it. The list runs down under the planet, with room to scroll its last row clear of it. */
			scrollbar-width: none;
			margin-bottom: -8px;
			padding-bottom: var(--bottom-room, 96px);
			--fade-top: 0px;
			mask-image: linear-gradient(to bottom, transparent, #000 var(--fade-top));
			animation: fade-top linear both;
			animation-timeline: scroll(self);
			animation-range: 0 24px;
		}
		@keyframes fade-top {
			from {
				--fade-top: 0px;
			}
			to {
				--fade-top: 24px;
			}
		}
		.row {
			position: relative;
			display: flex;
			align-items: center;
			gap: 12px;
			width: 100%;
			box-sizing: border-box;
			height: 40px;
			padding: 0 6px 0 calc(11px + var(--depth, 0) * 18px);
			/* Rows scrolled out of view skip style, layout and paint: a space with 150 tabs builds only what shows. */
			content-visibility: auto;
			contain-intrinsic-size: auto 40px;
			border-radius: 10px;
			color: var(--loka-ink);
		}
		.row:hover {
			background: var(--loka-hover);
		}
		/* Pressed: a step past hover, so a click is felt before the page answers. */
		.row:active {
			background: var(--loka-pressed);
		}
		.row.active:active {
			background: var(--loka-selected);
			filter: brightness(0.96);
		}
		.row.active {
			background: var(--loka-selected);
			box-shadow: var(--loka-selected-edge);
		}
		.row.dragging,
		.essential.dragging {
			opacity: 0.4;
		}
		/* A tab with no page in memory: its icon fades, so what's loaded stands out. Opening it loads it. */
		.row.unloaded .fav {
			opacity: 0.4;
			filter: saturate(0.35);
		}
		.row.unloaded .label {
			color: var(--loka-ink-2);
		}
		.essential.unloaded .fav {
			opacity: 0.45;
			filter: saturate(0.4);
		}
		/* The copy of a dragged row or tile that follows the pointer. */
		.drag-ghost {
			position: fixed;
			z-index: 30;
			left: 0;
			top: 0;
			margin: 0;
			pointer-events: none;
			background: var(--loka-selected);
			box-shadow:
				var(--loka-surface-edge),
				0 8px 24px rgb(0 0 0 / 0.25);
			opacity: 0.95;
			rotate: -1deg;
		}

		/* A row that just left the list, fading where it was. */
		.row.leaving {
			position: absolute;
			z-index: 1;
			pointer-events: none;
		}
		.row.drop-before::before,
		.row.drop-after::after {
			content: "";
			position: absolute;
			left: calc(11px + var(--depth, 0) * 18px);
			right: 6px;
			height: 2px;
			border-radius: 1px;
			background: var(--loka-accent);
		}
		/* Inside the row's edge: a row clips what it draws past it (content-visibility). */
		.row.drop-before::before {
			top: 0;
		}
		.row.drop-after::after {
			bottom: 0;
		}
		.row.drop-into {
			background: color-mix(in srgb, var(--loka-accent) 18%, transparent);
			box-shadow: inset 0 0 0 1.5px var(--loka-accent);
		}
		.label {
			flex: 1;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		.fav {
			position: relative;
			flex: none;
			display: grid;
			place-items: center;
			width: var(--size);
			height: var(--size);
			border-radius: 5px;
			background: var(--fav);
			color: #0b0c10;
			font-size: calc(var(--size) * 0.6);
			font-weight: 700;
		}
		/* Loading: the icon dims and a thin arc in the space's color turns around it. */
		.fav.loading > * {
			opacity: 0.55;
		}
		.fav.loading::after {
			content: "";
			position: absolute;
			inset: -3px;
			border-radius: 50%;
			border: 1.5px solid var(--loka-line);
			border-top-color: var(--loka-accent);
		}
		.sound {
			flex: none;
			display: grid;
			place-items: center;
			width: 28px;
			height: 28px;
			border-radius: 7px;
			color: var(--loka-accent-ink);
		}
		.sound.muted {
			color: var(--loka-ink-2);
		}
		.sound svg {
			width: 16px;
			height: 16px;
		}
		.sound:hover {
			background: var(--loka-hover);
		}
		.folder {
			color: var(--loka-ink);
		}
		/* No arrow: the icon itself is the open or closed state. */
		.folder-icon {
			flex: none;
			width: 22px;
			height: 22px;
			margin: 0 -2px 0 -2px;
			color: var(--loka-accent-ink);
			stroke-width: 1.15;
		}
		.folder-icon .body {
			fill: currentColor;
			fill-opacity: 0.24;
		}
		.folder-icon .lip {
			stroke-opacity: 0.55;
			stroke-width: 1.1;
		}
		.folder-icon .holds {
			fill: var(--loka-ink);
			stroke: var(--loka-fill-hover);
			stroke-width: 1.6;
		}
		.count {
			color: var(--loka-ink-3);
			font-size: 12px;
			font-variant-numeric: tabular-nums;
		}
		.rename {
			flex: 1;
			min-width: 0;
			font: inherit;
			color: var(--loka-ink);
			background: var(--loka-surface);
			border: 1px solid var(--loka-accent);
			border-radius: 6px;
			padding: 3px 6px;
			outline: none;
		}
		/* A row's own controls sit together at its right edge: the speaker while it plays, the x on hover. The x keeps
		   its place while hidden, so the speaker never moves when the pointer comes and goes. */
		.trail {
			flex: none;
			display: flex;
			align-items: center;
			gap: 4px;
			margin-right: -2px;
		}
		.trail:empty {
			display: none;
		}
		.close {
			flex: none;
			display: grid;
			place-items: center;
			width: 28px;
			height: 28px;
			border-radius: 7px;
			color: var(--loka-ink-2);
			opacity: 0;
		}
		.close svg {
			width: 16px;
			height: 16px;
		}
		.row:hover .close,
		.row.active .close,
		.close:focus-visible {
			opacity: 1;
		}
		.close:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		/* A speaker beside the x reads as one pair: each takes 22 px of the row, edge to edge, and their icons sit toward
		   each other, about 2.5 px apart. The x stays exactly where it is on a row without a speaker. Hover and press
		   light a pill around the icon, not the whole box; the icons don't take the pointer, so each box is its own. */
		.trail:has(.sound + .close) {
			gap: 0;
		}
		.sound:has(+ .close),
		.sound + .close {
			width: 22px;
		}
		.sound:has(+ .close),
		.sound:has(+ .close):hover,
		.sound:has(+ .close):active,
		.sound + .close,
		.sound + .close:hover,
		.sound + .close:active {
			background: none;
		}
		.sound:has(+ .close)::after,
		.sound + .close::after {
			inset: -2px 0;
		}
		.sound:has(+ .close) {
			justify-items: end;
		}
		.sound + .close {
			justify-items: start;
		}
		.sound:has(+ .close) svg {
			translate: 4px 0;
		}
		.sound:has(+ .close) svg,
		.sound + .close svg {
			position: relative;
			pointer-events: none;
		}
		.sound:has(+ .close)::before,
		.sound + .close::before {
			content: "";
			position: absolute;
			top: 4px;
			bottom: 4px;
			width: 20px;
			border-radius: 6px;
		}
		.sound:has(+ .close)::before {
			left: 8px;
		}
		.sound + .close::before {
			left: -2px;
		}
		.sound:has(+ .close):hover::before,
		.sound + .close:hover::before {
			background: var(--loka-hover);
		}
		.sound:has(+ .close):active::before,
		.sound + .close:active::before {
			background: var(--loka-pressed);
		}
		/* The gap above the divider: dropping a tab here or on the divider pins it, and the drop line says so. With
		   nothing pinned it takes no room; the divider is the target. Nothing grows when a drag starts, so the rows
		   don't jump from under the pointer. */
		.end-zone {
			height: 10px;
			position: relative;
		}
		.pinned:not(:has(.row)) .end-zone {
			height: 0;
		}
		.end-zone.drop-before::before,
		.end-zone.drop-after::before {
			content: "";
			position: absolute;
			left: 11px;
			right: 6px;
			bottom: 4px;
			height: 2px;
			border-radius: 1px;
			background: var(--loka-accent);
		}
		.divider {
			display: flex;
			align-items: center;
			gap: 8px;
			height: 32px;
			padding: 0 2px 0 8px;
		}
		.divider span {
			flex: 1;
			height: 1px;
			background: var(--loka-line);
		}
		.clear {
			display: flex;
			align-items: center;
			gap: 4px;
			height: 28px;
			color: var(--loka-ink-3);
			font-size: 13px;
			padding: 0 8px 0 6px;
			border-radius: 7px;
		}
		.clear svg {
			width: 14px;
			height: 14px;
		}
		.clear:hover {
			color: var(--loka-ink);
			background: var(--loka-hover);
		}
		.new-tab {
			color: var(--loka-ink-2);
			text-align: left;
		}
		.new-tab:hover {
			color: var(--loka-ink);
		}
		.plus {
			width: 18px;
			height: 18px;
			flex: none;
		}
		/* The media card and the planets sit over the bottom of the list, on the sky fading in behind them, so rows
		   slide under and dissolve into the planet. Only their own controls take the pointer; elsewhere clicks and
		   wheels reach the rows beneath. */
		.bottom {
			position: absolute;
			z-index: 2;
			left: 0;
			right: 0;
			bottom: 0;
			display: flex;
			flex-direction: column;
			gap: 8px;
			padding: 56px 8px 0 10px;
			pointer-events: none;
			background: linear-gradient(
				to bottom,
				transparent,
				color-mix(in srgb, var(--loka-sky-floor) 70%, transparent) 56px,
				var(--loka-sky-floor) 128px
			);
		}
		.media,
		.bottom .neighbour,
		.bottom .new {
			pointer-events: auto;
		}
		.media {
			flex: none;
			margin: 0 -2px -2px;
		}

		/* Spaces as a horizon: the current space is a planet rising at the bottom, its neighbours small in the sky
		   either side, low enough that switching sets them behind its edge. */
		.horizon {
			position: relative;
			flex: none;
			/* A low horizon: a thin cap of the planet with the name on it. Tall enough above the planet for a ring's arc
			   and its glow, which would otherwise be cut off flat at the top. */
			height: 86px;
			margin: -12px -8px 0 -10px;
			/* clip, not hidden: a hidden box can still be scrolled, and focusing the big planet button (after the space
			   editor closes) scrolled the planets up under the media card. */
			overflow: clip;
		}
		.world {
			position: absolute;
			z-index: 1;
			translate: calc(var(--swipe, 0) * -0.6px) 0;
			left: 50%;
			top: 36px;
			width: 360px;
			height: 360px;
			margin-left: -180px;
			border-radius: 50%;
		}
		.world svg,
		.neighbour svg {
			display: block;
			width: 100%;
			height: 100%;
			stroke: none;
		}
		/* The glow follows the planet's own edge (the body is 92% of the box), not the button's. */
		.world svg.planet {
			filter: drop-shadow(0 -3px 14px hsl(var(--hue) 85% 65% / 0.35));
		}
		/* Only the planet's round body takes clicks: its ring and glow reach over the neighbours, which sit behind it. */
		.world,
		.world svg {
			pointer-events: none;
		}
		.world .planet-h > span {
			pointer-events: auto;
		}
		.world:hover {
			filter: brightness(1.08);
		}
		/* Between the + and Downloads on the left and as far in on the right, so it stays centered, on one line, on
		   the planet's shaded cap: a longer name ends in "…" instead of running over the buttons onto the bright sky. */
		.world-name {
			position: absolute;
			z-index: 2;
			left: 72px;
			right: 72px;
			/* The letters at 55px; the padding keeps the shade's blur and the halo inside what's clipped, and the mask
			   fades a cut-off shade's ends instead of leaving them square. */
			top: 45px;
			padding: 10px 6px;
			overflow: hidden;
			mask-image: linear-gradient(90deg, transparent, #000 6px, #000 calc(100% - 6px), transparent);
			white-space: nowrap;
			text-overflow: ellipsis;
			text-align: center;
			font-size: 13px;
			font-weight: 650;
			color: #fff;
			text-shadow: var(--loka-label-shadow);
			pointer-events: none;
		}
		/* A soft shade on the planet under the name, so the white reads on every planet in every color (its lit cap is
		   too bright for white alone). Blurred, so it reads as shadow rather than a chip, and hardly taller than the
		   letters, so it stays on the planet rather than spilling over its edge onto the sky. It starts a pixel above
		   the line, so the blur's fading top edge clears the tall letters (a long name's k and d were at 3.9:1). */
		.world-name > span {
			position: relative;
			padding: 0 8px;
		}
		.world-name > span::before {
			content: "";
			position: absolute;
			inset: -1px 0 0;
			z-index: -1;
			border-radius: 999px;
			background: hsl(var(--hue) 55% 12% / 0.68);
			filter: blur(3px);
		}
		.neighbour {
			position: absolute;
			z-index: 0;
			top: 20px;
			width: 22px;
			height: 22px;
			border-radius: 50%;
		}
		/* The small planets take clicks a little past their edge. */
		.neighbour::after {
			content: "";
			position: absolute;
			inset: -6px;
			border-radius: 50%;
		}
		.neighbour.left {
			left: 22px;
		}
		.neighbour.right {
			right: 22px;
		}
		.neighbour:hover {
			filter: brightness(1.15);
		}
		.neighbour:active {
			filter: brightness(0.92);
		}
		/* While the orbit turns, its stand-ins take the place of the big planet and of the neighbour the old planet lands
		   in (animateHorizon). */
		.horizon.orbiting > .world,
		.horizon.orbiting > .neighbour.landing {
			visibility: hidden;
		}
		.orbit {
			position: absolute;
			inset: 0;
			z-index: 1;
			pointer-events: none;
		}
		.orbit .body {
			position: absolute;
			left: 50%;
			top: 36px;
			width: 360px;
			height: 360px;
			margin-left: -180px;
			will-change: transform, opacity;
		}
		.orbit .body > * {
			position: absolute !important;
			inset: 0;
		}
		.orbit .body svg.planet {
			filter: drop-shadow(0 -3px 14px hsl(var(--hue) 85% 65% / 0.35));
		}
		.orbit .ghost {
			position: absolute;
			top: 20px;
			width: 22px;
			height: 22px;
		}
		.orbit .ghost.left {
			left: 22px;
		}
		.orbit .ghost.right {
			right: 22px;
		}
		/* The +, at the bottom corner over the planet, makes a new tab, folder or space. */
		.new {
			position: absolute;
			z-index: 3;
			left: 12px;
			bottom: 6px;
			display: grid;
			place-items: center;
			width: 28px;
			height: 28px;
			border-radius: 8px;
			color: #fff;
			background: hsl(var(--hue) 40% 10% / 0.28);
			box-shadow: inset 0 0 0 1px hsl(0 0% 100% / 0.16);
			backdrop-filter: blur(6px);
		}
		.new:hover,
		.downloads:hover {
			background: hsl(var(--hue) 40% 10% / 0.42);
		}
		.new:active,
		.downloads:active {
			background: hsl(var(--hue) 40% 10% / 0.55);
		}
		/* Downloads, beside the +, in the same glass. */
		.downloads {
			position: absolute;
			z-index: 3;
			left: 46px;
			bottom: 6px;
			display: grid;
			place-items: center;
			width: 28px;
			height: 28px;
			border-radius: 8px;
			color: #fff;
			background: hsl(var(--hue) 40% 10% / 0.28);
			box-shadow: inset 0 0 0 1px hsl(0 0% 100% / 0.16);
			backdrop-filter: blur(6px);
			pointer-events: auto;
		}
		.downloads.on {
			background: hsl(var(--hue) 40% 10% / 0.55);
			box-shadow: inset 0 0 0 1px hsl(0 0% 100% / 0.32);
		}
		.downloads svg {
			width: 17px;
			height: 17px;
		}
		/* Progress: a ring around the button, filling as the files come in. */
		.downloads .ring {
			position: absolute;
			inset: 0;
			width: 28px;
			height: 28px;
			rotate: -90deg;
		}
		.ring circle {
			fill: none;
			stroke: hsl(var(--hue) 90% 78%);
			stroke-width: 1.75;
		}
		/* A finished download not seen yet. */
		.dot {
			position: absolute;
			top: -2px;
			right: -2px;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: hsl(var(--hue) 90% 72%);
			box-shadow: 0 0 0 2px hsl(var(--hue) 40% 12%);
		}
		/* The just-finished download, over the list's fading bottom for a moment. */
		.toast {
			position: absolute;
			z-index: 4;
			left: 10px;
			right: 8px;
			top: 8px;
			pointer-events: auto;
			border-radius: 12px;
			background: hsl(from var(--loka-surface) h s l / 0.96);
			box-shadow:
				inset 0 0 0 1px var(--glass-edge),
				var(--loka-surface-edge);
			backdrop-filter: blur(20px) saturate(1.4);
		}
		.toast button {
			display: flex;
			align-items: center;
			gap: 8px;
			width: 100%;
			height: 40px;
			padding: 0 12px 0 10px;
			border-radius: 12px;
			font-size: 13px;
			text-align: left;
		}
		.toast button:hover {
			background: var(--loka-hover);
		}
		.toast button:active {
			background: var(--loka-pressed);
		}
		.toast svg {
			flex: none;
			width: 18px;
			height: 18px;
			color: var(--loka-accent-ink);
		}
		.toast-name {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--loka-ink);
		}
		.toast-done {
			flex: none;
			color: var(--loka-ink-3);
			font-size: 12px;
		}
		@keyframes in-right {
			from {
				translate: 56px 0;
				opacity: 0;
			}
		}
		@keyframes in-left {
			from {
				translate: -56px 0;
				opacity: 0;
			}
		}
		/* A list kept built for a switch back: in the page, out of the layout, and neither drawn nor hit. Showing it
		   again only lays out and draws the rows on screen; nothing is built. */
		.scroll.kept:not(.leaving-list) {
			position: absolute;
			inset: 0;
			content-visibility: hidden;
			visibility: hidden;
			pointer-events: none;
		}
		/* The list being left, sliding out over where the new one comes in. */
		.scroll.leaving-list {
			position: absolute;
			box-sizing: border-box;
			z-index: 1;
			margin: 0;
			flex: none;
			pointer-events: none;
		}

		/* Panels and menus float over the list as frosted glass, opaque enough that rows behind never show through
		   their text: what passes under them is only a tint. */
		.panel {
			background: hsl(from var(--loka-surface) h s l / 0.96);
			box-shadow:
				inset 0 0 0 1px var(--glass-edge),
				var(--loka-surface-edge);
			backdrop-filter: blur(20px) saturate(1.4);
		}
		:host {
			--glass-edge: light-dark(hsl(var(--hue) 40% 20% / 0.1), hsl(0 0% 100% / 0.12));
		}
		/* Without blur, or for people who ask for less transparency: solid. */
		@supports not (backdrop-filter: blur(1px)) {
			.panel {
				background: hsl(from var(--loka-surface) h s l / 1);
			}
		}
		@media (prefers-reduced-transparency: reduce) {
			.panel {
				background: hsl(from var(--loka-surface) h s l / 1);
				backdrop-filter: none;
			}
		}
		.panel {
			position: absolute;
			z-index: 10;
			top: 92px;
			left: 6px;
			right: 6px;
			max-height: calc(100% - 240px);
			overflow-y: auto;
			overscroll-behavior: contain;
			padding: 8px 6px;
			border-radius: 14px;
			transform-origin: top right;
		}
		/* Downloads opens from the bottom row, so it rises from there. */
		.panel.rises {
			top: auto;
			bottom: 46px;
			max-height: calc(100% - 140px);
			transform-origin: bottom left;
		}
		/* The live region: read by screen readers, never drawn. */
		.said {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: -1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		/* A menu drawn in place (the prototype): <loka-menu> draws itself; this only places it. */
		loka-menu.menu {
			position: fixed;
			z-index: 10;
		}

		/* Unpinned, the browser floats the sidebar over the page: give it a finished edge of its own. */
		aside.floating {
			border-radius: 12px;
			box-shadow: inset 0 0 0 1px var(--loka-line);
		}

		/* Windows High Contrast (forced colors) drops every background tint and shadow, which is how the sidebar draws
		   its boxes and what's selected. Boxes get an edge instead, the tab on screen and what's switched on take
		   Highlight, and a drop shows in Highlight. Planets and favicons keep their own colors: they're pictures. */
		@media (forced-colors: active) {
			.fav,
			.world,
			.neighbour,
			.orbit,
			.address .planet {
				forced-color-adjust: none;
			}
			:focus-visible {
				outline: 2px solid CanvasText;
				outline-offset: -2px;
			}
			.url,
			.essential,
			.toast,
			.panel,
			.drag-ghost,
			aside.floating {
				outline: 1px solid CanvasText;
				outline-offset: -1px;
			}
			.new,
			.downloads {
				outline: 1px solid ButtonText;
				outline-offset: -1px;
				color: ButtonText;
				background: ButtonFace;
			}
			.row:hover,
			.essential:hover,
			.icon:hover,
			.tool:hover,
			.clear:hover,
			.close:hover,
			.sound:hover,
			.toast button:hover {
				outline: 1px solid Highlight;
				outline-offset: -1px;
			}
			/* Not adjusted, or the text would sit on its Canvas backplate inside the Highlight, Canvas on Canvas. */
			.row.active,
			.essential.active,
			.tool.on,
			.downloads.on {
				forced-color-adjust: none;
				background: Highlight;
				color: HighlightText;
				box-shadow: none;
			}
			.row.active .label,
			.row.active .close,
			.row.active .sound {
				color: HighlightText;
			}
			.essential.active {
				outline: 2px solid CanvasText;
				outline-offset: -2px;
			}
			.divider span {
				background: GrayText;
			}
			.essential.slot,
			.essential.ghost {
				outline: 1.5px dashed CanvasText;
				outline-offset: -1.5px;
			}
			.row.drop-before::before,
			.row.drop-after::after,
			.end-zone.drop-before::before,
			.end-zone.drop-after::before,
			.essential.drop-before::before,
			.essential.drop-after::before,
			.url.loading::after,
			.dot {
				background: Highlight;
			}
			.row.drop-into,
			.essential.slot.drop-before,
			.essential.slot.drop-after,
			.essential.ghost.drop-before,
			.essential.ghost.drop-after {
				outline: 2px solid Highlight;
				outline-offset: -2px;
			}
			.ring circle {
				stroke: Highlight;
			}
			.downloads.on .ring circle {
				stroke: HighlightText;
			}
			/* The list's bottom fades into the window, not the sky, which forced colors leave out (sky.ts). */
			.bottom {
				background: linear-gradient(to bottom, transparent, Canvas 56px);
			}
			/* The space's name on the planet: a plain label with an edge instead of the soft shade under white. */
			.world-name {
				color: CanvasText;
			}
			.world-name > span {
				background: Canvas;
				border-radius: 999px;
				outline: 1px solid CanvasText;
			}
			.world-name > span::before {
				display: none;
			}
		}
		/* More contrast asked for (not forced): the quiet texts and the hairlines step up. */
		@media (prefers-contrast: more) {
			.row.active,
			.essential.active,
			.tool.on {
				box-shadow: inset 0 0 0 1.5px var(--loka-ink);
			}
			.url,
			.essential {
				box-shadow: inset 0 0 0 1px var(--loka-ink-2);
			}
		}

		@media (prefers-reduced-motion: no-preference) {
			.row,
			.essential,
			.menu button {
				transition:
					background-color 120ms,
					scale 120ms;
			}
			.fav.loading::after {
				animation: spin 800ms linear infinite;
			}
			.ring.spin {
				animation: spin 1s linear infinite;
			}
			@keyframes spin {
				to {
					rotate: 1turn;
				}
			}
			.ring circle {
				transition: stroke-dasharray 450ms linear;
			}
			.url.loading::after {
				animation: shimmer 1.1s ease-in-out infinite;
			}
			@keyframes shimmer {
				from {
					transform: translateX(-60%);
				}
				to {
					transform: translateX(60%);
				}
			}
			/* The planet turns: its surface strip slides one body-width every four and a half minutes. */
			.world .turn {
				/* A pixel at a time, not every frame (see the sky's drift). */
				animation: turn 270s steps(330) infinite;
				animation-play-state: var(--loka-play, running);
			}
			@keyframes turn {
				to {
					transform: translateX(-50%);
				}
			}
			/* The slide joins the scroll fade rather than replacing it. */
			.scroll.from-right,
			.scroll.from-left {
				animation:
					fade-top linear both,
					in-right 300ms cubic-bezier(0.2, 0, 0, 1);
				animation-timeline: scroll(self), auto;
				animation-range:
					0 24px,
					normal;
			}
			.scroll.from-left {
				animation-name: fade-top, in-left;
			}
			/* Springs back when a swipe stops short; follows the fingers exactly while swiping. */
			aside:not(.swiping) .scroll,
			.world {
				transition:
					translate 220ms cubic-bezier(0.2, 0, 0, 1),
					opacity 220ms;
			}
			.neighbour {
				transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
			}
			/* The Essentials slots fade in over the address field as it fades out, and breathe gently. */
			.tray {
				transition: opacity 160ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
				}
			}
			.url {
				transition:
					background-color 120ms,
					scale 120ms,
					opacity 160ms cubic-bezier(0.2, 0, 0, 1);
			}
			.essential.ghost {
				animation: breathe-slot 1.6s ease-in-out infinite alternate;
			}
			.essential.ghost.drop-before,
			.essential.ghost.drop-after {
				animation: none;
			}
			@keyframes breathe-slot {
				to {
					outline-color: color-mix(in srgb, var(--loka-accent) 85%, transparent);
					background: color-mix(in srgb, var(--loka-accent) 12%, transparent);
				}
			}
			.neighbour:hover {
				transform: translateY(-3px);
			}
			/* Panels grow from the button that opened them; menus from where they were asked for. */
			.panel {
				transition:
					opacity 150ms cubic-bezier(0.2, 0, 0, 1),
					transform 200ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
					transform: translateY(-4px) scale(0.97);
				}
			}
			.panel.rises {
				@starting-style {
					opacity: 0;
					transform: translateY(6px) scale(0.97);
				}
			}
			.toast {
				transition:
					opacity 180ms cubic-bezier(0.2, 0, 0, 1),
					translate 220ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
					translate: 0 6px;
				}
			}
			.dot {
				transition: scale 200ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					scale: 0;
				}
			}
		}
		@media (prefers-reduced-motion: reduce) {
			.panel,
			.menu,
			.toast {
				transition: opacity 120ms ease-out;
				@starting-style {
					opacity: 0;
				}
			}
		}
	`,
	];
}

customElements.define("loka-sidebar", LokaSidebar);
