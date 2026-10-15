import { css, html, LitElement, nothing, svg, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { repeat } from "lit/directives/repeat.js";
import type { Browser, NativeDownload, NativeExtension } from "../../../../webui/src/bridge";
import type { Update } from "../../app/loka-app";
import { EASE_IN, EASE_OUT, leave, reducedMotion } from "../../app/theme";
import type { ActionId, CommandMode } from "../command-bar/command-bar.logic";
import { faviconBackground, faviconInner, hostOf, type LiveTabs } from "./favicon";
import "../archive/loka-archive-panel";
import { overallProgress } from "../downloads/downloads.logic";
import "../downloads/loka-downloads";
import { toolbarExtensions, withPinned } from "../extensions/extensions.logic";
import { extensionIcon, extensionIconStyles } from "../extensions/loka-extensions";
import "../media/loka-media-card";
import type { NowPlaying } from "../media/loka-media-card";
import "../search/loka-sidebar-search";
import { playCue } from "../sound/sound";
import type { Cue } from "../sound/sound.logic";
import { essentialsDropSlots, showEssentialsHint, showPinnedHint } from "./empty-states.logic";
import { planet } from "./planet";
import {
	activateTab,
	activeSpace,
	activeTab,
	type BrowserState,
	closeTab,
	createFolder,
	exportState,
	folderHolds,
	groupIntoFolder,
	importState,
	moveItem,
	type PinnedRow,
	type Place,
	pinnedRows,
	renameFolder,
	type Space,
	switchesForward,
	switchSpace,
	type TabId,
	toggleFolder,
	ungroupFolder,
} from "./sidebar.logic";

type DropMode = "before" | "after" | "into";
interface Drop {
	key: string;
	mode: DropMode;
	place: Place;
	/** Dropping into the middle of a tab row makes a folder of both tabs; this is that tab. */
	groupWith?: TabId;
}

export type Panel = "extensions" | "downloads" | "archive" | "search";
interface MenuItem {
	label: string;
	run: () => void;
}

const PANEL_NAMES: Record<Panel, string> = {
	extensions: "Extensions",
	downloads: "Downloads",
	archive: "Archived tabs",
	search: "Search the sidebar",
};

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
		swipe: { state: true },
		panel: { state: true },
		extensions: { state: true },
		downloads: { state: true },
		playing: { attribute: false },
		live: { attribute: false },
		browser: { attribute: false },
		pinned: { attribute: false },
		hintDismissed: { attribute: false },
		demo: { type: Boolean },
	};

	declare state: BrowserState;
	declare apply: Update;
	declare browser: Browser;
	dragId: string | null = null;
	drop: Drop | null = null;
	menu: { x: number; y: number; items: MenuItem[] } | null = null;
	renamingId: string | null = null;
	/** Sideways swipe distance so far, in wheel pixels (negative is towards the previous space). */
	swipe = 0;
	/** The popover open under the address field, if any. */
	panel: Panel | null = null;
	/** The installed extensions and the downloads, as the browser last said. Null until it has answered. */
	extensions: NativeExtension[] | null = null;
	downloads: NativeDownload[] | null = null;
	private stopWatching: (() => void)[] = [];
	playing: NowPlaying | null = null;
	/** What the browser says about each loaded tab: its page's icon, loading, playing sound. */
	live: LiveTabs = {};
	/** Pinned shows the sidebar always; unpinned, the browser slides it away until the mouse reaches the edge. */
	pinned = true;
	/** The prototype: shows "Reset demo data". The real browser leaves it out. */
	demo = true;
	/** The one-time Essentials hint was dismissed (a window pref the window saves). */
	hintDismissed = false;

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
			browser.onDownloadsChanged((list) => {
				this.downloads = list;
			}),
		];
		// The browser may not answer these yet (the message is new); the toolbar then just shows none.
		void browser.extensions().then((list) => {
			if (this.browser === browser) this.extensions = list;
		});
		void browser.downloads().then((list) => {
			if (this.browser === browser) this.downloads = list;
		});
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
		this.apply((s) => closeTab(s, tabId));
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
		window.removeEventListener("keydown", this.onEscape);
		for (const stop of this.stopWatching) stop();
		this.stopWatching = [];
		super.disconnectedCallback();
	}

	// ---- drag and drop -------------------------------------------------------

	private startDrag(e: DragEvent, id: string) {
		this.dragId = id;
		e.dataTransfer?.setData("text/plain", id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
	}

	private endDrag() {
		this.dragId = null;
		this.drop = null;
	}

	/**
	 * Works out where a drag over a row would land. `into` says what the middle of the row does: on a folder it puts
	 * the item inside; on a tab, when a tab is being dragged, it makes a new folder of the two.
	 */
	private over(
		e: DragEvent,
		key: string,
		place: (mode: DropMode) => Place | null,
		into: "folder" | "tab" | null = null,
		axis: "x" | "y" = "y",
	) {
		if (!this.dragId || this.dragId === key) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const ratio = axis === "y" ? (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width;
		let mode: DropMode = ratio < 0.5 ? "before" : "after";
		const grouping = into === "tab" && this.state.tabs[this.dragId] !== undefined && ratio > 0.3 && ratio < 0.7;
		if ((into === "folder" && ratio > 0.25 && ratio < 0.75) || grouping) mode = "into";
		const target = grouping ? place("before") : place(mode);
		if (!target) return;
		e.preventDefault();
		if (this.drop?.key !== key || this.drop.mode !== mode) {
			this.drop = { key, mode, place: target, groupWith: grouping ? key : undefined };
		}
	}

	private dropHere(e: DragEvent) {
		e.preventDefault();
		const id = this.dragId;
		const drop = this.drop;
		this.endDrag();
		if (!id || !drop) return;
		if (drop.groupWith) {
			const [next, folderId] = groupIntoFolder(this.state, drop.groupWith, id, "New folder");
			if (!folderId) return;
			playCue("into-folder");
			this.apply(() => next);
			this.renamingId = folderId;
			return;
		}
		// A move within the same list is silent; landing in a folder, or crossing between open and saved, is not.
		const wasOpen = this.state.spaces.some((s) => s.open.includes(id));
		const toOpen = drop.place.area === "open";
		if (drop.mode === "into") playCue("into-folder");
		else if (wasOpen && !toOpen) playCue("pin");
		else if (!wasOpen && toOpen) playCue("unpin");
		this.apply((s) => moveItem(s, id, drop.place));
	}

	private dropClass(key: string): string {
		if (this.drop?.key !== key) return "";
		return `drop-${this.drop.mode}`;
	}

	// ---- menus ---------------------------------------------------------------

	private openMenu(e: MouseEvent, items: MenuItem[]) {
		e.preventDefault();
		e.stopPropagation();
		this.menu = { x: e.clientX, y: e.clientY, items };
	}

	private closeMenu = () => {
		this.menu = null;
	};

	private tabMenu(tabId: TabId): MenuItem[] {
		const state = this.state;
		const space = activeSpace(state);
		const isEssential = state.essentials.includes(tabId);
		const isOpen = space.open.includes(tabId);
		const items: MenuItem[] = [];
		const move = (cue: Cue, place: Place) => () => {
			playCue(cue);
			this.apply((s) => moveItem(s, tabId, place));
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
		for (const other of state.spaces) {
			if (other.id === space.id) continue;
			items.push({
				label: `Move to ${other.name}`,
				run: () => this.apply((s) => moveItem(s, tabId, { area: "open", spaceId: other.id, index: 0 })),
			});
		}
		if (!isEssential) {
			items.push({
				label: "New folder with this tab",
				run: () => {
					const [made, folderId] = createFolder(this.state, space.id, null, "New folder");
					playCue("into-folder");
					this.apply(() => moveItem(made, tabId, { area: "pinned", spaceId: space.id, parentId: folderId, index: 0 }));
					this.renamingId = folderId;
				},
			});
		}
		items.push({ label: isOpen ? "Close tab" : "Unload tab", run: () => this.closeTabFor(tabId) });
		return items;
	}

	/** Right-click on empty sidebar space. Folders are made here, from a tab's menu, or by dropping a tab on a tab. */
	private emptyMenu(): MenuItem[] {
		return [
			{ label: "New folder", run: () => this.newFolder(null) },
			{ label: "New tab", run: () => this.command("new-tab") },
		];
	}

	/** The bottom row's +: what you'd make next. */
	private newMenu(e: MouseEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		this.menu = {
			x: r.left,
			y: r.top - 8 - 36 * 3,
			items: [
				{ label: "New tab", run: () => this.command("new-tab") },
				{ label: "New folder", run: () => this.newFolder(null) },
				{ label: "New space", run: () => this.action("new-space") },
			],
		};
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
			const rows = [...this.renderRoot.querySelectorAll<HTMLElement>('[role="treeitem"]')];
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
					const [next, id] = createFolder(this.state, spaceId, folderId, "New folder");
					this.apply(() => next);
					this.renamingId = id;
				},
			},
			{ label: "Ungroup (keep tabs)", run: () => this.apply((s) => ungroupFolder(s, folderId)) },
		];
	}

	private toggle(folderId: string, open: boolean) {
		playCue(open ? "folder-close" : "folder-open");
		this.apply((s) => toggleFolder(s, folderId));
	}

	private newFolder(parentId: string | null) {
		const [next, id] = createFolder(this.state, activeSpace(this.state).id, parentId, "New folder");
		this.apply(() => next);
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
	private neighbourAt(step: 1 | -1): Space | null {
		const spaces = this.state.spaces;
		if (spaces.length < 2) return null;
		// With two spaces both neighbours are the same one; show it once, on the right.
		if (spaces.length === 2 && step === -1) return null;
		const index = spaces.findIndex((s) => s.id === this.state.activeSpaceId);
		return spaces[(index + step + spaces.length) % spaces.length] ?? null;
	}

	private neighbour(target: Space | null, side: "left" | "right"): TemplateResult | typeof nothing {
		if (!target) return nothing;
		const number = this.state.spaces.indexOf(target) + 1;
		return html`<button
			class="neighbour ${side}"
			aria-label="${target.name} (Ctrl ${number})"
			title="${target.name}, Ctrl+${number}"
			@click=${() => this.switchTo(target.id)}
			@dragover=${(e: DragEvent) => {
				// Hovering a space while dragging switches to it, like Arc.
				if (!this.dragId) return;
				e.preventDefault();
				this.switchTo(target.id);
			}}
		>
			${planet(target.planet, target.hue, 30)}
		</button>`;
	}

	private switchTo(spaceId: string) {
		if (spaceId === this.state.activeSpaceId) return;
		playCue("space");
		this.apply((s) => switchSpace(s, spaceId));
	}

	private spacesMenu(): MenuItem[] {
		return [
			...this.state.spaces.map((s, i) => ({
				label: `${s.name}  (Ctrl+${i + 1})`,
				run: () => this.switchTo(s.id),
			})),
			{ label: "Edit this space", run: () => this.action("edit-space") },
			{ label: "New space", run: () => this.action("new-space") },
		];
	}

	private lastSwipe = 0;
	private settleTimer = 0;

	/**
	 * A sideways two-finger swipe anywhere on the sidebar drags the space's list with the fingers. Past the threshold
	 * it turns to the next or previous space; let go before that and it springs back.
	 */
	private onWheel = {
		passive: false,
		handleEvent: (e: WheelEvent) => {
			if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
			e.preventDefault();
			// One swipe sends dozens of wheel events; after a switch, ignore the rest of that gesture.
			if (e.timeStamp - this.lastSwipe < 450) return;
			const target = this.neighbourAt(this.swipe + e.deltaX > 0 ? 1 : -1) ?? this.neighbourAt(1);
			this.swipe = target ? Math.max(-90, Math.min(90, this.swipe + e.deltaX)) : 0;
			window.clearTimeout(this.settleTimer);
			if (Math.abs(this.swipe) >= 60 && target) {
				this.swipe = 0;
				this.lastSwipe = e.timeStamp;
				this.switchTo(target.id);
				return;
			}
			this.settleTimer = window.setTimeout(() => {
				this.swipe = 0;
			}, 140);
		},
	};

	/** Which way the list slides in after a switch: from the right when moving forward, as if turning a page. */
	private slideFrom: "left" | "right" | null = null;

	/** Where each row and Essential was before this update, to animate from. Null when nothing should move. */
	private rowsBefore: Map<string, Was> | null = null;
	/** The horizon's planets before a space switch, which set behind the new one. */
	private horizonBefore: { els: HTMLElement[]; forward: boolean } | null = null;

	protected override willUpdate(changed: Map<string, unknown>) {
		if (changed.has("browser") && this.browser) this.watchBrowser();
		const before = changed.get("state") as BrowserState | undefined;
		if (!before) return;
		if (before.activeSpaceId !== this.state.activeSpaceId) {
			const forward = switchesForward(this.state, before.activeSpaceId, this.state.activeSpaceId);
			this.slideFrom = forward ? "right" : "left";
			const horizon = this.renderRoot.querySelector(".horizon");
			this.horizonBefore = horizon
				? {
						els: [
							...horizon.querySelectorAll<HTMLElement>(":scope > .world, :scope > .world-name, :scope > .neighbour"),
						],
						forward,
					}
				: null;
			return;
		}
		// Same space, new state: the DOM still shows the old rows, so this is where they are now.
		this.rowsBefore = new Map(
			[...this.renderRoot.querySelectorAll<HTMLElement>(".scroll [data-key], .essentials [data-key]")].map((el) => [
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
		const scroll = this.renderRoot.querySelector<HTMLElement>(".scroll");
		const grid = this.renderRoot.querySelector<HTMLElement>(".essentials");
		if (!before || !scroll || !grid) return;
		const still = reducedMotion();
		const now = new Map(
			[...this.renderRoot.querySelectorAll<HTMLElement>(".scroll [data-key], .essentials [data-key]")].map((el) => [
				el.dataset.key ?? "",
				el,
			]),
		);
		for (const [key, el] of now) {
			for (const a of el.getAnimations()) if (a.id === "row") a.cancel();
			const was = before.get(key);
			const tile = el.classList.contains("essential");
			if (!was) {
				const from = still ? { opacity: 0 } : { opacity: 0, transform: tile ? "scale(0.85)" : "translateY(-6px)" };
				el.animate([from, { opacity: 1, transform: "none" }], { duration: 220, easing: EASE_OUT, id: "row" });
				continue;
			}
			if (still) continue;
			const rect = el.getBoundingClientRect();
			if (was.tile !== tile) {
				// Between a row and a tile: the icon travels, so the new shape grows from where the old one's icon was.
				const fromX = was.tile ? was.rect.left + was.rect.width / 2 : was.rect.left + 20;
				const fromY = was.rect.top + was.rect.height / 2;
				const dx = fromX - (tile ? rect.left + rect.width / 2 : rect.left + 20);
				const dy = fromY - (rect.top + rect.height / 2);
				el.animate(
					[
						{ transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.4 },
						{ transform: "none", opacity: 1 },
					],
					{ duration: 320, easing: EASE_OUT, id: "row" },
				);
				continue;
			}
			const dx = was.rect.left - rect.left;
			const dy = was.rect.top - rect.top;
			if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
				el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
					duration: 240,
					easing: EASE_OUT,
					id: "row",
				});
			}
		}
		for (const [key, { el, rect, tile }] of before) {
			if (now.has(key) || el.isConnected) continue;
			// Lit has let go of the old element; put it back where it was, on top, just long enough to fade.
			const home = tile ? grid : scroll;
			const box = home.getBoundingClientRect();
			el.classList.add("leaving");
			el.inert = true;
			el.setAttribute("aria-hidden", "true");
			el.removeAttribute("data-key");
			el.removeAttribute("role");
			Object.assign(el.style, {
				top: `${rect.top - box.top + (tile ? 0 : scroll.scrollTop)}px`,
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
	 * Switching spaces on the horizon: the old planet and its neighbours set, sinking and fading behind the
	 * horizon's edge, and the new ones rise into place: first the big planet, then its neighbours, so it reads like
	 * the sky turning. The old planets are the elements Lit just let go of, put back for their exit.
	 */
	private animateHorizon() {
		const before = this.horizonBefore;
		this.horizonBefore = null;
		const horizon = this.renderRoot.querySelector<HTMLElement>(".horizon");
		if (!before || !horizon) return;
		const still = reducedMotion();
		const side = before.forward ? 1 : -1;
		const sink = (el: HTMLElement, distance: number, drift: number, duration: number) => {
			// Gone as far as anyone using it can tell: it can't be clicked, focused or read out while it sets.
			el.classList.add("leaving");
			el.inert = true;
			el.setAttribute("aria-hidden", "true");
			horizon.prepend(el);
			const to = still ? { opacity: 0 } : { opacity: 0, transform: `translate(${drift}px, ${distance}px)` };
			void el
				.animate([{ opacity: 1, transform: "none" }, to], { duration, easing: EASE_IN, fill: "forwards" })
				.finished.then(() => el.remove());
		};
		const rise = (el: Element, distance: number, drift: number, duration: number, delay: number) => {
			const from = still ? { opacity: 0 } : { opacity: 0, transform: `translate(${drift}px, ${distance}px)` };
			el.animate([from, { opacity: 1, transform: "none" }], { duration, delay, easing: EASE_OUT, fill: "backwards" });
		};
		for (const el of before.els) {
			if (el.isConnected) continue;
			if (el.classList.contains("world")) sink(el, 70, -24 * side, 340);
			else if (el.classList.contains("world-name")) sink(el, 10, 0, 140);
			else sink(el, 46, 0, 260);
		}
		const world = horizon.querySelector(":scope > .world:not(.leaving)");
		if (world) rise(world, 70, 24 * side, 620, 60);
		const name = horizon.querySelector(":scope > .world-name:not(.leaving)");
		if (name) rise(name, 8, 0, 360, 240);
		for (const n of horizon.querySelectorAll(":scope > .neighbour:not(.leaving)")) rise(n, 46, 0, 520, 200);
	}

	private moreMenu(e: MouseEvent) {
		this.openMenu(e, [
			{ label: "New space", run: () => this.action("new-space") },
			{ label: "Search the sidebar", run: () => this.openPanel("search") },
			{ label: `Archived tabs (${this.state.archive.length})`, run: () => this.openPanel("archive") },
			{ label: "History", run: () => this.action("history") },
			{ label: "Settings", run: () => this.action("settings") },
			{ label: "Show the welcome tour", run: () => this.action("onboarding") },
			{ label: "Export spaces (JSON)", run: () => this.exportFile() },
			{ label: "Import spaces (JSON)", run: () => this.importFile() },
			...(this.demo
				? [
						{
							label: "Reset demo data",
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
			if (parsed) this.apply(() => parsed);
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

	private tabRow(
		tabId: TabId,
		depth: number,
		place: (mode: DropMode) => Place | null,
		closable: boolean,
	): TemplateResult {
		const tab = this.state.tabs[tabId];
		if (!tab) return html``;
		const active = activeSpace(this.state).activeTabId === tabId;
		return html`
			<div
				class="row ${active ? "active" : ""} ${this.dragId === tabId ? "dragging" : ""} ${this.dropClass(tabId)}"
				data-key=${tabId}
				style="--depth: ${depth}"
				role="treeitem"
				aria-level=${depth + 1}
				aria-selected=${active}
				tabindex="0"
				draggable="true"
				@dragstart=${(e: DragEvent) => this.startDrag(e, tabId)}
				@dragend=${() => this.endDrag()}
				@dragover=${(e: DragEvent) => this.over(e, tabId, place, "tab")}
				@drop=${(e: DragEvent) => this.dropHere(e)}
				@click=${() => this.apply((s) => activateTab(s, tabId))}
				@keydown=${(e: KeyboardEvent) => this.rowKey(e, () => this.apply((s) => activateTab(s, tabId)))}
				@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.tabMenu(tabId))}
			>
				${this.favicon(tabId, tab.url)}
				<span class="label">${tab.title}</span>
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
			</div>
		`;
	}

	private pinnedRow(row: PinnedRow, spaceId: string): TemplateResult {
		const { node, depth, parentId, index } = row;
		const sibling = (mode: DropMode): Place => ({
			area: "pinned",
			spaceId,
			parentId,
			index: mode === "before" ? index : index + 1,
		});
		if (node.kind === "tab") return this.tabRow(node.id, depth, sibling, false);

		const folderPlace = (mode: DropMode): Place => {
			// Dropping on the lower half of an open folder puts the item first inside it, which is where it shows.
			if (mode === "into") return { area: "pinned", spaceId, parentId: node.id, index: node.children.length };
			if (mode === "after" && node.open) return { area: "pinned", spaceId, parentId: node.id, index: 0 };
			return sibling(mode);
		};
		const renaming = this.renamingId === node.id;
		const activeId = activeSpace(this.state).activeTabId;
		const holdsActive = !node.open && activeId !== null && folderHolds(node, activeId);
		return html`
			<div
				class="row folder ${this.dragId === node.id ? "dragging" : ""} ${this.dropClass(node.id)}"
				data-key=${node.id}
				style="--depth: ${depth}"
				role="treeitem"
				aria-level=${depth + 1}
				aria-expanded=${node.open}
				tabindex="0"
				draggable=${renaming ? "false" : "true"}
				@dragstart=${(e: DragEvent) => this.startDrag(e, node.id)}
				@dragend=${() => this.endDrag()}
				@dragover=${(e: DragEvent) => this.over(e, node.id, folderPlace, "folder")}
				@drop=${(e: DragEvent) => this.dropHere(e)}
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
									if (this.renamingId === node.id && name) this.apply((s) => renameFolder(s, node.id, name));
									this.renamingId = null;
								}}
							/>`
						: html`<span class="label">${node.name}</span>`
				}
				<span class="count">${node.open ? "" : node.children.length}</span>
			</div>
		`;
	}

	protected override updated() {
		this.animateRows();
		this.animateHorizon();
		const input = this.renderRoot.querySelector<HTMLInputElement>("input.rename");
		if (input && document.activeElement !== this && this.shadowRoot?.activeElement !== input) {
			input.focus();
			input.select();
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
		return html`<div
			class="top"
			@mousedown=${(e: MouseEvent) => this.onTopPress(e)}
			@dblclick=${(e: MouseEvent) => !(e.target as HTMLElement).closest("button") && this.browser.windowAction("maximize")}
		>
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
			<span class="drag" aria-hidden="true"></span>
			<button class="icon caption" aria-label="Minimize" title="Minimize" @click=${() => this.browser.windowAction("minimize")}>
				<svg viewBox="0 0 20 20"><path d="M5 10h10" /></svg>
			</button>
			<button class="icon caption" aria-label="Maximize" title="Maximize" @click=${() => this.browser.windowAction("maximize")}>
				<svg viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1.5" /></svg>
			</button>
			<button class="icon caption close-window" aria-label="Close window" title="Close" @click=${() => this.browser.windowAction("close")}>
				<svg viewBox="0 0 20 20"><path d="m5.5 5.5 9 9m0-9-9 9" /></svg>
			</button>
		</div>`;
	}

	/** The address field: the page's site, opening the command bar on this tab; the pinned extensions sit inside it. */
	private addressField(): TemplateResult {
		const current = activeTab(this.state);
		const secure = current?.url.startsWith("https://");
		// Browser pages have no site name worth showing; their title says more.
		const own = current ? /^(chrome|loka|about):/.test(current.url) : false;
		const label = !current ? "" : own ? current.title : hostOf(current.url);
		const loading = current ? this.live[current.id]?.loading : false;
		const progress = overallProgress(this.downloads);
		return html`<div class="url ${loading ? "loading" : ""}">
			<button
				class="address"
				aria-label=${label ? `Address: ${label}` : "Search or enter address"}
				title="Change the address (Ctrl+L)"
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
						>
							${extensionIcon(x, 18)}
						</button>`,
					)}
				</span>
				${this.panelButton(
					"downloads",
					"Downloads",
					html`<svg viewBox="0 0 20 20"><path d="M10 3.5v9M6 8.75l4 4 4-4M4.5 16.5h11" /></svg>
						${
							progress === null
								? nothing
								: html`<svg class="ring ${Number.isNaN(progress) ? "spin" : ""}" viewBox="0 0 28 28" aria-hidden="true">
										<circle cx="14" cy="14" r="12" pathLength="100" stroke-dasharray="${Number.isNaN(progress) ? 25 : Math.max(2, progress * 100)} 100" />
									</svg>`
						}`,
				)}
				${this.panelButton(
					"extensions",
					"Extensions",
					html`<svg viewBox="0 0 20 20"><path d="M8 3.5h3.5v2.25a1.25 1.25 0 0 0 2.5 0V5.5h2.5v4h-.75a1.25 1.25 0 0 0 0 2.5h.75v4.5H12v-.75a1.25 1.25 0 0 0-2.5 0v.75H3.5V12h.75a1.25 1.25 0 0 0 0-2.5H3.5v-4H8z" /></svg>`,
				)}
			</span>
		</div>`;
	}

	override render() {
		const state = this.state;
		const space = activeSpace(state);
		const rows = pinnedRows(space.pinned);
		const count = state.essentials.length;
		const draggingTab = this.dragId !== null && state.tabs[this.dragId] !== undefined;
		const slots = essentialsDropSlots(count, draggingTab);
		// Essentials fill the row they're in, so one is one big tile; a drag adds the free cell to drop in.
		const columns = Math.min(4, Math.max(1, count + slots));
		const toEssentials = (): Place => ({ area: "essentials", index: Infinity });

		return html`
			<aside
				class=${this.pinned ? "" : "floating"}
				@click=${() => {
					this.closeMenu();
					void this.closePanel();
				}}
				@loka-close-panel=${() => void this.closePanel()}
				@wheel=${this.onWheel} @contextmenu=${(e: MouseEvent) => e.target === e.currentTarget && e.preventDefault()}>
				${this.topRow()}
				${this.addressField()}

				${
					count === 0
						? // None yet: no room taken. While a tab is dragged, a tray of slots eases open at the top.
							html`<div class="essentials empty" role="list" aria-label="Essentials">
								${
									slots
										? html`<div class="tray" aria-hidden="true">
												${Array.from(
													{ length: slots },
													(_, i) => html`<div
														class="essential ghost ${this.dropClass(`essentials-slot-${i}`)}"
														@dragover=${(e: DragEvent) => this.over(e, `essentials-slot-${i}`, toEssentials)}
														@drop=${(e: DragEvent) => this.dropHere(e)}
													></div>`,
												)}
												<p>Drop here to keep it in every space</p>
											</div>`
										: nothing
								}
							</div>`
						: html`<div class="essentials" role="list" aria-label="Essentials" style="--cols: ${columns}">
								${repeat(
									state.essentials,
									(id) => id,
									(id, index) => {
										const tab = state.tabs[id];
										if (!tab) return nothing;
										const active = space.activeTabId === id;
										return html`
											<button
												class="essential ${active ? "active" : ""} ${this.dragId === id ? "dragging" : ""} ${this.dropClass(id)}"
												data-key=${id}
												role="listitem"
												title=${tab.title}
												aria-label=${tab.title}
												draggable="true"
												@dragstart=${(e: DragEvent) => this.startDrag(e, id)}
												@dragend=${() => this.endDrag()}
												@dragover=${(e: DragEvent) =>
													this.over(
														e,
														id,
														(mode) => ({ area: "essentials", index: mode === "before" ? index : index + 1 }),
														null,
														"x",
													)}
												@drop=${(e: DragEvent) => this.dropHere(e)}
												@click=${() => this.apply((s) => activateTab(s, id))}
												@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.tabMenu(id))}
											>
												${this.favicon(id, tab.url, 24)}
											</button>
										`;
									},
								)}
								${
									// The drop slot sits in a free cell of the last row, never a new row: adding a row
									// when a drag starts would shift everything under the pointer.
									slots
										? html`<div
												class="essential slot ${this.dropClass("essentials-end")}"
												aria-hidden="true"
												@dragover=${(e: DragEvent) => this.over(e, "essentials-end", toEssentials)}
												@drop=${(e: DragEvent) => this.dropHere(e)}
											></div>`
										: nothing
								}
							</div>`
				}
				${
					showEssentialsHint(state, this.hintDismissed)
						? html`<div
								class="essentials-hint ${this.dropClass("essentials-hint")}"
								@dragover=${(e: DragEvent) => this.over(e, "essentials-hint", toEssentials)}
								@drop=${(e: DragEvent) => this.dropHere(e)}
							>
								<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1.6" /><rect x="11" y="3" width="6" height="6" rx="1.6" /><rect x="3" y="11" width="6" height="6" rx="1.6" /><rect x="11" y="11" width="6" height="6" rx="1.6" /></svg>
								<span>Drag a tab up here to keep it in every space</span>
								<button
									class="dismiss"
									aria-label="Dismiss the Essentials hint"
									title="Got it"
									@click=${(e: Event) => {
										e.stopPropagation();
										this.dispatchEvent(new CustomEvent("loka-dismiss-hint", { bubbles: true, composed: true }));
									}}
								>
									<svg viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
								</button>
							</div>`
						: nothing
				}

				${keyed(
					space.id,
					html`<div
				class="scroll ${this.slideFrom ? `from-${this.slideFrom}` : ""} ${this.swipe ? "swiping" : ""}"
				style="translate: ${-this.swipe * 0.5}px 0; opacity: ${1 - Math.abs(this.swipe) / 180}"
				@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.emptyMenu())}
			>
					<button
						class="space-label"
						title="${space.name}: switch or edit spaces"
						@click=${(e: MouseEvent) => this.openMenu(e, this.spacesMenu())}
					>
						${planet(space.planet, space.hue, 14)}<span>${space.name}</span>
					</button>
					<div class="pinned" role="tree" aria-label="Pinned in ${space.name}">
						${repeat(
							rows,
							(row) => row.node.id,
							(row) => this.pinnedRow(row, space.id),
						)}
						<div
							class="end-zone ${showPinnedHint(space) ? "hint" : ""} ${draggingTab ? "ready" : ""} ${this.dropClass("pinned-end")}"
							data-key="pinned-end"
							@dragover=${(e: DragEvent) =>
								this.over(e, "pinned-end", () => ({
									area: "pinned",
									spaceId: space.id,
									parentId: null,
									index: Infinity,
								}))}
							@drop=${(e: DragEvent) => this.dropHere(e)}
						>
							${
								showPinnedHint(space)
									? html`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11.8 3.2 16.8 8.2 13.6 9.4 10.6 12.4l-.6 3.6L4 10l3.6-.6 3-3z" /><path d="M6.8 13.2 3.5 16.5" /></svg>
											<span>Pin tabs to keep them in this space</span>`
									: nothing
							}
						</div>
					</div>

					<div class="divider" data-key="divider">
						<span></span>
						${
							space.open.length > 0
								? html`<button
										class="clear"
										title="Close every open tab in ${space.name}"
										@click=${() => {
											playCue("clear");
											this.apply((s) => space.open.reduce((acc, id) => closeTab(acc, id), s));
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
							@dragover=${(e: DragEvent) => this.over(e, "open-start", () => ({ area: "open", spaceId: space.id, index: 0 }))}
							@drop=${(e: DragEvent) => this.dropHere(e)}
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
								),
						)}
					</div>
				</div>`,
				)}

				${
					this.playing
						? html`<loka-media-card
								class="media"
								.playing=${this.playing}
								.live=${this.playing.tab ? this.live[this.playing.tab.id] : undefined}
							></loka-media-card>`
						: nothing
				}
				<nav class="horizon" aria-label="Spaces">
					${keyed(`left-${this.neighbourAt(-1)?.id}`, this.neighbour(this.neighbourAt(-1), "left"))}
					${keyed(
						space.id,
						html`<button
								class="world"
								style="translate: ${-this.swipe * 0.6}px 0"
								aria-label="Spaces: ${space.name}"
								title="All spaces"
								@click=${(e: MouseEvent) => this.openMenu(e, this.spacesMenu())}
							>
								${planet(space.planet, space.hue, 400, true)}
							</button>
							<span class="world-name" aria-hidden="true">${space.name}</span>`,
					)}
					${keyed(`right-${this.neighbourAt(1)?.id}`, this.neighbour(this.neighbourAt(1), "right"))}
					<button class="new" aria-label="New" title="New tab, folder or space" @click=${(e: MouseEvent) => this.newMenu(e)}>
						<svg viewBox="0 0 20 20"><path d="M10 4.5v11M4.5 10h11" /></svg>
					</button>
				</nav>

				${
					this.panel
						? html`<div
								class="panel"
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
				${
					this.menu
						? html`<div
								class="menu"
								role="menu"
								style="left: ${Math.max(4, Math.min(this.menu.x, this.getBoundingClientRect().right - 204))}px; top: ${Math.max(4, Math.min(this.menu.y, window.innerHeight - 8 - 36 * this.menu.items.length))}px"
								@keydown=${(e: KeyboardEvent) => e.key === "Escape" && this.closeMenu()}
							>
								${this.menu.items.map(
									(item) => html`<button
										role="menuitem"
										@click=${(e: Event) => {
											e.stopPropagation();
											this.closeMenu();
											item.run();
										}}
									>
										${item.label}
									</button>`,
								)}
							</div>`
						: nothing
				}
			</aside>
		`;
	}

	private panelButton(panel: Panel, label: string, icon: TemplateResult): TemplateResult {
		return html`<button
			class="tool ${this.panel === panel ? "on" : ""}"
			aria-label=${label}
			aria-expanded=${this.panel === panel}
			title=${label}
			@click=${(e: Event) => {
				e.stopPropagation();
				this.menu = null;
				if (this.panel === panel) void this.closePanel();
				else this.panel = panel;
			}}
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
		></loka-extensions>`;
	}

	static override styles = [
		extensionIconStyles,
		css`
		:host {
			display: block;
			min-height: 0;
			font-size: 15px;
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
		.icon:active {
			background: var(--loka-fill-hover);
		}
		.icon .dots {
			stroke-width: 2.4;
		}
		.caption {
			width: 30px;
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

		/* The address field, with the pinned extensions, Downloads and Extensions inside it on the right. */
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
			height: 30px;
			max-width: 96px;
			overflow: hidden;
		}
		.tool {
			position: relative;
			display: grid;
			place-items: center;
			flex: none;
			width: 30px;
			height: 30px;
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
		/* Download progress: a ring around the button, filling as the files come in. */
		.ring {
			position: absolute;
			inset: 1px;
			width: 28px;
			height: 28px;
			rotate: -90deg;
		}
		.ring circle {
			fill: none;
			stroke: var(--loka-accent);
			stroke-width: 2;
		}

		.essentials {
			position: relative;
			flex: none;
			display: grid;
			grid-template-columns: repeat(var(--cols, 4), 1fr);
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
		/* No Essentials: no room taken (the sidebar's gap is given back); the tray only exists while a tab is dragged. */
		.essentials.empty {
			display: block;
		}
		.essentials.empty:not(:has(.tray)) {
			margin-bottom: -8px;
		}
		.tray {
			box-sizing: border-box;
			overflow: hidden;
			interpolate-size: allow-keywords;
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 8px;
			padding: 6px;
			border-radius: 16px;
			background: var(--loka-surface);
			box-shadow: var(--loka-surface-edge);
		}
		.tray p {
			grid-column: 1 / -1;
			margin: 0 0 2px;
			text-align: center;
			font-size: 12px;
			color: var(--loka-ink-2);
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
		/* The one-time hint: a small row, not a box, with its own way out. */
		.essentials-hint {
			flex: none;
			display: flex;
			align-items: center;
			gap: 10px;
			min-height: 36px;
			padding: 0 4px 0 12px;
			margin-top: -2px;
			border-radius: 10px;
			color: var(--loka-ink-2);
			font-size: 13px;
		}
		.essentials-hint > svg {
			width: 16px;
			height: 16px;
			color: var(--loka-accent-ink);
		}
		.essentials-hint span {
			flex: 1;
			text-wrap: pretty;
		}
		.essentials-hint.drop-before,
		.essentials-hint.drop-after {
			background: color-mix(in srgb, var(--loka-accent) 16%, transparent);
			box-shadow: inset 0 0 0 1.5px var(--loka-accent);
		}
		.dismiss {
			display: grid;
			place-items: center;
			flex: none;
			width: 28px;
			height: 28px;
			border-radius: 7px;
			color: var(--loka-ink-3);
		}
		.dismiss svg {
			width: 14px;
			height: 14px;
		}
		.dismiss:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
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

		.scroll {
			position: relative;
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			margin: 0 -4px;
			padding: 0 4px;
			scrollbar-width: thin;
		}
		.space-label {
			display: flex;
			align-items: center;
			gap: 7px;
			height: 28px;
			padding: 0 8px;
			margin-bottom: 2px;
			border-radius: 7px;
			color: var(--loka-ink-3);
			font-size: 13px;
			font-weight: 550;
		}
		.space-label:hover {
			color: var(--loka-ink);
			background: var(--loka-hover);
		}
		.row {
			position: relative;
			display: flex;
			align-items: center;
			gap: 12px;
			width: 100%;
			box-sizing: border-box;
			height: 42px;
			padding: 0 6px 0 calc(11px + var(--depth, 0) * 18px);
			border-radius: 10px;
			color: var(--loka-ink);
		}
		.row:hover {
			background: var(--loka-hover);
		}
		.row.active {
			background: var(--loka-selected);
			box-shadow: var(--loka-selected-edge);
		}
		.row.dragging,
		.essential.dragging {
			opacity: 0.4;
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
		.row.drop-before::before {
			top: -1px;
		}
		.row.drop-after::after {
			bottom: -1px;
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
			width: 26px;
			height: 26px;
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
		.close {
			flex: none;
			display: grid;
			place-items: center;
			width: 28px;
			height: 28px;
			margin-right: -2px;
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
		.end-zone {
			height: 10px;
			position: relative;
		}
		/* Nothing pinned: one quiet row, which becomes the drop slot when a tab is dragged over it. */
		.end-zone.hint {
			display: flex;
			align-items: center;
			gap: 12px;
			height: 36px;
			padding: 0 11px;
			border-radius: 10px;
			color: var(--loka-ink-3);
			font-size: 13px;
		}
		.end-zone.hint svg {
			width: 16px;
			height: 16px;
			flex: none;
		}
		.end-zone.hint.ready {
			box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--loka-accent) 40%, transparent);
		}
		.end-zone.drop-before,
		.end-zone.drop-after {
			color: var(--loka-ink);
			background: color-mix(in srgb, var(--loka-accent) 16%, transparent);
			box-shadow: inset 0 0 0 1.5px var(--loka-accent);
			border-radius: 10px;
		}
		.divider {
			display: flex;
			align-items: center;
			gap: 8px;
			height: 30px;
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
			gap: 3px;
			height: 26px;
			color: var(--loka-ink-3);
			font-size: 13px;
			padding: 0 7px 0 5px;
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
		.media {
			flex: none;
			margin: 0 -2px -2px;
		}

		/* Spaces as a horizon: the current space is a planet rising at the bottom, its neighbours small in the sky
		   either side, low enough that switching sets them behind its edge. */
		.horizon {
			position: relative;
			flex: none;
			/* Tall enough above the planet for a ring's arc and its glow, which would otherwise be cut off flat. */
			height: 140px;
			margin: -24px -8px -8px -10px;
			overflow: hidden;
		}
		.world {
			position: absolute;
			z-index: 1;
			left: 50%;
			top: 56px;
			width: 400px;
			height: 400px;
			margin-left: -200px;
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
			filter: drop-shadow(0 -4px 22px hsl(var(--hue) 85% 65% / 0.35));
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
		.world-name {
			position: absolute;
			z-index: 2;
			left: 0;
			right: 0;
			top: 92px;
			text-align: center;
			font-size: 14px;
			font-weight: 650;
			color: #fff;
			text-shadow: var(--loka-label-shadow);
			pointer-events: none;
		}
		.neighbour {
			position: absolute;
			z-index: 0;
			top: 62px;
			width: 30px;
			height: 30px;
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
		.horizon .leaving {
			pointer-events: none;
		}
		/* The +, at the bottom corner over the planet, makes a new tab, folder or space. */
		.new {
			position: absolute;
			z-index: 3;
			left: 12px;
			bottom: 10px;
			display: grid;
			place-items: center;
			width: 32px;
			height: 32px;
			border-radius: 9px;
			color: #fff;
			background: hsl(var(--hue) 40% 10% / 0.28);
			box-shadow: inset 0 0 0 1px hsl(0 0% 100% / 0.16);
			backdrop-filter: blur(6px);
		}
		.new:hover {
			background: hsl(var(--hue) 40% 10% / 0.42);
		}
		@keyframes in-right {
			from {
				translate: 36px 0;
				opacity: 0;
			}
		}
		@keyframes in-left {
			from {
				translate: -36px 0;
				opacity: 0;
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
			padding: 8px 6px;
			border-radius: 14px;
			background: var(--loka-surface);
			box-shadow: var(--loka-surface-edge);
			transform-origin: top right;
		}
		.menu {
			position: fixed;
			z-index: 10;
			display: flex;
			flex-direction: column;
			width: 196px;
			padding: 4px;
			border-radius: 12px;
			background: var(--loka-surface);
			box-shadow: var(--loka-surface-edge);
			backdrop-filter: blur(12px);
			transform-origin: top left;
		}
		.menu button {
			text-align: left;
			height: 34px;
			padding: 0 10px;
			border-radius: 8px;
			font-size: 14px;
		}
		.menu button:hover,
		.menu button:focus-visible {
			background: var(--loka-hover);
			outline: none;
		}

		/* Unpinned, the browser floats the sidebar over the page: give it a finished edge of its own. */
		aside.floating {
			border-radius: 12px;
			box-shadow: inset 0 0 0 1px var(--loka-line);
		}

		@media (prefers-reduced-motion: no-preference) {
			.row,
			.essential {
				transition: background-color 120ms;
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
				animation: turn 270s linear infinite;
				animation-play-state: var(--loka-play, running);
			}
			@keyframes turn {
				to {
					transform: translateX(-50%);
				}
			}
			.scroll.from-right {
				animation: in-right 260ms cubic-bezier(0.2, 0, 0, 1);
			}
			.scroll.from-left {
				animation: in-left 260ms cubic-bezier(0.2, 0, 0, 1);
			}
			/* Springs back when a swipe stops short; follows the fingers exactly while swiping. */
			.scroll:not(.swiping),
			.world {
				transition:
					translate 220ms cubic-bezier(0.2, 0, 0, 1),
					opacity 220ms;
			}
			.neighbour {
				transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
			}
			/* The Essentials tray slides down from under the address field, and its slots breathe gently. */
			.tray {
				transition:
					opacity 160ms cubic-bezier(0.2, 0, 0, 1),
					height 200ms cubic-bezier(0.2, 0, 0, 1),
					padding 200ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
					height: 0;
					padding-block: 0;
				}
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
			.menu {
				transition:
					opacity 120ms cubic-bezier(0.2, 0, 0, 1),
					transform 160ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
					transform: scale(0.96);
				}
			}
		}
		@media (prefers-reduced-motion: reduce) {
			.panel,
			.menu {
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
