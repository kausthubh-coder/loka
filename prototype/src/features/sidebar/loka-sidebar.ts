import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { Update } from "../../app/loka-app";
import { faviconColor, faviconLetter, hostOf } from "./favicon";
import {
	activateTab,
	activeSpace,
	activeTab,
	type BrowserState,
	closeTab,
	createFolder,
	createSpace,
	exportState,
	importState,
	moveItem,
	type PinnedRow,
	type Place,
	pinnedRows,
	renameFolder,
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
}
interface MenuItem {
	label: string;
	run: () => void;
}

const SPACE_HUES = [200, 30, 150, 330, 260, 90, 0];

/** The Arc-style sidebar: URL pill, essentials, the space's pinned tree, open tabs and the space switcher. */
export class LokaSidebar extends LitElement {
	static override properties = {
		state: { attribute: false },
		apply: { attribute: false },
		dragId: { state: true },
		drop: { state: true },
		menu: { state: true },
		renamingId: { state: true },
	};

	declare state: BrowserState;
	declare apply: Update;
	dragId: string | null = null;
	drop: Drop | null = null;
	menu: { x: number; y: number; items: MenuItem[] } | null = null;
	renamingId: string | null = null;

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

	private over(
		e: DragEvent,
		key: string,
		place: (mode: DropMode) => Place | null,
		canInto = false,
		axis: "x" | "y" = "y",
	) {
		if (!this.dragId || this.dragId === key) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const ratio = axis === "y" ? (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width;
		let mode: DropMode = ratio < 0.5 ? "before" : "after";
		if (canInto && ratio > 0.25 && ratio < 0.75) mode = "into";
		const target = place(mode);
		if (!target) return;
		e.preventDefault();
		if (this.drop?.key !== key || this.drop.mode !== mode) this.drop = { key, mode, place: target };
	}

	private dropHere(e: DragEvent) {
		e.preventDefault();
		const id = this.dragId;
		const drop = this.drop;
		this.endDrag();
		if (id && drop) this.apply((s) => moveItem(s, id, drop.place));
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
		if (isOpen) {
			items.push({
				label: "Pin to space",
				run: () =>
					this.apply((s) => moveItem(s, tabId, { area: "pinned", spaceId: space.id, parentId: null, index: Infinity })),
			});
		} else if (!isEssential) {
			items.push({
				label: "Unpin",
				run: () => this.apply((s) => moveItem(s, tabId, { area: "open", spaceId: space.id, index: 0 })),
			});
		}
		if (!isEssential) {
			items.push({
				label: "Add to Essentials",
				run: () => this.apply((s) => moveItem(s, tabId, { area: "essentials", index: Infinity })),
			});
		} else {
			items.push({
				label: "Remove from Essentials",
				run: () => this.apply((s) => moveItem(s, tabId, { area: "open", spaceId: space.id, index: 0 })),
			});
		}
		for (const other of state.spaces) {
			if (other.id === space.id) continue;
			items.push({
				label: `Move to ${other.name}`,
				run: () => this.apply((s) => moveItem(s, tabId, { area: "open", spaceId: other.id, index: 0 })),
			});
		}
		items.push({ label: isOpen ? "Close tab" : "Unload tab", run: () => this.apply((s) => closeTab(s, tabId)) });
		return items;
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

	private newFolder(parentId: string | null) {
		const [next, id] = createFolder(this.state, activeSpace(this.state).id, parentId, "New folder");
		this.apply(() => next);
		this.renamingId = id;
	}

	private newSpace() {
		const hue = SPACE_HUES[this.state.spaces.length % SPACE_HUES.length] ?? 200;
		const [next] = createSpace(this.state, `Space ${this.state.spaces.length + 1}`, hue);
		this.apply(() => next);
	}

	private moreMenu(e: MouseEvent) {
		this.openMenu(e, [
			{ label: "New space", run: () => this.newSpace() },
			{ label: "Export spaces (JSON)", run: () => this.exportFile() },
			{ label: "Import spaces (JSON)", run: () => this.importFile() },
			{
				label: "Reset demo data",
				run: () => this.dispatchEvent(new CustomEvent("loka-reset", { bubbles: true, composed: true })),
			},
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

	private favicon(url: string, size = 16): TemplateResult {
		return html`<span class="fav" aria-hidden="true" style="--fav: ${faviconColor(url)}; --size: ${size}px">${faviconLetter(url)}</span>`;
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
				@dragover=${(e: DragEvent) => this.over(e, tabId, place)}
				@drop=${(e: DragEvent) => this.dropHere(e)}
				@click=${() => this.apply((s) => activateTab(s, tabId))}
				@keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.apply((s) => activateTab(s, tabId))}
				@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.tabMenu(tabId))}
			>
				${this.favicon(tab.url)}
				<span class="label">${tab.title}</span>
				${
					closable
						? html`<button
								class="close"
								aria-label="Close ${tab.title}"
								@click=${(e: Event) => {
									e.stopPropagation();
									this.apply((s) => closeTab(s, tabId));
								}}
							>
								×
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
				@dragover=${(e: DragEvent) => this.over(e, node.id, folderPlace, true)}
				@drop=${(e: DragEvent) => this.dropHere(e)}
				@click=${() => !renaming && this.apply((s) => toggleFolder(s, node.id))}
				@dblclick=${() => (this.renamingId = node.id)}
				@keydown=${(e: KeyboardEvent) => e.key === "Enter" && !renaming && this.apply((s) => toggleFolder(s, node.id))}
				@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.folderMenu(node.id))}
			>
				<svg class="chevron ${node.open ? "open" : ""}" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
				<svg class="folder-icon" viewBox="0 0 16 16" aria-hidden="true">
					<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
				</svg>
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
			<aside @click=${this.closeMenu} @contextmenu=${(e: MouseEvent) => e.target === e.currentTarget && e.preventDefault()}>
				<div class="toolbar">
					<button class="icon" aria-label="Back"><svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" /></svg></button>
					<button class="icon" aria-label="Forward"><svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" /></svg></button>
					<button class="icon" aria-label="Reload"><svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5" /></svg></button>
				</div>
				<button
					class="url"
					@click=${() => this.dispatchEvent(new CustomEvent("loka-command", { bubbles: true, composed: true }))}
				>
					${current ? hostOf(current.url) : "Search or enter address"}
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
											false,
											"x",
										)}
									@drop=${(e: DragEvent) => this.dropHere(e)}
									@click=${() => this.apply((s) => activateTab(s, id))}
									@contextmenu=${(e: MouseEvent) => this.openMenu(e, this.tabMenu(id))}
								>
									${this.favicon(tab.url, 20)}
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

				<div class="space-head">
					<span class="space-dot"></span>
					<h2>${space.name}</h2>
					<button class="icon small" aria-label="New folder" title="New folder" @click=${() => this.newFolder(null)}>
						<svg viewBox="0 0 16 16"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5zM8 7v4M6 9h4" /></svg>
					</button>
				</div>

				<div class="scroll">
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
										@click=${() => this.apply((s) => space.open.reduce((acc, id) => closeTab(acc, id), s))}
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
				</div>

				<nav class="spaces" aria-label="Spaces">
					${state.spaces.map(
						(s, i) => html`
							<button
								class="space ${s.id === space.id ? "current" : ""}"
								style="--h: ${s.hue}"
								aria-label="${s.name} (Ctrl ${i + 1})"
								aria-current=${s.id === space.id ? "true" : "false"}
								title="${s.name}  ·  Ctrl ${i + 1}"
								@click=${() => this.apply((st) => switchSpace(st, s.id))}
								@dragover=${(e: DragEvent) => {
									// Hovering a space while dragging switches to it, like Arc.
									if (!this.dragId || s.id === space.id) return;
									e.preventDefault();
									this.apply((st) => switchSpace(st, s.id));
								}}
							>
								${s.name.slice(0, 1)}
							</button>
						`,
					)}
					<button class="space add" aria-label="New space" title="New space" @click=${() => this.newSpace()}>+</button>
					<button class="icon more" aria-label="More" @click=${(e: MouseEvent) => this.moreMenu(e)}>
						<svg viewBox="0 0 16 16"><path d="M4 8h.01M8 8h.01M12 8h.01" /></svg>
					</button>
				</nav>

				${
					this.menu
						? html`<div
								class="menu"
								role="menu"
								style="left: ${Math.min(this.menu.x, 272 - 196)}px; top: ${Math.min(this.menu.y, window.innerHeight - 40 * this.menu.items.length)}px"
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

	static override styles = css`
		:host {
			display: block;
			min-height: 0;
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
		.icon.small {
			width: 24px;
			height: 24px;
			margin-left: auto;
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
			height: 44px;
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
		.space-head {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 4px 4px 0 6px;
		}
		.space-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--accent);
			box-shadow: 0 0 10px var(--accent);
		}
		h2 {
			margin: 0;
			font-size: 13px;
			font-weight: 600;
			color: var(--text);
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
			gap: 8px;
			width: 100%;
			box-sizing: border-box;
			height: 32px;
			padding: 0 6px 0 calc(8px + var(--depth, 0) * 16px);
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
			left: calc(8px + var(--depth, 0) * 16px);
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
		.folder {
			color: var(--text);
		}
		.chevron {
			flex: none;
			width: 12px;
			height: 12px;
			margin: 0 -4px 0 -2px;
			color: var(--muted);
		}
		.chevron.open {
			transform: rotate(90deg);
		}
		.folder-icon {
			flex: none;
			color: var(--accent);
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
			display: grid;
			place-items: center;
			width: 22px;
			height: 22px;
			border-radius: 6px;
			color: var(--muted);
			font-size: 16px;
			line-height: 1;
			opacity: 0;
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
		.spaces {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			padding-top: 6px;
		}
		.space {
			display: grid;
			place-items: center;
			width: 26px;
			height: 26px;
			border-radius: 50%;
			font-size: 11px;
			font-weight: 600;
			color: hsl(var(--h) 70% 82%);
			background: hsl(var(--h) 50% 50% / 0.14);
		}
		.space:hover {
			background: hsl(var(--h) 50% 50% / 0.26);
		}
		.space.current {
			color: #0b0c10;
			background: hsl(var(--h) 80% 72%);
			box-shadow: 0 0 14px hsl(var(--h) 80% 60% / 0.55);
		}
		.space.add {
			color: var(--muted);
			background: none;
			box-shadow: inset 0 0 0 1px hsl(var(--hue) 30% 85% / 0.16);
			font-size: 15px;
			font-weight: 400;
		}
		.more {
			position: absolute;
			right: 8px;
			bottom: 8px;
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
			.chevron {
				transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
			}
			.row,
			.essential,
			.space {
				transition: background-color 120ms;
			}
		}
	`;
}

customElements.define("loka-sidebar", LokaSidebar);
