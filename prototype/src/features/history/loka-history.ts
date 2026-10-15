import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { HistoryBridge, HistoryItem } from "../../../../webui/src/history-bridge";
import { faviconBackground, faviconInner, hostOf } from "../sidebar/favicon";
import { playCue } from "../sound/sound";
import {
	appendPage,
	type ClearRange,
	clearRange,
	groupByDay,
	itemKey,
	selectThrough,
	timeLabel,
	withoutUrls,
} from "./history.logic";

const PAGE = 100;

const CLEAR_LABELS: Record<ClearRange, { menu: string; ask: string }> = {
	hour: { menu: "The last hour", ask: "Clear the last hour of history?" },
	today: { menu: "Today", ask: "Clear today's history?" },
	all: { menu: "Everything", ask: "Clear all of your history?" },
};

/**
 * Loka's History page: every visit, newest first, cut into days with headings that stay at the top while their day
 * scrolls. Search as you type, pick rows (click their box, Shift for a run, Space on the keyboard) and delete them,
 * or clear the last hour, today or everything. It loads a page at a time as you scroll, and days off screen aren't
 * laid out, so a long history stays smooth. Talks to the browser only through `bridge`.
 */
export class LokaHistory extends LitElement {
	static override properties = {
		bridge: { attribute: false },
		query: { state: true },
		items: { state: true },
		done: { state: true },
		loading: { state: true },
		selected: { state: true },
		focusKey: { state: true },
		clearMenu: { state: true },
		confirming: { state: true },
	};

	declare bridge: HistoryBridge;
	query = "";
	items: HistoryItem[] = [];
	done = false;
	/** True while a page is on its way; the first page shows placeholder rows. */
	loading = true;
	selected: Set<string> = new Set();
	/** The row keyboard focus is on (the one row in the tab order). */
	focusKey: string | null = null;
	clearMenu = false;
	confirming: ClearRange | null = null;
	/** The clear menu or the confirm just opened: focus goes into it on the next render. */
	private focusInto: "menu" | "confirm" | null = null;
	/** A layer just closed: focus goes back to the Clear history button. */
	private focusBack = false;
	private anchor: string | null = null;
	private request = 0;
	private searchTimer = 0;
	private observer: IntersectionObserver | null = null;
	private stopChanged = () => {};

	override connectedCallback() {
		super.connectedCallback();
		this.stopChanged = this.bridge.onHistoryChanged(() => void this.refresh());
		void this.load(true);
		window.addEventListener("keydown", this.onWindowKey);
	}

	override disconnectedCallback() {
		this.stopChanged();
		this.observer?.disconnect();
		window.removeEventListener("keydown", this.onWindowKey);
		super.disconnectedCallback();
	}

	/** Loads the first page for the search (`fresh`), or the next older one. Late answers to old searches are dropped. */
	private async load(fresh: boolean) {
		const request = ++this.request;
		this.loading = true;
		const before = fresh ? 0 : (this.items.at(-1)?.time ?? 0);
		const page = await this.bridge.queryHistory(this.query.trim(), before, PAGE);
		if (request !== this.request) return;
		this.items = fresh ? page.items : appendPage(this.items, page.items);
		this.done = page.done;
		this.loading = false;
		if (fresh) this.selected = new Set();
	}

	/** Something was deleted: ask again for what's shown, as far down as it went (one page of up to 200 at most). */
	private async refresh() {
		const request = ++this.request;
		const count = Math.min(200, Math.max(PAGE, this.items.length));
		const page = await this.bridge.queryHistory(this.query.trim(), 0, count);
		if (request !== this.request) return;
		if (this.items.length <= count) {
			this.items = page.items;
			this.done = page.done;
		}
	}

	private onSearch(value: string) {
		this.query = value;
		window.clearTimeout(this.searchTimer);
		this.searchTimer = window.setTimeout(() => void this.load(true), 180);
	}

	private open(item: HistoryItem, newTab: boolean) {
		this.bridge.openUrl(item.url, newTab);
	}

	private deleteUrls(urls: Set<string>) {
		if (!urls.size) return;
		playCue("tab-close");
		this.items = withoutUrls(this.items, urls);
		this.selected = new Set();
		this.bridge.deleteUrls([...urls]);
	}

	private deleteSelected() {
		const keys = this.selected;
		this.deleteUrls(new Set(this.items.filter((i) => keys.has(itemKey(i))).map((i) => i.url)));
	}

	private clear(range: ClearRange) {
		const { begin, end } = clearRange(range, Date.now());
		playCue("clear");
		this.items = this.items.filter((i) => i.time < begin || i.time > end);
		this.closeConfirm();
		this.bridge.deleteRange(begin, end);
	}

	private closeConfirm() {
		this.confirming = null;
		this.focusBack = true;
	}

	/** Keys in the clear menu: Up, Down, Home and End move; Escape and Tab close it and go back to its button. */
	private onMenuKey(e: KeyboardEvent) {
		const items = [...this.renderRoot.querySelectorAll<HTMLElement>('.menu [role="menuitem"]')];
		const at = items.indexOf(this.shadowRoot?.activeElement as HTMLElement);
		let next: number;
		if (e.key === "ArrowDown") next = (at + 1) % items.length;
		else if (e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = items.length - 1;
		else if (e.key === "Escape" || e.key === "Tab") {
			e.preventDefault();
			e.stopPropagation();
			this.clearMenu = false;
			this.focusBack = true;
			return;
		} else return;
		e.preventDefault();
		items[next]?.focus();
	}

	private toggle(key: string, shift: boolean) {
		const order = this.items.map(itemKey);
		let next: Set<string>;
		if (shift) next = selectThrough(order, this.selected, this.anchor, key);
		else {
			next = new Set(this.selected);
			if (!next.delete(key)) next.add(key);
		}
		this.anchor = key;
		this.selected = next;
	}

	private focusRow(key: string | undefined) {
		if (!key) return;
		this.focusKey = key;
		void this.updateComplete.then(() =>
			this.renderRoot.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus(),
		);
	}

	/** Keys on a row: arrows move, Space picks, Enter opens (Ctrl for a new tab), Delete removes. */
	private onRowKey(e: KeyboardEvent, item: HistoryItem) {
		const key = itemKey(item);
		const order = this.items.map(itemKey);
		const at = order.indexOf(key);
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const next = order[at + (e.key === "ArrowDown" ? 1 : -1)];
			if (e.shiftKey && next) this.selected = new Set([...this.selected, key, next]);
			this.focusRow(next);
		} else if (e.key === "Home" || e.key === "End") {
			e.preventDefault();
			this.focusRow(e.key === "Home" ? order[0] : order.at(-1));
		} else if (e.key === " ") {
			e.preventDefault();
			this.toggle(key, e.shiftKey);
		} else if (e.key === "Enter") {
			this.open(item, e.ctrlKey || e.metaKey);
		} else if (e.key === "Delete") {
			e.preventDefault();
			if (this.selected.size) this.deleteSelected();
			else {
				this.focusRow(order[at + 1] ?? order[at - 1]);
				this.deleteUrls(new Set([item.url]));
			}
		}
	}

	private onWindowKey = (e: KeyboardEvent) => {
		const search = this.renderRoot.querySelector<HTMLInputElement>("input[type=search]");
		if ((e.key === "/" && !(e.target instanceof HTMLInputElement)) || ((e.ctrlKey || e.metaKey) && e.key === "f")) {
			e.preventDefault();
			search?.focus();
			search?.select();
		} else if (e.key === "Escape") {
			if (this.confirming) this.closeConfirm();
			else if (this.clearMenu) {
				this.clearMenu = false;
				this.focusBack = true;
			} else if (this.selected.size) this.selected = new Set();
		} else if ((e.ctrlKey || e.metaKey) && e.key === "a" && !(e.composedPath()[0] instanceof HTMLInputElement)) {
			e.preventDefault();
			this.selected = new Set(this.items.map(itemKey));
		}
	};

	protected override updated() {
		// While rows are picked, every row shows its box, so more can be picked without hunting for it.
		this.toggleAttribute("picking", this.selected.size > 0);
		// Focus goes into a layer when it opens, and back to the button that opened it when it closes.
		if (this.focusInto === "menu") this.renderRoot.querySelector<HTMLElement>('.menu [role="menuitem"]')?.focus();
		if (this.focusInto === "confirm") this.renderRoot.querySelector<HTMLElement>(".confirm .danger")?.focus();
		this.focusInto = null;
		if (this.focusBack) {
			this.focusBack = false;
			this.renderRoot.querySelector<HTMLElement>(".clear-wrap > button")?.focus();
		}
		// Loads the next page when the end of the list comes into view.
		const end = this.renderRoot.querySelector(".end");
		if (!end) return;
		this.observer ??= new IntersectionObserver(
			(entries) => {
				if (entries.some((x) => x.isIntersecting) && !this.loading && !this.done) void this.load(false);
			},
			{ rootMargin: "800px" },
		);
		this.observer.disconnect();
		this.observer.observe(end);
	}

	private row(item: HistoryItem): TemplateResult {
		const key = itemKey(item);
		const picked = this.selected.has(key);
		const focusable = (this.focusKey ?? itemKey(this.items[0] ?? item)) === key;
		return html`<li
			class="row ${picked ? "picked" : ""}"
			data-key=${key}
			tabindex=${focusable ? 0 : -1}
			aria-selected=${picked}
			role="option"
			@focus=${() => {
				this.focusKey = key;
			}}
			@keydown=${(e: KeyboardEvent) => this.onRowKey(e, item)}
			@click=${(e: MouseEvent) => {
				if (this.selected.size && !(e.ctrlKey || e.metaKey)) this.toggle(key, e.shiftKey);
				else this.open(item, e.ctrlKey || e.metaKey);
			}}
			@auxclick=${(e: MouseEvent) => e.button === 1 && this.open(item, true)}
		>
			<button
				class="pick"
				role="checkbox"
				aria-checked=${picked}
				aria-label="Select ${item.title || item.url}"
				tabindex="-1"
				@click=${(e: MouseEvent) => {
					e.stopPropagation();
					this.toggle(key, e.shiftKey);
				}}
			>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 8.5 2.5 2.5 4.5-5.5" /></svg>
			</button>
			<span class="time">${timeLabel(item.time)}</span>
			<span class="fav" style="--fav: ${faviconBackground(item.url)}" aria-hidden="true">${faviconInner(item.url)}</span>
			<span class="title">${item.title || item.url}</span>
			<span class="host">${hostOf(item.url)}</span>
			<button
				class="remove"
				aria-label="Remove ${item.title || item.url} from history"
				title="Remove from history"
				tabindex="-1"
				@click=${(e: Event) => {
					e.stopPropagation();
					this.deleteUrls(new Set([item.url]));
				}}
			>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
			</button>
		</li>`;
	}

	private body(): TemplateResult {
		if (this.loading && this.items.length === 0) {
			// Shaped like the rows that replace it (time, icon, title, site), so nothing jumps when they arrive.
			return html`<ul class="skeleton" aria-label="Loading history">
				<li class="heading"><b style="width: 44px"></b></li>
				${[62, 44, 70, 52, 58, 40, 66, 48].map(
					(w) =>
						html`<li><i></i><b class="time" style="width: 52px"></b><b class="fav"></b><b style="width: ${w}%"></b></li>`,
				)}
			</ul>`;
		}
		if (this.items.length === 0) {
			const q = this.query.trim();
			return q
				? html`<div class="empty">
						<p><b>Nothing matches "${q}"</b>Try fewer words, or part of the site's address.</p>
						<button class="quiet" @click=${() => this.onSearch("")}>Clear the search</button>
					</div>`
				: html`<div class="empty">
						<p><b>No history yet</b>The pages you visit show up here, newest first.</p>
					</div>`;
		}
		const days = groupByDay(this.items, Date.now());
		return html`${repeat(
			days,
			(day) => day.key,
			(day) => html`<section class="day" aria-labelledby="day-${day.key}">
					<h2 id="day-${day.key}"><span>${day.label}</span></h2>
					<ul role="listbox" aria-multiselectable="true" aria-labelledby="day-${day.key}">
						${repeat(day.items, itemKey, (item) => this.row(item))}
					</ul>
				</section>`,
		)}
			<div class="end" aria-hidden="true">${this.done ? "That's everything." : this.loading ? "Loading more" : ""}</div>`;
	}

	override render() {
		const count = this.selected.size;
		const layer = this.confirming !== null;
		return html`
			<header ?inert=${layer}>
				<div class="glass" aria-hidden="true"></div>
				<div class="column">
				${
					count
						? html`<div class="bar picking">
								<button class="icon" aria-label="Cancel selection" title="Cancel (Esc)" @click=${() => (this.selected = new Set())}>
									<svg viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
								</button>
								<b class="count">${count} selected</b>
								<button class="danger" @click=${() => this.deleteSelected()}>Delete</button>
							</div>`
						: html`<div class="bar">
								<h1>History</h1>
								<span class="spacer"></span>
								<div class="clear-wrap">
									<button
										class="quiet"
										aria-haspopup="menu"
										aria-expanded=${this.clearMenu}
										@click=${(e: Event) => {
											e.stopPropagation();
											this.clearMenu = !this.clearMenu;
											if (this.clearMenu) this.focusInto = "menu";
										}}
									>
										Clear history
									</button>
									${
										this.clearMenu
											? html`<div
													class="menu"
													role="menu"
													@click=${(e: Event) => e.stopPropagation()}
													@keydown=${(e: KeyboardEvent) => this.onMenuKey(e)}
												>
													${(["hour", "today", "all"] as ClearRange[]).map(
														(range) => html`<button
															role="menuitem"
															tabindex="-1"
															@click=${() => {
																this.clearMenu = false;
																this.confirming = range;
																this.focusInto = "confirm";
															}}
														>
															${CLEAR_LABELS[range].menu}
														</button>`,
													)}
												</div>`
											: nothing
									}
								</div>
							</div>`
				}
				<label class="search">
					<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
					<input
						type="search"
						placeholder="Search history"
						aria-label="Search history"
						autocomplete="off"
						spellcheck="false"
						.value=${this.query}
						@input=${(e: Event) => this.onSearch((e.target as HTMLInputElement).value)}
						@keydown=${(e: KeyboardEvent) => {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								this.focusRow(this.items[0] && itemKey(this.items[0]));
							}
						}}
					/>
					<kbd>/</kbd>
				</label>
				</div>
			</header>
			<main class="column" ?inert=${layer} @click=${() => (this.clearMenu = false)}>${this.body()}</main>
			${
				this.confirming
					? html`<div class="scrim" @click=${() => this.closeConfirm()}></div>
							<div
								class="confirm"
								role="alertdialog"
								aria-modal="true"
								aria-labelledby="confirm-title"
								aria-describedby="confirm-text"
							>
								<h2 id="confirm-title">${CLEAR_LABELS[this.confirming].ask}</h2>
								<p id="confirm-text">Visits are removed from this computer's history. This can't be undone.</p>
								<div class="actions">
									<button class="quiet" @click=${() => this.closeConfirm()}>Cancel</button>
									<button
										class="danger"
										@click=${() => this.confirming && this.clear(this.confirming)}
									>
										Clear history
									</button>
								</div>
							</div>`
					: nothing
			}
		`;
	}

	static override styles = css`
		/* The page is full width, so the header's glass spans the window; the list and header content keep a
		   centered column. */
		:host {
			display: block;
			padding-bottom: 48px;
			font: 14px/1.4 system-ui, "Segoe UI", sans-serif;
			color: var(--loka-ink);
			--header: 136px;
		}
		.column {
			max-width: 780px;
			margin: 0 auto;
			padding: 0 24px;
		}
		button {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
			padding: 0;
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
			flex: none;
		}
		/* The header sits on the sky. Once the list scrolls under it, it frosts over (tinted glass with a hairline
		   edge), across the whole window. */
		header {
			position: sticky;
			top: 0;
			z-index: 3;
			box-sizing: border-box;
			height: var(--header);
			padding: 28px 0 12px;
			container-type: scroll-state;
		}
		.glass {
			position: absolute;
			inset: 0;
			z-index: -1;
			background: color-mix(in srgb, var(--history-bg, transparent) 64%, transparent);
			backdrop-filter: blur(20px) saturate(1.3);
			box-shadow: 0 1px 0 var(--loka-line);
			opacity: 0;
			pointer-events: none;
		}
		@container scroll-state(stuck: top) {
			.glass {
				opacity: 1;
			}
		}
		/* Without scroll-state queries, the header is always frosted rather than ever clear over the rows. */
		@supports not (container-type: scroll-state) {
			.glass {
				opacity: 1;
			}
		}
		.bar {
			display: flex;
			align-items: center;
			gap: 8px;
			height: 40px;
			margin-bottom: 12px;
		}
		h1 {
			margin: 0;
			font-size: 28px;
			font-weight: 650;
			letter-spacing: -0.015em;
		}
		.spacer {
			flex: 1;
		}
		.count {
			flex: 1;
			font-size: 15px;
		}
		.quiet,
		.danger {
			position: relative;
			height: 34px;
			padding: 0 14px;
			border-radius: 9px;
			font-weight: 550;
		}
		.quiet {
			color: var(--loka-ink-2);
		}
		.quiet:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		.danger {
			background: var(--loka-danger);
			color: var(--loka-on-danger);
		}
		.danger:hover {
			filter: brightness(1.08);
		}
		.icon {
			position: relative;
			display: grid;
			place-items: center;
			width: 34px;
			height: 34px;
			border-radius: 9px;
			color: var(--loka-ink-2);
		}
		.icon:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		.quiet:active,
		.icon:active,
		.remove:active {
			background: var(--loka-fill-hover);
		}
		.danger:active {
			filter: brightness(0.94);
		}
		/* The header's buttons and each row's small controls take clicks past their edge: 44px targets. */
		.quiet::after,
		.danger::after,
		.icon::after {
			content: "";
			position: absolute;
			inset: -5px 0;
		}
		.clear-wrap {
			position: relative;
		}
		.menu {
			position: absolute;
			right: 0;
			top: 40px;
			z-index: 5;
			display: flex;
			flex-direction: column;
			width: 180px;
			padding: 4px;
			border-radius: 12px;
			background: color-mix(in srgb, var(--loka-surface) 88%, transparent);
			box-shadow: var(--loka-surface-edge);
			backdrop-filter: blur(20px) saturate(1.3);
			transform-origin: top right;
		}
		.menu button {
			height: 36px;
			padding: 0 10px;
			border-radius: 8px;
			text-align: left;
		}
		.menu button:hover,
		.menu button:focus-visible {
			background: var(--loka-hover);
			outline: none;
		}
		.menu button:active {
			background: var(--loka-fill-hover);
		}
		.search {
			display: flex;
			align-items: center;
			gap: 10px;
			height: 44px;
			padding: 0 12px 0 14px;
			border-radius: 12px;
			background: var(--loka-fill);
			box-shadow: inset 0 0 0 1px var(--loka-line);
			color: var(--loka-ink-3);
		}
		.search:focus-within {
			box-shadow: inset 0 0 0 1.5px var(--loka-accent);
		}
		.search input {
			flex: 1;
			min-width: 0;
			height: 100%;
			border: 0;
			outline: none;
			background: none;
			font: inherit;
			font-size: 15px;
			color: var(--loka-ink);
		}
		.search input::placeholder {
			color: var(--loka-ink-3);
		}
		.search input::-webkit-search-cancel-button {
			display: none;
		}
		kbd {
			font: 12px system-ui, "Segoe UI", sans-serif;
			padding: 1px 7px;
			border-radius: 6px;
			background: var(--loka-fill-hover);
			color: var(--loka-ink-2);
		}
		/* Days off screen aren't laid out or painted until they scroll near, which keeps thousands of rows cheap. */
		.day {
			content-visibility: auto;
			contain-intrinsic-size: auto 600px;
			margin-top: 8px;
		}
		/* Each day's name stays under the header while its day scrolls. Stuck, it sits on a small glass pill, so
		   the rows passing under it never run into its letters. */
		.day h2 {
			position: sticky;
			top: var(--header);
			z-index: 1;
			width: fit-content;
			margin: 0;
			padding: 6px 2px 4px;
			font-size: 13px;
			font-weight: 600;
			color: var(--loka-ink-2);
			container-type: scroll-state;
		}
		.day h2 span {
			display: block;
			padding: 3px 10px;
			border-radius: 999px;
		}
		@container scroll-state(stuck: top) {
			.day h2 span {
				background: color-mix(in srgb, var(--history-bg, transparent) 70%, transparent);
				box-shadow: 0 0 0 1px var(--loka-line);
				backdrop-filter: blur(16px) saturate(1.3);
			}
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		.row {
			display: flex;
			align-items: center;
			gap: 12px;
			height: 44px;
			padding: 0 6px 0 8px;
			border-radius: 10px;
			outline: none;
		}
		.row:hover {
			background: var(--loka-hover);
		}
		.row:focus-visible {
			box-shadow: inset 0 0 0 2px var(--loka-accent);
		}
		.row.picked {
			background: color-mix(in srgb, var(--loka-accent) 16%, transparent);
		}
		.pick {
			position: relative;
			display: grid;
			place-items: center;
			flex: none;
			width: 20px;
			height: 20px;
			border-radius: 6px;
			box-shadow: inset 0 0 0 1.5px var(--loka-ink-3);
			color: transparent;
			opacity: 0;
		}
		.pick svg {
			width: 14px;
			height: 14px;
			stroke-width: 2;
		}
		.pick::after {
			content: "";
			position: absolute;
			inset: -12px -8px;
		}
		.row:hover .pick,
		.row:focus-visible .pick,
		:host([picking]) .pick,
		.row.picked .pick {
			opacity: 1;
		}
		.row.picked .pick {
			background: var(--loka-accent);
			box-shadow: none;
			color: var(--loka-on-accent);
		}
		.time {
			width: 68px;
			flex: none;
			color: var(--loka-ink-3);
			font-size: 13px;
			font-variant-numeric: tabular-nums;
		}
		.fav {
			display: grid;
			place-items: center;
			flex: none;
			width: 18px;
			height: 18px;
			border-radius: 5px;
			background: var(--fav);
			color: #0b0c10;
			font-size: 11px;
			font-weight: 700;
			overflow: hidden;
		}
		.title {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		.host {
			flex: none;
			max-width: 34%;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--loka-ink-3);
			font-size: 13px;
		}
		.remove {
			position: relative;
			display: grid;
			place-items: center;
			flex: none;
			width: 32px;
			height: 32px;
			border-radius: 8px;
			color: var(--loka-ink-2);
			opacity: 0;
		}
		.remove::after {
			content: "";
			position: absolute;
			inset: -6px;
		}
		.row:hover .remove,
		.row:focus-visible .remove {
			opacity: 1;
		}
		.remove:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		.skeleton {
			margin-top: 8px;
		}
		.skeleton li {
			height: 44px;
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 0 6px 0 8px;
		}
		.skeleton li.heading {
			height: 32px;
			padding: 2px 12px 0;
		}
		.skeleton i {
			flex: none;
			width: 20px;
		}
		.skeleton b {
			flex: none;
			height: 10px;
			border-radius: 5px;
			background: var(--loka-fill-hover);
		}
		.skeleton b.time {
			margin-right: 16px;
		}
		.skeleton b.fav {
			width: 18px;
			height: 18px;
		}
		.empty {
			display: grid;
			justify-items: center;
			gap: 12px;
			padding: 72px 16px;
			text-align: center;
			color: var(--loka-ink-2);
		}
		.empty p {
			margin: 0;
		}
		.empty b {
			display: block;
			margin-bottom: 4px;
			font-size: 16px;
			color: var(--loka-ink);
		}
		.end {
			padding: 20px;
			text-align: center;
			color: var(--loka-ink-3);
			font-size: 13px;
		}
		.scrim {
			position: fixed;
			inset: 0;
			z-index: 10;
			background: var(--loka-scrim);
		}
		.confirm {
			position: fixed;
			z-index: 11;
			left: 50%;
			top: 30%;
			width: min(400px, calc(100vw - 32px));
			translate: -50% 0;
			box-sizing: border-box;
			padding: 22px;
			border-radius: 16px;
			background: var(--loka-dialog);
			box-shadow: var(--loka-dialog-edge);
		}
		.confirm h2 {
			position: static;
			padding: 0;
			margin: 0 0 8px;
			font-size: 17px;
			color: var(--loka-ink);
		}
		.confirm p {
			margin: 0 0 18px;
			color: var(--loka-ink-2);
		}
		.actions {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
		}
		:focus-visible {
			outline: 2px solid var(--loka-accent);
			outline-offset: 1px;
		}
		@media (prefers-reduced-motion: no-preference) {
			.menu,
			.confirm {
				transition:
					opacity 150ms cubic-bezier(0.2, 0, 0, 1),
					transform 200ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
					transform: scale(0.97);
				}
			}
			.scrim {
				transition: opacity 150ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
				}
			}
			.glass,
			.day h2 span {
				transition:
					opacity 150ms cubic-bezier(0.2, 0, 0, 1),
					background-color 150ms cubic-bezier(0.2, 0, 0, 1);
			}
			/* Placeholder rows breathe while the first page is on its way. */
			.skeleton b {
				animation: breathe 1.2s ease-in-out infinite alternate;
			}
			@keyframes breathe {
				to {
					opacity: 0.45;
				}
			}
		}
	`;
}

customElements.define("loka-history", LokaHistory);
