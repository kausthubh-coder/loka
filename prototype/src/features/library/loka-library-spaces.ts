import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { Act } from "../../app/loka-app";
import { timeAgo } from "../archive/archive.logic";
import { LokaHistory } from "../history/loka-history";
import { faviconBackground, faviconInner, hostOf } from "../sidebar/favicon";
import { planet } from "../sidebar/planet";
import { type BrowserState, moveSpace, type Space, type Tab } from "../sidebar/sidebar.logic";
import { playCue } from "../sound/sound";
import { countsLabel, spaceCounts, spaceDropIndex, type TreeRow, treeRows } from "./library.logic";

/**
 * The Library's Spaces: every space with its planet, its pinned tree (all of it, folders inside folders) and its open
 * tabs, and the Essentials every space shares. Click a tab to go to it; "Switch to" goes to the space. Folders open
 * and close here only, never in the sidebar. Each space is laid out only once it scrolls near, so a big set of spaces
 * stays cheap. The rail's space rows reorder the spaces: drag one, or focus it and press Alt+Up or Alt+Down. `state`
 * is null until the browser has answered.
 */
export class LokaLibrarySpaces extends LitElement {
	static override properties = {
		state: { attribute: false },
		act: { attribute: false },
		closed: { state: true },
		dragging: { state: true },
		said: { state: true },
	};

	declare state: BrowserState | null;
	declare act: Act;
	/** Folders closed here, by id. Every folder starts open, so the whole tree shows. */
	closed: Set<string> = new Set();
	/** The rail row being dragged and the index it would land at; the rail shows the spaces in that order meanwhile. */
	dragging: { id: string; to: number } | null = null;
	/** What a screen reader hears after a move by keys. */
	said = "";

	override disconnectedCallback() {
		this.endDrag();
		super.disconnectedCallback();
	}

	private reveal(tab: Tab) {
		playCue("tab-open");
		this.act({ op: "revealTab", tabId: tab.id, now: Date.now() });
	}

	private switchTo(space: Space) {
		playCue("space");
		this.act({ op: "switchSpace", spaceId: space.id });
	}

	private toggle(folderId: string) {
		const next = new Set(this.closed);
		if (next.has(folderId)) next.delete(folderId);
		else next.add(folderId);
		this.closed = next;
	}

	/** The rail's space names scroll the list to that space. */
	private jumpTo(space: Space) {
		const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
		this.renderRoot
			.querySelector(`[data-space="${CSS.escape(space.id)}"]`)
			?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
	}

	// ---- reordering the spaces from the rail ----------------------------------------------------------------------
	//
	// Pointer events, as in the sidebar (an HTML5 drag inside the browser's window is an OS drag). A press that moves
	// 5 px starts the drag; the rail then shows the spaces in the order the drop would make, with the dragged row lifted
	// in its new place. Letting go sends moveSpace; Escape puts it back.

	/** The press that may become a drag: the row, where it started, and the rows' middles along the rail then. */
	private press: {
		id: string;
		from: number;
		x: number;
		y: number;
		pointerId: number;
		axis: "x" | "y";
		centers: number[];
	} | null = null;

	private pressRow(e: PointerEvent, space: Space) {
		if (e.button !== 0 || e.pointerType === "touch" || this.press || !this.state) return;
		const rows = [...this.renderRoot.querySelectorAll<HTMLElement>(".jump")];
		const filters = this.renderRoot.querySelector<HTMLElement>(".filters");
		// The rail is a column beside the list, or a row of pills over it in a narrow window.
		const axis = filters && getComputedStyle(filters).flexDirection.startsWith("row") ? "x" : "y";
		const centers = rows.map((row) => {
			const r = row.getBoundingClientRect();
			return axis === "x" ? r.left + r.width / 2 : r.top + r.height / 2;
		});
		const from = this.state.spaces.findIndex((s) => s.id === space.id);
		this.press = { id: space.id, from, x: e.clientX, y: e.clientY, pointerId: e.pointerId, axis, centers };
		window.addEventListener("pointermove", this.onDragMove, true);
		window.addEventListener("pointerup", this.onDragUp, true);
		window.addEventListener("pointercancel", this.endDrag, true);
		window.addEventListener("keydown", this.onDragKey, true);
	}

	private onDragMove = (e: PointerEvent) => {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		if (!this.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return;
		e.preventDefault();
		const to = spaceDropIndex(press.centers, press.from, press.axis === "x" ? e.clientX : e.clientY);
		if (this.dragging?.to !== to) this.dragging = { id: press.id, to };
	};

	private onDragUp = (e: PointerEvent) => {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		const dragging = this.dragging;
		this.endDrag();
		if (!dragging) return;
		// The click that ends a drag isn't a click on the row: it doesn't scroll the list to that space.
		window.addEventListener("click", this.swallowClick, { capture: true, once: true });
		setTimeout(() => window.removeEventListener("click", this.swallowClick, true), 0);
		if (dragging.to !== press.from) this.act({ op: "moveSpace", spaceId: dragging.id, toIndex: dragging.to });
	};

	private swallowClick = (e: Event) => {
		e.stopPropagation();
		e.preventDefault();
	};

	private onDragKey = (e: KeyboardEvent) => {
		if (e.key !== "Escape" || !this.press) return;
		e.preventDefault();
		e.stopPropagation();
		this.endDrag();
	};

	/** Ends the press or drag without dropping: Escape, a cancelled pointer, or after a drop. */
	private endDrag = () => {
		window.removeEventListener("pointermove", this.onDragMove, true);
		window.removeEventListener("pointerup", this.onDragUp, true);
		window.removeEventListener("pointercancel", this.endDrag, true);
		window.removeEventListener("keydown", this.onDragKey, true);
		this.press = null;
		this.dragging = null;
	};

	/** The rail row to focus again once the moved spaces arrive: moving a row in the page takes the focus off it. */
	private refocus: string | null = null;

	/** Alt+Up and Alt+Down on a focused rail row move its space one place; the row keeps the focus. */
	private rowKey(e: KeyboardEvent, space: Space) {
		if (!this.state || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
		e.preventDefault();
		const spaces = this.state.spaces;
		const from = spaces.findIndex((s) => s.id === space.id);
		const to = from + (e.key === "ArrowUp" ? -1 : 1);
		if (from === -1 || to < 0 || to >= spaces.length) return;
		this.refocus = space.id;
		this.said = `${space.name} moved to ${to + 1} of ${spaces.length}`;
		this.act({ op: "moveSpace", spaceId: space.id, toIndex: to });
	}

	override updated(changed: Map<PropertyKey, unknown>) {
		if (!this.refocus || !changed.has("state")) return;
		this.renderRoot.querySelector<HTMLElement>(`.jump[data-space-id="${CSS.escape(this.refocus)}"]`)?.focus();
		this.refocus = null;
	}

	private favicon(url: string): TemplateResult {
		return html`<span class="fav" style="--fav: ${faviconBackground(url)}" aria-hidden="true">${faviconInner(url)}</span>`;
	}

	/** A tab's row: its icon, title and site; "Showing" on the tab its space shows; how long since it was looked at. */
	private tabRow(tab: Tab, depth: number, showing: boolean, now: number): TemplateResult {
		return html`<li>
			<button
				class="row tab"
				style="--depth: ${depth}"
				title=${tab.url}
				aria-label="Go to ${tab.title}"
				@click=${() => this.reveal(tab)}
			>
				${this.favicon(tab.url)}
				<span class="label">
					<span class="title">${tab.title}</span>
					<span class="host">${hostOf(tab.url)}</span>
				</span>
				${showing ? html`<span class="showing">Showing</span>` : nothing}
				${tab.lastActiveAt !== undefined ? html`<span class="time">${timeAgo(tab.lastActiveAt, now)}</span>` : nothing}
			</button>
		</li>`;
	}

	private treeRow(row: TreeRow, space: Space, now: number): TemplateResult {
		if (row.kind === "tab") return this.tabRow(row.tab, row.depth, row.id === space.activeTabId, now);
		return html`<li>
			<button
				class="row folder ${row.open ? "open" : ""}"
				style="--depth: ${row.depth}"
				aria-expanded=${row.open}
				@click=${() => this.toggle(row.id)}
			>
				<svg class="folder-icon" viewBox="0 0 16 16" aria-hidden="true">
					<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
				</svg>
				<span class="label">
					<span class="title">${row.name}</span>
					<span class="host">${row.tabs === 1 ? "1 tab" : `${row.tabs} tabs`}</span>
				</span>
				<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 6.5 3.5 3.5 3.5-3.5" /></svg>
			</button>
		</li>`;
	}

	private spaceBlock(state: BrowserState, space: Space, now: number): TemplateResult {
		const counts = spaceCounts(space);
		const current = space.id === state.activeSpaceId;
		const rows = treeRows(space.pinned, state.tabs, this.closed);
		const open = space.open.flatMap((id) => state.tabs[id] ?? []);
		return html`<section class="space" data-space=${space.id} style="--space-hue: ${space.hue}" aria-labelledby="space-${space.id}">
			<header>
				<span class="planet" aria-hidden="true">${planet(space.planet, space.hue, 44)}</span>
				<div class="name">
					<h2 id="space-${space.id}">${space.name}</h2>
					<span class="counts">${countsLabel(counts)}${counts.folders ? `, ${counts.folders === 1 ? "1 folder" : `${counts.folders} folders`}` : ""}</span>
				</div>
				${
					current
						? html`<span class="current">Current space</span>`
						: html`<button class="quiet filled" aria-label="Switch to ${space.name}" @click=${() => this.switchTo(space)}>
								Switch to
							</button>`
				}
			</header>
			${
				rows.length
					? html`<h3>Pinned</h3>
							<ul class="tree">${repeat(
								rows,
								(r) => r.id,
								(r) => this.treeRow(r, space, now),
							)}</ul>`
					: nothing
			}
			${
				open.length
					? html`<h3>Open tabs</h3>
							<ul>${repeat(
								open,
								(t) => t.id,
								(t) => this.tabRow(t, 0, t.id === space.activeTabId, now),
							)}</ul>`
					: nothing
			}
			${rows.length || open.length ? nothing : html`<p class="none">Nothing in ${space.name} yet.</p>`}
		</section>`;
	}

	private essentials(state: BrowserState): TemplateResult {
		const tabs = state.essentials.flatMap((id) => state.tabs[id] ?? []);
		if (!tabs.length) return html``;
		return html`<section class="essentials" aria-labelledby="essentials">
			<header>
				<div class="name">
					<h2 id="essentials">Essentials</h2>
					<span class="counts">In every space</span>
				</div>
			</header>
			<ul class="tiles">
				${tabs.map(
					(tab) => html`<li>
						<button class="tile" title=${tab.url} aria-label="Go to ${tab.title}" @click=${() => this.reveal(tab)}>
							${this.favicon(tab.url)}
							<span class="title">${tab.title}</span>
						</button>
					</li>`,
				)}
			</ul>
		</section>`;
	}

	override render() {
		const state = this.state;
		const now = Date.now();
		const dragging = this.dragging;
		// While a row is dragged the rail shows the order the drop would make.
		const railSpaces = state ? (dragging ? moveSpace(state, dragging.id, dragging.to) : state).spaces : [];
		return html`<div class="scroller">
			<div class="layout">
				<aside class="rail card">
					<slot name="nav"></slot>
					<h1>Spaces</h1>
					<div class="filters" role="group" aria-label="Go to a space">
						${repeat(
							railSpaces,
							(space) => space.id,
							(space) => html`<button
								class="filter jump ${space.id === dragging?.id ? "dragging" : ""}"
								data-space-id=${space.id}
								aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
								title="Drag, or Alt+Up and Alt+Down, to reorder"
								@click=${() => this.jumpTo(space)}
								@pointerdown=${(e: PointerEvent) => this.pressRow(e, space)}
								@keydown=${(e: KeyboardEvent) => this.rowKey(e, space)}
							>
								<span class="mini" aria-hidden="true">${planet(space.planet, space.hue, 18)}</span>
								<span class="jump-name">${space.name}</span>
								${space.id === state?.activeSpaceId ? html`<span class="dot" title="Current space"></span>` : nothing}
							</button>`,
						)}
					</div>
					<p class="sr" role="status">${this.said}</p>
				</aside>
				<main class="list card">
					${
						state
							? html`${this.essentials(state)}
								${repeat(
									state.spaces,
									(s) => s.id,
									(s) => this.spaceBlock(state, s, now),
								)}`
							: html`<ul class="skeleton" aria-label="Loading spaces">
									${[54, 38, 62, 46, 50].map(
										(w) => html`<li><i></i><b class="fav"></b><b style="width: ${w}%"></b></li>`,
									)}
								</ul>`
					}
				</main>
			</div>
		</div>`;
	}

	static override styles = [
		LokaHistory.styles,
		css`
			.rail {
				grid-template-areas: "nav" "title" "filters";
			}
			button.row,
			.tile {
				width: 100%;
				text-align: left;
			}
			.jump {
				display: flex;
				align-items: center;
				gap: 10px;
			}
			.jump-name {
				flex: 1;
				min-width: 0;
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}
			.mini {
				display: grid;
				flex: none;
			}
			/* The row being dragged, lifted in the place the drop would put it. */
			.jump.dragging {
				background: var(--loka-selected);
				box-shadow: var(--loka-selected-edge);
				color: var(--loka-ink);
				cursor: grabbing;
			}
			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				margin: 0;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
			.dot {
				flex: none;
				width: 7px;
				height: 7px;
				border-radius: 50%;
				background: var(--loka-accent);
			}
			/* Each space is laid out only once it scrolls near, like History's days. */
			.space,
			.essentials {
				content-visibility: auto;
				contain-intrinsic-size: auto 480px;
				padding: 14px 4px 10px;
				scroll-margin-top: 12px;
			}
			.space + .space,
			.essentials + .space {
				margin-top: 6px;
				border-top: 1px solid var(--loka-line);
			}
			header {
				display: flex;
				align-items: center;
				gap: 14px;
				padding: 0 6px 8px;
			}
			.planet {
				display: grid;
				flex: none;
				/* Room for a ring, which reaches past the planet's box. */
				margin: 0 4px 0 8px;
				/* The space's own glow behind its planet, as on the sidebar's horizon. */
				filter: drop-shadow(0 0 14px hsl(var(--space-hue) 80% 60% / 0.35));
			}
			.name {
				flex: 1;
				min-width: 0;
				display: grid;
			}
			h2 {
				margin: 0;
				font-size: 19px;
				font-weight: 650;
				letter-spacing: -0.01em;
			}
			.counts {
				color: var(--loka-ink-3);
				font-size: 13px;
			}
			.current {
				flex: none;
				padding: 4px 10px;
				border-radius: 999px;
				background: var(--loka-selected);
				box-shadow: var(--loka-selected-edge);
				font-size: 13px;
				font-weight: 600;
			}
			h3 {
				margin: 10px 0 2px;
				padding-left: 10px;
				font-size: 12px;
				font-weight: 600;
				letter-spacing: 0.04em;
				text-transform: uppercase;
				color: var(--loka-ink-3);
			}
			.row {
				min-height: 40px;
				/* Nested rows step in under their folder. */
				padding-left: calc(10px + var(--depth, 0) * 22px);
			}
			.folder-icon {
				color: hsl(var(--space-hue) 60% 62%);
			}
			.folder .title {
				font-weight: 550;
			}
			.folder.open .chevron {
				rotate: 180deg;
			}
			.showing {
				flex: none;
				color: var(--loka-accent-ink);
				font-size: 13px;
				font-weight: 550;
			}
			.none {
				margin: 4px 10px 6px;
				color: var(--loka-ink-3);
			}
			.tiles {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
				gap: 6px;
				padding: 0 4px;
			}
			.tile {
				display: flex;
				align-items: center;
				gap: 10px;
				height: 44px;
				padding: 0 12px;
				border-radius: 11px;
				background: var(--wash);
			}
			.tile:hover {
				background: var(--wash-press);
			}
			.tile .title {
				min-width: 0;
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}
			@container (width < 820px) {
				.rail {
					grid-template-areas: "nav" "title" "filters";
					grid-template-columns: minmax(0, 1fr);
				}
				.jump-name {
					flex: none;
				}
			}
			@media (prefers-reduced-motion: no-preference) {
				.chevron {
					transition: rotate 160ms cubic-bezier(0.2, 0, 0, 1);
				}
			}
		`,
	];
}

customElements.define("loka-library-spaces", LokaLibrarySpaces);
