import { css, html, LitElement, nothing, svg, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { repeat } from "lit/directives/repeat.js";
import type { Update } from "../../app/loka-app";
import type { ActionId } from "../command-bar/command-bar.logic";
import { faviconBackground, faviconInner, hostOf, type LiveTabs } from "./favicon";
import "../archive/loka-archive-panel";
import "../downloads/loka-downloads";
import "../media/loka-media-card";
import type { Media } from "../media/loka-media-card";
import "../search/loka-sidebar-search";
import { playCue } from "../sound/sound";
import type { Cue } from "../sound/sound.logic";
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

export interface ExtensionInfo {
	id: string;
	name: string;
	letter: string;
	color: string;
	detail: string;
	/** The extension's own icon, when the browser can give it. */
	icon?: string;
}

/** Where the Extensions panel's list comes from, and what clicking a pinned icon does. */
export interface ExtensionSource {
	list(): Promise<ExtensionInfo[]>;
	/** Calls `changed` whenever extensions are installed, removed, turned on or off. Returns a stop function. */
	watch(changed: () => void): () => void;
	open(id: string): void;
	manage(): void;
}

let extensionSource: ExtensionSource | null = null;
const PINNED_KEY = "loka.pinnedExtensions";

/** The extension swaps in the browser's installed extensions; the prototype shows samples. */
export function setExtensionSource(source: ExtensionSource) {
	extensionSource = source;
}

/** Stand-ins for installed extensions. Helium ships uBlock Origin; the others show how a user's own would sit. */
const EXTENSIONS: ExtensionInfo[] = [
	{ id: "ublock", name: "uBlock Origin", letter: "u", color: "#c74b4b", detail: "12 blocked on this page" },
	{ id: "bitwarden", name: "Bitwarden", letter: "b", color: "#3f7fdd", detail: "Passwords" },
	{ id: "darkreader", name: "Dark Reader", letter: "d", color: "#4c4f5c", detail: "Off for this site" },
];

/** The Arc-style sidebar: URL pill, essentials, the space's pinned tree, open tabs and the space switcher. */
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
		pinnedExtensions: { state: true },
		extensions: { state: true },
		media: { attribute: false },
		live: { attribute: false },
		demo: { type: Boolean },
	};

	declare state: BrowserState;
	declare apply: Update;
	dragId: string | null = null;
	drop: Drop | null = null;
	menu: { x: number; y: number; items: MenuItem[] } | null = null;
	renamingId: string | null = null;
	/** Sideways swipe distance so far, in wheel pixels (negative is towards the previous space). */
	swipe = 0;
	/** The popover open under the toolbar, if any. */
	panel: Panel | null = null;
	pinnedExtensions = new Set<string>(JSON.parse(localStorage.getItem(PINNED_KEY) ?? '["ublock"]'));
	/** The prototype's samples; in the browser, the installed extensions once they've loaded. */
	extensions: ExtensionInfo[] = extensionSource ? [] : EXTENSIONS;
	private stopWatchingExtensions: (() => void) | null = null;
	declare media: Media | null;
	/** What the browser says about each loaded tab: its page's icon, loading, playing sound. */
	live: LiveTabs = {};
	/** The prototype: shows "Reset demo data". The real browser leaves it out. */
	demo = true;

	/** Opens a panel from outside (Ctrl+Shift+F, the command bar). */
	openPanel(panel: Panel) {
		this.menu = null;
		this.panel = panel;
		if (panel === "extensions") void this.loadExtensions();
	}

	private async loadExtensions() {
		if (!extensionSource) return;
		this.extensions = await extensionSource.list();
		// First run in the browser: pin uBlock Origin, which Helium ships, by its real ID.
		if (localStorage.getItem(PINNED_KEY) === null) {
			const ublock = this.extensions.find((x) => x.name.startsWith("uBlock Origin"));
			this.pinnedExtensions = new Set(ublock ? [ublock.id] : []);
			localStorage.setItem(PINNED_KEY, JSON.stringify([...this.pinnedExtensions]));
		}
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
		this.panel = null;
		this.menu = null;
	};

	override connectedCallback() {
		super.connectedCallback();
		window.addEventListener("keydown", this.onEscape);
		if (extensionSource) {
			void this.loadExtensions();
			this.stopWatchingExtensions = extensionSource.watch(() => void this.loadExtensions());
		}
	}

	override disconnectedCallback() {
		window.removeEventListener("keydown", this.onEscape);
		this.stopWatchingExtensions?.();
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
			{
				label: "New tab",
				run: () => this.dispatchEvent(new CustomEvent("loka-command", { bubbles: true, composed: true })),
			},
		];
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

	protected override willUpdate(changed: Map<string, unknown>) {
		const before = changed.get("state") as BrowserState | undefined;
		if (!before || before.activeSpaceId === this.state.activeSpaceId) return;
		const ids = this.state.spaces.map((s) => s.id);
		const from = ids.indexOf(before.activeSpaceId);
		const to = ids.indexOf(this.state.activeSpaceId);
		const forward = (to - from + ids.length) % ids.length <= ids.length / 2;
		this.slideFrom = forward ? "right" : "left";
	}

	private moreMenu(e: MouseEvent) {
		this.openMenu(e, [
			{ label: "New space", run: () => this.action("new-space") },
			{ label: "Search the sidebar", run: () => this.openPanel("search") },
			{ label: `Archived tabs (${this.state.archive.length})`, run: () => this.openPanel("archive") },
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
		const input = this.renderRoot.querySelector<HTMLInputElement>("input.rename");
		if (input && document.activeElement !== this && this.shadowRoot?.activeElement !== input) {
			input.focus();
			input.select();
		}
	}

	override render() {
		const state = this.state;
		const space = activeSpace(state);
		const current = activeTab(state);
		const rows = pinnedRows(space.pinned);

		return html`
			<aside
				@click=${() => {
					this.closeMenu();
					this.panel = null;
				}}
				@loka-close-panel=${() => {
					this.panel = null;
				}}
				@wheel=${this.onWheel} @contextmenu=${(e: MouseEvent) => e.target === e.currentTarget && e.preventDefault()}>
				<div class="toolbar">
					<button class="icon" aria-label="Back" @click=${() => this.nav("back")}><svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" /></svg></button>
					<button class="icon" aria-label="Forward" @click=${() => this.nav("forward")}><svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" /></svg></button>
					<button class="icon" aria-label="Reload" @click=${() => this.nav("reload")}><svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5" /></svg></button>
					<span class="push"></span>
					${this.extensions
						.filter((x) => this.pinnedExtensions.has(x.id))
						.map(
							(x) => html`<button
							class="icon ext"
							aria-label=${x.name}
							title="${x.name}: ${x.detail}"
							@click=${() => extensionSource?.open(x.id)}
						>
							${this.extensionTile(x, false)}
						</button>`,
						)}
					${this.panelButton(
						"downloads",
						"Downloads",
						html`<svg viewBox="0 0 16 16"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>`,
					)}
					${this.panelButton(
						"extensions",
						"Extensions",
						html`<svg viewBox="0 0 16 16"><path d="M6.5 2.5h3v2a1 1 0 0 0 2 0v-.5h2v3.5h-.5a1 1 0 0 0 0 2h.5v4h-4v-.5a1 1 0 0 0-2 0v.5h-5v-4h.5a1 1 0 0 0 0-2h-.5v-3.5h4z" /></svg>`,
					)}
					<button class="icon" aria-label="More" @click=${(e: MouseEvent) => this.moreMenu(e)}>
						<svg viewBox="0 0 16 16"><path d="M4 8h.01M8 8h.01M12 8h.01" /></svg>
					</button>
				</div>
				<button
					class="url"
					@click=${() => this.dispatchEvent(new CustomEvent("loka-command", { bubbles: true, composed: true }))}
				>
					${
						!current
							? "Search or enter address"
							: // Browser and extension pages have no site name worth showing; their title says more.
								/^(chrome|chrome-extension):/.test(current.url)
								? current.title
								: hostOf(current.url)
					}
					<kbd>Ctrl K</kbd>
				</button>

				<div class="essentials" role="list" aria-label="Essentials">
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
									${this.favicon(id, tab.url, 22)}
								</button>
							`;
						},
					)}
					${
						// The drop slot sits in a free cell of the last row, never a new row: adding a row
						// when a drag starts would shift everything under the pointer.
						state.essentials.length % 4 !== 0 || state.essentials.length === 0
							? html`<div
									class="essential slot ${this.dragId ? "visible" : ""} ${state.essentials.length === 0 ? "wide" : ""} ${this.dropClass("essentials-end")}"
									aria-hidden="true"
									@dragover=${(e: DragEvent) => this.over(e, "essentials-end", () => ({ area: "essentials", index: Infinity }))}
									@drop=${(e: DragEvent) => this.dropHere(e)}
								>
									${state.essentials.length === 0 ? "Drag tabs here for Essentials" : nothing}
								</div>`
							: nothing
					}
				</div>

				${keyed(
					space.id,
					html`<div
				class="scroll ${this.slideFrom ? `from-${this.slideFrom}` : ""} ${this.swipe ? "swiping" : ""}"
				style="translate: ${-this.swipe * 0.5}px 0; opacity: ${1 - Math.abs(this.swipe) / 180}"
				@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.emptyMenu())}
			>
					<div class="pinned" role="tree" aria-label="Pinned in ${space.name}">
						${repeat(
							rows,
							(row) => row.node.id,
							(row) => this.pinnedRow(row, space.id),
						)}
						<div
							class="end-zone ${rows.length === 0 ? "empty" : ""} ${this.dropClass("pinned-end")}"
							@dragover=${(e: DragEvent) =>
								this.over(e, "pinned-end", () => ({
									area: "pinned",
									spaceId: space.id,
									parentId: null,
									index: Infinity,
								}))}
							@drop=${(e: DragEvent) => this.dropHere(e)}
						>
							${rows.length === 0 ? "Drag tabs here to pin them" : nothing}
						</div>
					</div>

					<div class="divider">
						<span></span>
						${
							space.open.length > 0
								? html`<button
										class="clear"
										@click=${() => {
											playCue("clear");
											this.apply((s) => space.open.reduce((acc, id) => closeTab(acc, id), s));
										}}
									>
										Clear
									</button>`
								: nothing
						}
					</div>

					<div class="open" role="tree" aria-label="Open tabs in ${space.name}">
						<button
							class="row new-tab ${this.dropClass("open-start")}"
							@click=${() => this.dispatchEvent(new CustomEvent("loka-command", { bubbles: true, composed: true }))}
							@dragover=${(e: DragEvent) => this.over(e, "open-start", () => ({ area: "open", spaceId: space.id, index: 0 }))}
							@drop=${(e: DragEvent) => this.dropHere(e)}
						>
							<span class="plus">+</span><span class="label">New tab</span>
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
					this.media && this.media.tabId !== space.activeTabId && state.tabs[this.media.tabId]
						? html`<loka-media-card class="media" .media=${this.media} .state=${state} .live=${this.live[this.media.tabId]}></loka-media-card>`
						: nothing
				}
				<nav class="horizon" aria-label="Spaces">
					${this.neighbour(this.neighbourAt(-1), "left")}
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
					${this.neighbour(this.neighbourAt(1), "right")}
				</nav>

				${
					this.panel
						? html`<div
								class="panel"
								role="dialog"
								aria-label=${PANEL_NAMES[this.panel]}
								@click=${(e: Event) => e.stopPropagation()}
								@keydown=${(e: KeyboardEvent) => {
									if (e.key === "Escape") this.panel = null;
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
								style="left: ${Math.min(this.menu.x, this.getBoundingClientRect().right - 196)}px; top: ${Math.min(this.menu.y, window.innerHeight - 40 * this.menu.items.length)}px"
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
			class="icon ${this.panel === panel ? "on" : ""}"
			aria-label=${label}
			aria-expanded=${this.panel === panel}
			title=${label}
			@click=${(e: Event) => {
				e.stopPropagation();
				this.menu = null;
				this.panel = this.panel === panel ? null : panel;
			}}
		>
			${icon}
		</button>`;
	}

	private panelBody(panel: Panel): TemplateResult {
		if (panel === "downloads") return html`<loka-downloads></loka-downloads>`;
		if (panel === "archive")
			return html`<loka-archive-panel .state=${this.state} .apply=${this.apply}></loka-archive-panel>`;
		if (panel === "search")
			return html`<loka-sidebar-search .state=${this.state} .apply=${this.apply}></loka-sidebar-search>`;
		return html`<p class="ext-head">Extensions</p>
								${this.extensions.map(
									(x) => html`<div class="ext-row">
										${this.extensionTile(x, true)}
										<span class="ext-name">${x.name}<small>${x.detail}</small></span>
										<button
											class="icon pin ${this.pinnedExtensions.has(x.id) ? "on" : ""}"
											aria-label="${this.pinnedExtensions.has(x.id) ? "Unpin" : "Pin"} ${x.name}"
											aria-pressed=${this.pinnedExtensions.has(x.id)}
											@click=${() => {
												const next = new Set(this.pinnedExtensions);
												if (!next.delete(x.id)) next.add(x.id);
												this.pinnedExtensions = next;
												localStorage.setItem(PINNED_KEY, JSON.stringify([...next]));
											}}
										>
											<svg viewBox="0 0 16 16"><path d="M9.5 2.5 13.5 6.5 11 7.5 8.5 10l-.5 3L3 8l3-.5L8.5 5z" /><path d="M5.5 10.5 2.5 13.5" /></svg>
										</button>
									</div>`,
								)}
								<button class="ext-more" @click=${() => extensionSource?.manage()}>Manage extensions</button>`;
	}

	private extensionTile(x: ExtensionInfo, big: boolean): TemplateResult {
		return x.icon
			? html`<img class="ext-tile ${big ? "big" : ""}" src=${x.icon} alt="" aria-hidden="true" />`
			: html`<span class="ext-tile ${big ? "big" : ""}" style="--x: ${x.color}" aria-hidden="true">${x.letter}</span>`;
	}

	static override styles = css`
		:host {
			display: block;
			min-height: 0;
			font-size: 14px;
			--text: #ececf1;
			--muted: #a7a8b4;
			--row-hover: hsl(var(--hue) 30% 80% / 0.08);
			--row-active: hsl(var(--hue) 40% 85% / 0.16);
			--accent: hsl(var(--hue) 85% 72%);
		}
		aside {
			position: relative;
			display: flex;
			flex-direction: column;
			height: 100%;
			box-sizing: border-box;
			padding: 10px 10px 8px 12px;
			gap: 10px;
			user-select: none;
		}
		button {
			font: inherit;
			color: inherit;
			background: none;
			border: 0;
			cursor: default;
		}
		svg {
			width: 16px;
			height: 16px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.5;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: -2px;
			border-radius: 8px;
		}
		.toolbar {
			display: flex;
			gap: 2px;
			color: var(--muted);
		}
		.icon {
			display: grid;
			place-items: center;
			width: 28px;
			height: 28px;
			border-radius: 7px;
			color: var(--muted);
		}
		.icon:hover {
			background: var(--row-hover);
			color: var(--text);
		}
		.push {
			margin-left: auto;
		}
		.icon.on {
			background: var(--row-active);
			color: var(--text);
		}
		.media {
			flex: none;
			margin: 0 -2px -4px;
		}
		.ext-tile {
			display: grid;
			place-items: center;
			width: 16px;
			height: 16px;
			border-radius: 4px;
			background: var(--x);
			color: #fff;
			font-size: 11px;
			font-weight: 700;
		}
		.ext-tile.big {
			width: 26px;
			height: 26px;
			border-radius: 7px;
			font-size: 14px;
		}
		.panel {
			position: absolute;
			z-index: 10;
			top: 44px;
			left: 6px;
			right: 6px;
			max-height: calc(100% - 210px);
			overflow-y: auto;
			padding: 8px;
			border-radius: 12px;
			background: hsl(var(--hue) 22% 13% / 0.97);
			box-shadow:
				0 0 0 1px hsl(var(--hue) 30% 85% / 0.12),
				0 16px 40px #0009;
		}
		.ext-head {
			margin: 4px 8px 8px;
			font-weight: 600;
			color: var(--text);
		}
		.ext-row {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 6px 8px;
			border-radius: 8px;
		}
		.ext-row:hover {
			background: var(--row-hover);
		}
		.ext-name {
			flex: 1;
			display: grid;
			color: var(--text);
		}
		.ext-name small {
			color: var(--muted);
			font-size: 12px;
		}
		.pin.on {
			color: var(--accent);
		}
		.pin.on svg {
			fill: currentColor;
			fill-opacity: 0.3;
		}
		.ext-more {
			width: 100%;
			margin-top: 6px;
			padding: 8px;
			border-radius: 8px;
			color: var(--muted);
			text-align: left;
		}
		.ext-more:hover {
			background: var(--row-hover);
			color: var(--text);
		}
		.url {
			display: flex;
			align-items: center;
			justify-content: space-between;
			height: 34px;
			padding: 0 10px;
			border-radius: 10px;
			background: hsl(var(--hue) 30% 85% / 0.08);
			color: var(--text);
			text-align: left;
		}
		.url:hover {
			background: hsl(var(--hue) 30% 85% / 0.12);
		}
		kbd {
			font: 11px system-ui;
			color: var(--muted);
		}
		.essentials {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 6px;
		}
		.essential {
			display: grid;
			place-items: center;
			height: 50px;
			border-radius: 10px;
			background: hsl(var(--hue) 30% 85% / 0.07);
			position: relative;
		}
		.essential:hover {
			background: hsl(var(--hue) 30% 85% / 0.12);
		}
		.essential.active {
			background: var(--row-active);
			box-shadow: inset 0 0 0 1px hsl(var(--hue) 70% 80% / 0.35);
		}
		.essential.slot {
			background: none;
			color: var(--muted);
		}
		.essential.slot.visible,
		.essential.slot.wide {
			box-shadow: inset 0 0 0 1px hsl(var(--hue) 30% 85% / 0.12);
		}
		.essential.slot.wide {
			grid-column: 1 / -1;
		}
		.essential.drop-before::before,
		.essential.drop-after::before {
			content: "";
			position: absolute;
			top: 6px;
			bottom: 6px;
			width: 2px;
			border-radius: 1px;
			background: var(--accent);
		}
		.essential.drop-before::before {
			left: -4px;
		}
		.essential.drop-after::before {
			right: -4px;
		}
		.essential.slot.drop-before,
		.essential.slot.drop-after {
			box-shadow: inset 0 0 0 1.5px var(--accent);
		}
		.scroll {
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			margin: 0 -4px;
			padding: 0 4px;
			scrollbar-width: thin;
		}
		.row {
			position: relative;
			display: flex;
			align-items: center;
			gap: 10px;
			width: 100%;
			box-sizing: border-box;
			height: 36px;
			padding: 0 6px 0 calc(9px + var(--depth, 0) * 18px);
			border-radius: 8px;
			color: var(--text);
		}
		.row:hover {
			background: var(--row-hover);
		}
		.row.active {
			background: var(--row-active);
		}
		.row.dragging,
		.essential.dragging {
			opacity: 0.4;
		}
		.row.drop-before::before,
		.row.drop-after::after {
			content: "";
			position: absolute;
			left: calc(9px + var(--depth, 0) * 18px);
			right: 6px;
			height: 2px;
			border-radius: 1px;
			background: var(--accent);
		}
		.row.drop-before::before {
			top: -1px;
		}
		.row.drop-after::after {
			bottom: -1px;
		}
		.row.drop-into {
			background: hsl(var(--hue) 80% 70% / 0.18);
			box-shadow: inset 0 0 0 1.5px var(--accent);
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
			border: 1.5px solid hsl(var(--hue) 30% 85% / 0.12);
			border-top-color: var(--accent);
		}
		.sound {
			flex: none;
			display: grid;
			place-items: center;
			width: 22px;
			height: 22px;
			padding: 0;
			border-radius: 6px;
			color: var(--accent);
		}
		.sound.muted {
			color: var(--muted);
		}
		.sound svg {
			width: 14px;
			height: 14px;
		}
		.sound:hover {
			background: var(--row-hover);
		}
		.folder {
			color: var(--text);
		}
		/* No arrow: the icon itself is the open or closed state. */
		.folder-icon {
			flex: none;
			width: 21px;
			height: 21px;
			margin: 0 -1px 0 -2px;
			color: var(--accent);
			stroke-width: 1.2;
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
			fill: #fff;
			stroke: hsl(var(--hue) 40% 8%);
			stroke-width: 1.6;
		}
		.count {
			color: var(--muted);
			font-size: 11px;
			font-variant-numeric: tabular-nums;
		}
		.rename {
			flex: 1;
			min-width: 0;
			font: inherit;
			color: var(--text);
			background: hsl(var(--hue) 30% 10%);
			border: 1px solid var(--accent);
			border-radius: 5px;
			padding: 2px 4px;
			outline: none;
		}
		.close {
			flex: none;
			display: grid;
			place-items: center;
			width: 22px;
			height: 22px;
			margin-right: -2px;
			padding: 0;
			border-radius: 6px;
			color: var(--muted);
			opacity: 0;
		}
		.close svg {
			width: 14px;
			height: 14px;
		}
		.row:hover .close,
		.row.active .close,
		.close:focus-visible {
			opacity: 1;
		}
		.close:hover {
			background: var(--row-hover);
			color: var(--text);
		}
		.end-zone {
			height: 10px;
			position: relative;
		}
		.end-zone.empty {
			display: grid;
			place-items: center;
			height: 44px;
			margin: 2px 0;
			border-radius: 8px;
			color: var(--muted);
			box-shadow: inset 0 0 0 1px hsl(var(--hue) 30% 85% / 0.1);
		}
		.end-zone.drop-before,
		.end-zone.drop-after {
			box-shadow: inset 0 0 0 1.5px var(--accent);
			border-radius: 8px;
		}
		.divider {
			display: flex;
			align-items: center;
			gap: 8px;
			height: 24px;
			padding: 0 6px;
		}
		.divider span {
			flex: 1;
			height: 1px;
			background: hsl(var(--hue) 30% 85% / 0.12);
		}
		.clear {
			color: var(--muted);
			font-size: 12px;
			padding: 2px 6px;
			border-radius: 6px;
		}
		.clear:hover {
			color: var(--text);
			background: var(--row-hover);
		}
		.new-tab {
			color: var(--muted);
			text-align: left;
		}
		.new-tab:hover {
			color: var(--text);
		}
		.plus {
			display: grid;
			place-items: center;
			width: 16px;
			font-size: 16px;
		}
		/* Spaces as a horizon: the current space is a planet rising at the bottom, its neighbours sit either side. */
		.horizon {
			position: relative;
			flex: none;
			/* Tall enough above the planet for a ring's arc and its glow, which would otherwise be cut off flat. */
			height: 140px;
			margin: -24px -10px -8px -12px;
			overflow: hidden;
		}
		.world {
			position: absolute;
			left: 50%;
			top: 56px;
			width: 400px;
			height: 400px;
			margin-left: -200px;
			padding: 0;
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
		.world svg {
			filter: drop-shadow(0 -4px 22px hsl(var(--hue) 85% 65% / 0.35));
		}
		.world:hover {
			filter: brightness(1.08);
		}
		.world-name {
			position: absolute;
			left: 0;
			right: 0;
			top: 90px;
			text-align: center;
			font-size: 14px;
			font-weight: 650;
			color: #fff;
			text-shadow:
				0 1px 3px #000a,
				0 0 10px #0006;
			pointer-events: none;
		}
		.neighbour {
			position: absolute;
			/* Above the big planet, so a ring arcing behind it passes behind these too. */
			z-index: 1;
			top: 44px;
			width: 30px;
			height: 30px;
			padding: 0;
			border-radius: 50%;
		}
		.neighbour.left {
			left: 24px;
		}
		.neighbour.right {
			right: 24px;
		}
		.neighbour:hover {
			filter: brightness(1.15);
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
		.menu {
			position: fixed;
			z-index: 10;
			display: flex;
			flex-direction: column;
			width: 188px;
			padding: 4px;
			border-radius: 10px;
			background: hsl(var(--hue) 22% 13% / 0.96);
			box-shadow:
				0 0 0 1px hsl(var(--hue) 30% 85% / 0.12),
				0 12px 32px #0008;
			backdrop-filter: blur(12px);
		}
		.menu button {
			text-align: left;
			padding: 7px 10px;
			border-radius: 6px;
		}
		.menu button:hover,
		.menu button:focus-visible {
			background: var(--row-active);
		}
		@media (prefers-reduced-motion: no-preference) {
			.row,
			.essential {
				transition: background-color 120ms;
			}
			.fav.loading::after {
				animation: spin 800ms linear infinite;
			}
			@keyframes spin {
				to {
					rotate: 1turn;
				}
			}
			.world-name {
				animation: rise 320ms cubic-bezier(0.2, 0, 0, 1);
			}
			@keyframes rise {
				from {
					opacity: 0;
					transform: translateY(8px);
				}
			}
			/* After a switch the new planet rises and the new list slides in from the side it came from. */
			.world {
				animation: planet-rise 380ms cubic-bezier(0.2, 0, 0, 1);
			}
			@keyframes planet-rise {
				from {
					transform: translateY(34px);
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
		}
	`;
}

customElements.define("loka-sidebar", LokaSidebar);
