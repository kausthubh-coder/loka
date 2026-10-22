import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { HistoryBridge, HistoryItem } from "../../../../webui/src/history-bridge";
import { faviconBackground, faviconInner } from "../sidebar/favicon";
import { playCue } from "../sound/sound";
import {
	appendPage,
	type ClearRange,
	clearRange,
	type DateFilter,
	dateSpan,
	displayHost,
	groupByDay,
	groupRuns,
	itemKey,
	type Row,
	selectThrough,
	takeSpan,
	timeLabel,
	visibleRows,
	visitIconUrl,
	visitTitle,
	withoutUrls,
} from "./history.logic";

const PAGE = 100;

const CLEAR_LABELS: Record<ClearRange, { menu: string; ask: string }> = {
	hour: { menu: "The last hour", ask: "Clear the last hour of history?" },
	today: { menu: "Today", ask: "Clear today's history?" },
	all: { menu: "Everything", ask: "Clear all of your history?" },
};

const FILTERS: { filter: DateFilter; label: string; empty: string }[] = [
	{ filter: "all", label: "All", empty: "" },
	{ filter: "today", label: "Today", empty: "Nothing from today yet" },
	{ filter: "yesterday", label: "Yesterday", empty: "Nothing from yesterday" },
	{ filter: "week", label: "This week", empty: "Nothing from the last seven days" },
	{ filter: "older", label: "Older", empty: "Nothing older than a week" },
];

/** A day's rows, ready to draw. */
interface DayView {
	key: string;
	label: string;
	rows: Row[];
}

/** The visits a row stands for: one, or every visit a folded site row holds. */
function rowItems(row: Row): HistoryItem[] {
	return row.kind === "site" ? row.items : [row.item];
}

function visitsLabel(count: number): string {
	return count === 1 ? "1 visit" : `${count} visits`;
}

/**
 * Loka's History page: every visit, newest first, cut into days with headings that stay at the top while their day
 * scrolls. A rail beside the list (a header on a narrow window) holds search, the date filters and "Clear history".
 * Rows name the page and its site, never the raw address: redirects are named for where they went, and three or more
 * visits in a row to one site fold into one row that opens. Pick rows (their box, Shift for a run, Space on the
 * keyboard) and delete them. It loads a page at a time as you scroll, and days off screen aren't laid out, so a long
 * history stays smooth. Talks to the browser only through `bridge`. It's the Library's History section: the Library's
 * switcher goes in the rail's `nav` slot, and the Library's other sections are drawn with these styles.
 */
export class LokaHistory extends LitElement {
	static override properties = {
		bridge: { attribute: false },
		query: { state: true },
		filter: { state: true },
		items: { state: true },
		done: { state: true },
		loading: { state: true },
		selected: { state: true },
		expanded: { state: true },
		focusKey: { state: true },
		clearMenu: { state: true },
		confirming: { state: true },
	};

	declare bridge: HistoryBridge;
	query = "";
	filter: DateFilter = "all";
	items: HistoryItem[] = [];
	done = false;
	/** True while a page is on its way; the first page shows placeholder rows. */
	loading = true;
	/** Picked visits, by itemKey. A folded site row is picked when all of its visits are. */
	selected: Set<string> = new Set();
	/** The folded site rows that are open, by their row key. */
	expanded: Set<string> = new Set();
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
	/** Every row on screen, in the order the arrow keys walk, as of the last render. */
	private rows: Row[] = [];
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
		this.observer = null;
		window.removeEventListener("keydown", this.onWindowKey);
		super.disconnectedCallback();
	}

	/**
	 * Loads the first page for the search and filter (`fresh`), or the next older one. Late answers to old searches
	 * are dropped. The browser is asked from the filter's end, and a page that reaches past its start is the last.
	 */
	private async load(fresh: boolean) {
		const request = ++this.request;
		this.loading = true;
		const span = dateSpan(this.filter, Date.now());
		const before = fresh ? span.before : (this.items.at(-1)?.time ?? span.before);
		const page = await this.bridge.queryHistory(this.query.trim(), before, PAGE);
		if (request !== this.request) return;
		const kept = takeSpan(page.items, span);
		this.items = fresh ? kept.items : appendPage(this.items, kept.items);
		this.done = page.done || kept.reachedStart;
		this.loading = false;
		if (fresh) {
			this.selected = new Set();
			this.expanded = new Set();
		}
	}

	/** Something was deleted: ask again for what's shown, as far down as it went (one page of up to 200 at most). */
	private async refresh() {
		const request = ++this.request;
		const count = Math.min(200, Math.max(PAGE, this.items.length));
		const span = dateSpan(this.filter, Date.now());
		const page = await this.bridge.queryHistory(this.query.trim(), span.before, count);
		if (request !== this.request) return;
		if (this.items.length <= count) {
			const kept = takeSpan(page.items, span);
			this.items = kept.items;
			this.done = page.done || kept.reachedStart;
		}
	}

	private onSearch(value: string) {
		this.query = value;
		window.clearTimeout(this.searchTimer);
		this.searchTimer = window.setTimeout(() => void this.load(true), 180);
	}

	private setFilter(filter: DateFilter) {
		if (filter === this.filter) return;
		this.filter = filter;
		this.renderRoot.querySelector(".scroller")?.scrollTo({ top: 0 });
		void this.load(true);
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

	/**
	 * Picks or unpicks a row: a visit, or every visit in a folded site. Shift adds the run from the last row picked,
	 * in the order shown.
	 */
	private toggle(row: Row, shift: boolean) {
		const keys = rowItems(row).map(itemKey);
		const first = keys[0];
		if (!first) return;
		let next: Set<string>;
		if (shift) next = new Set([...selectThrough(this.items.map(itemKey), this.selected, this.anchor, first), ...keys]);
		else {
			next = new Set(this.selected);
			const allPicked = keys.every((k) => next.has(k));
			for (const k of keys) {
				if (allPicked) next.delete(k);
				else next.add(k);
			}
		}
		this.anchor = first;
		this.selected = next;
	}

	private setExpanded(key: string, open: boolean) {
		const next = new Set(this.expanded);
		if (open) next.add(key);
		else next.delete(key);
		this.expanded = next;
	}

	private focusRow(key: string | undefined) {
		if (!key) return;
		this.focusKey = key;
		void this.updateComplete.then(() =>
			this.renderRoot.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus(),
		);
	}

	/**
	 * Keys on a row: arrows move (Right opens a folded site and goes into it, Left closes it or goes back up to it),
	 * Space picks, Enter opens the page (Ctrl for a new tab) or opens and closes a site, Delete removes.
	 */
	private onRowKey(e: KeyboardEvent, row: Row) {
		// A site's visits sit inside its element, so their keys bubble up through it: each row handles only its own.
		if (e.target !== e.currentTarget) return;
		const order = this.rows.map((r) => r.key);
		const at = order.indexOf(row.key);
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const next = this.rows[at + (e.key === "ArrowDown" ? 1 : -1)];
			if (e.shiftKey && next) {
				this.selected = new Set([...this.selected, ...[...rowItems(row), ...rowItems(next)].map(itemKey)]);
			}
			this.focusRow(next?.key);
		} else if (e.key === "Home" || e.key === "End") {
			e.preventDefault();
			this.focusRow(e.key === "Home" ? order[0] : order.at(-1));
		} else if (e.key === "ArrowRight" && row.kind === "site") {
			e.preventDefault();
			if (row.expanded) this.focusRow(order[at + 1]);
			else this.setExpanded(row.key, true);
		} else if (e.key === "ArrowLeft" && row.kind === "site" && row.expanded) {
			e.preventDefault();
			this.setExpanded(row.key, false);
		} else if (e.key === "ArrowLeft" && row.kind === "child") {
			e.preventDefault();
			this.focusRow(row.parent);
		} else if (e.key === " ") {
			e.preventDefault();
			this.toggle(row, e.shiftKey);
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (row.kind === "site") this.setExpanded(row.key, !row.expanded);
			else this.open(row.item, e.ctrlKey || e.metaKey);
		} else if (e.key === "Delete") {
			e.preventDefault();
			if (this.selected.size) this.deleteSelected();
			else {
				// A site row's visits go with it, so focus skips past them.
				const after = this.rows.slice(at + 1).find((r) => r.kind !== "child" || r.parent !== row.key);
				this.focusRow(after?.key ?? order[at - 1]);
				this.deleteUrls(new Set(rowItems(row).map((i) => i.url)));
			}
		}
	}

	private onWindowKey = (e: KeyboardEvent) => {
		const search = this.renderRoot.querySelector<HTMLInputElement>("input[type=search]");
		// The event comes from inside this shadow root, where its target reads as the host; the path says where.
		const inField = e.composedPath()[0] instanceof HTMLInputElement;
		if ((e.key === "/" && !inField) || ((e.ctrlKey || e.metaKey) && e.key === "f")) {
			e.preventDefault();
			search?.focus();
			search?.select();
		} else if (e.key === "Escape") {
			if (this.confirming) this.closeConfirm();
			else if (this.clearMenu) {
				this.clearMenu = false;
				this.focusBack = true;
			} else if (this.selected.size) this.selected = new Set();
		} else if ((e.ctrlKey || e.metaKey) && e.key === "a" && !inField) {
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
		// Loads the next page when the end of the list comes near. The list scrolls inside .scroller, so that's the
		// root: against the window, the margin would reach past the scroller's clip and never fire early.
		const end = this.renderRoot.querySelector(".end");
		if (!end) return;
		this.observer ??= new IntersectionObserver(
			(entries) => {
				if (entries.some((x) => x.isIntersecting) && !this.loading && !this.done) void this.load(false);
			},
			{ root: this.renderRoot.querySelector(".scroller"), rootMargin: "800px" },
		);
		this.observer.disconnect();
		this.observer.observe(end);
	}

	private pickBox(row: Row, label: string): TemplateResult {
		const keys = rowItems(row).map(itemKey);
		const count = keys.filter((k) => this.selected.has(k)).length;
		const checked = count === 0 ? "false" : count === keys.length ? "true" : "mixed";
		return html`<button
			class="pick"
			role="checkbox"
			aria-checked=${checked}
			aria-label="Select ${label}"
			tabindex="-1"
			@click=${(e: MouseEvent) => {
				e.stopPropagation();
				this.toggle(row, e.shiftKey);
			}}
		>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				${checked === "mixed" ? html`<path d="M4.5 8h7" />` : html`<path d="m4.5 8.5 2.5 2.5 4.5-5.5" />`}
			</svg>
		</button>`;
	}

	private removeButton(row: Row, label: string): TemplateResult {
		return html`<button
			class="remove"
			aria-label="Remove ${label} from history"
			title="Remove from history"
			tabindex="-1"
			@click=${(e: Event) => {
				e.stopPropagation();
				this.deleteUrls(new Set(rowItems(row).map((i) => i.url)));
			}}
		>
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
		</button>`;
	}

	private favicon(item: HistoryItem): TemplateResult {
		const url = visitIconUrl(item);
		return html`<span class="fav" style="--fav: ${faviconBackground(url)}" aria-hidden="true">${faviconInner(url)}</span>`;
	}

	/** A visit's row: on its own, or (`child`) one of an open site's visits, under it without its icon and site. */
	private visitRow(row: Extract<Row, { kind: "visit" | "child" }>, tabStop: string | undefined): TemplateResult {
		const { item, key } = row;
		const picked = this.selected.has(key);
		const title = visitTitle(item);
		return html`<li
			class="row ${row.kind} ${picked ? "picked" : ""}"
			role="treeitem"
			data-key=${key}
			tabindex=${tabStop === key ? 0 : -1}
			aria-selected=${picked}
			title=${item.url}
			@focus=${() => {
				this.focusKey = key;
			}}
			@keydown=${(e: KeyboardEvent) => this.onRowKey(e, row)}
			@click=${(e: MouseEvent) => {
				e.stopPropagation();
				if (this.selected.size && !(e.ctrlKey || e.metaKey)) this.toggle(row, e.shiftKey);
				else this.open(item, e.ctrlKey || e.metaKey);
			}}
			@auxclick=${(e: MouseEvent) => e.button === 1 && this.open(item, true)}
		>
			${this.pickBox(row, title)}
			${row.kind === "visit" ? this.favicon(item) : html`<span class="guide" aria-hidden="true"></span>`}
			<span class="label">
				<span class="title">${title}</span>
				${row.kind === "visit" ? html`<span class="host">${displayHost(item.url)}</span>` : nothing}
			</span>
			<span class="time">${timeLabel(item.time)}</span>
			${this.removeButton(row, title)}
		</li>`;
	}

	/** A folded site: its icon and name and how many visits, opening to show them. */
	private siteRow(row: Extract<Row, { kind: "site" }>, children: Row[], tabStop: string | undefined): TemplateResult {
		const keys = row.items.map(itemKey);
		const picked = keys.every((k) => this.selected.has(k));
		const newest = row.items[0];
		const name = `${row.host}, ${visitsLabel(row.items.length)}`;
		return html`<li
			class="site ${row.expanded ? "open" : ""}"
			role="treeitem"
			data-key=${row.key}
			tabindex=${tabStop === row.key ? 0 : -1}
			aria-selected=${picked}
			aria-expanded=${row.expanded}
			aria-label=${name}
			@focus=${() => {
				this.focusKey = row.key;
			}}
			@keydown=${(e: KeyboardEvent) => this.onRowKey(e, row)}
		>
			<div
				class="row ${picked ? "picked" : ""}"
				title=${row.host}
				@click=${(e: MouseEvent) => {
					if (this.selected.size) this.toggle(row, e.shiftKey);
					else this.setExpanded(row.key, !row.expanded);
				}}
			>
				${this.pickBox(row, name)} ${newest ? this.favicon(newest) : nothing}
				<span class="label">
					<span class="title">${row.host}</span>
					<span class="count">${visitsLabel(row.items.length)}</span>
				</span>
				<span class="time">${newest ? timeLabel(newest.time) : ""}</span>
				${this.removeButton(row, `${visitsLabel(row.items.length)} to ${row.host}`)}
				<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 6.5 3.5 3.5 3.5-3.5" /></svg>
			</div>
			${
				row.expanded
					? html`<ul role="group">
							${repeat(
								children,
								(c) => c.key,
								(c) => (c.kind === "site" ? nothing : this.visitRow(c, tabStop)),
							)}
						</ul>`
					: nothing
			}
		</li>`;
	}

	private dayRows(day: DayView, tabStop: string | undefined): TemplateResult {
		// Children are drawn inside their site's element, so the day's top level is its visits and sites.
		const top = day.rows.filter((r) => r.kind !== "child");
		return html`${repeat(
			top,
			(r) => r.key,
			(r) =>
				r.kind === "site"
					? this.siteRow(
							r,
							day.rows.filter((c) => c.kind === "child" && c.parent === r.key),
							tabStop,
						)
					: r.kind === "visit"
						? this.visitRow(r, tabStop)
						: nothing,
		)}`;
	}

	private emptyState(): TemplateResult {
		const q = this.query.trim();
		const filter = FILTERS.find((f) => f.filter === this.filter);
		if (q) {
			return html`<div class="empty">
				<p>
					<b>Nothing in history matches “${q}”</b>
					${this.filter === "all" ? "Try fewer words, or part of the site's address." : `Searched ${filter?.label.toLowerCase()} only.`}
				</p>
				<button class="quiet filled" @click=${() => this.onSearch("")}>Clear the search</button>
			</div>`;
		}
		if (filter && this.filter !== "all") {
			return html`<div class="empty">
				<p><b>${filter.empty}</b>Visits you make show up here, newest first.</p>
				<button class="quiet filled" @click=${() => this.setFilter("all")}>Show all history</button>
			</div>`;
		}
		return html`<div class="empty">
			<p><b>No history yet</b>The pages you visit show up here, newest first.</p>
		</div>`;
	}

	private body(days: DayView[], tabStop: string | undefined): TemplateResult {
		if (this.loading && this.items.length === 0) {
			// Shaped like the rows that replace it (icon, title, site), so nothing jumps when they arrive.
			return html`<ul class="skeleton" aria-label="Loading history">
				<li class="heading"><b style="width: 52px"></b></li>
				${[54, 38, 62, 46, 50, 34, 58, 42].map(
					(w) => html`<li><i></i><b class="fav"></b><b style="width: ${w}%"></b><b style="width: 72px"></b></li>`,
				)}
			</ul>`;
		}
		if (this.items.length === 0) return this.emptyState();
		return html`${repeat(
			days,
			(day) => day.key,
			(day) => html`<section class="day" aria-labelledby="day-${day.key}">
					<h2 id="day-${day.key}"><span>${day.label}</span></h2>
					<ul role="tree" aria-multiselectable="true" aria-labelledby="day-${day.key}">
						${this.dayRows(day, tabStop)}
					</ul>
				</section>`,
		)}
			<div class="end" aria-hidden="true">${this.done ? "That's everything." : this.loading ? "Loading more" : ""}</div>`;
	}

	private clearControl(): TemplateResult {
		return html`<div class="clear-wrap">
			<button
				class="quiet"
				aria-label="Clear history"
				aria-haspopup="menu"
				aria-expanded=${this.clearMenu}
				@click=${(e: Event) => {
					e.stopPropagation();
					this.clearMenu = !this.clearMenu;
					if (this.clearMenu) this.focusInto = "menu";
				}}
			>
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2c0 .3.3.6.6.6h4.6c.3 0 .6-.3.6-.6l.6-8.2" />
				</svg>
				Clear history…
			</button>
			${
				this.clearMenu
					? html`<div
							class="menu"
							role="menu"
							aria-label="Clear history"
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
		</div>`;
	}

	override render() {
		const count = this.selected.size;
		const layer = this.confirming !== null;
		const now = Date.now();
		const days: DayView[] = groupByDay(this.items, now).map((day) => ({
			key: day.key,
			label: day.label,
			rows: visibleRows(groupRuns(day.items), this.expanded),
		}));
		this.rows = days.flatMap((d) => d.rows);
		// One row is in the tab order: the one focus was last on, or the first while that one is gone.
		const tabStop = this.rows.some((r) => r.key === this.focusKey) ? (this.focusKey ?? undefined) : this.rows[0]?.key;
		return html`
			<div class="scroller">
				<div class="layout" ?inert=${layer} @click=${() => (this.clearMenu = false)}>
					<aside class="rail card">
						<slot name="nav"></slot>
						<h1>History</h1>
						<label class="search">
							<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
							<input
								type="search"
								placeholder="Search history"
								aria-label="Search history"
								autocomplete="off"
								spellcheck="false"
								enterkeyhint="search"
								.value=${this.query}
								@input=${(e: Event) => this.onSearch((e.target as HTMLInputElement).value)}
								@keydown=${(e: KeyboardEvent) => {
									if (e.key === "ArrowDown") {
										e.preventDefault();
										this.focusRow(tabStop);
									}
								}}
							/>
							<kbd>/</kbd>
						</label>
						<div class="filters" role="group" aria-label="Show visits from">
							${FILTERS.map(
								(f) => html`<button
									class="filter"
									aria-pressed=${this.filter === f.filter}
									@click=${() => this.setFilter(f.filter)}
								>
									${f.label}
								</button>`,
							)}
						</div>
						${this.clearControl()}
					</aside>
					<main class="list card">
						${this.body(days, tabStop)}
						${
							count
								? html`<div class="picker" role="toolbar" aria-label="Selected visits">
										<b class="count">${count} selected</b>
										<button class="quiet" aria-label="Cancel selection" title="Cancel (Esc)" @click=${() => (this.selected = new Set())}>
											Cancel
										</button>
										<button class="danger" @click=${() => this.deleteSelected()}>Delete</button>
									</div>`
								: nothing
						}
					</main>
				</div>
			</div>
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
		/* The host fills the page (or the prototype's frame) and its .scroller scrolls, so the rail and day headings
		   stick to its top, and the scrollbar sits at the window's edge. */
		:host {
			display: block;
			height: 100%;
			font: 15px/1.45 system-ui, "Segoe UI", sans-serif;
			color: var(--loka-ink);
			/* Washes made from the ink, so they read on the light glass and the dark one alike. */
			--wash: color-mix(in srgb, var(--loka-ink) 5.5%, transparent);
			--wash-press: color-mix(in srgb, var(--loka-ink) 10%, transparent);
			--picked: color-mix(in srgb, var(--loka-accent) 15%, transparent);
		}
		.scroller {
			display: flex;
			flex-direction: column;
			height: 100%;
			overflow-y: auto;
			container-type: inline-size;
			scrollbar-color: color-mix(in srgb, var(--loka-ink) 28%, transparent) transparent;
		}
		/* The rail and the list, side by side and centered as one composition; the list's card is at least as tall
		   as the window. */
		.layout {
			flex: 1 0 auto;
			box-sizing: border-box;
			display: grid;
			grid-template-columns: 248px minmax(0, 1fr);
			gap: 20px;
			width: min(1120px, calc(100% - 64px));
			margin: 32px auto;
		}
		/* The sidebar's glass: the space's sky shows through, frosted, so text on it stays crisp in both themes.
		   Only these two cards blur (never a row), and the blur never animates. */
		.card {
			border-radius: 20px;
			background: color-mix(in srgb, var(--loka-surface) 76%, transparent);
			backdrop-filter: blur(20px) saturate(1.3);
			box-shadow:
				inset 0 0 0 1px var(--loka-fill-hover),
				0 0 0 0.5px var(--loka-line),
				0 18px 48px -20px hsl(var(--hue, 200) 50% 6% / 0.5);
		}
		/* Where glass can't be drawn, or isn't wanted, the cards are solid. */
		@supports not (backdrop-filter: blur(1px)) {
			.card {
				background: var(--loka-surface);
			}
		}
		@media (prefers-reduced-transparency: reduce) {
			.card {
				background: var(--loka-surface);
				backdrop-filter: none;
			}
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

		/* The rail: the Library's sections (slotted in by <loka-library>), title, search, filters and clear, staying in
		   view while the list scrolls. */
		.rail {
			position: sticky;
			top: 32px;
			align-self: start;
			display: grid;
			grid-template-areas: "nav" "title" "search" "filters" "clear";
			/* The column is the card's width, not the search field's natural one. */
			grid-template-columns: minmax(0, 1fr);
			align-content: start;
			gap: 16px;
			padding: 22px 14px 14px;
		}
		::slotted([slot="nav"]) {
			grid-area: nav;
		}
		h1 {
			grid-area: title;
			margin: 0 0 4px 4px;
			font-size: 26px;
			line-height: 1.2;
			font-weight: 650;
			letter-spacing: -0.015em;
		}
		.search {
			grid-area: search;
			display: flex;
			align-items: center;
			gap: 10px;
			height: 40px;
			padding: 0 8px 0 12px;
			border-radius: 11px;
			background: var(--wash);
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
			color: var(--loka-ink);
		}
		.search input::placeholder {
			color: var(--loka-ink-3);
		}
		.search input::-webkit-search-cancel-button {
			display: none;
		}
		kbd {
			font: 12px/1.5 system-ui, "Segoe UI", sans-serif;
			padding: 0 7px;
			border-radius: 6px;
			box-shadow: inset 0 0 0 1px var(--loka-line);
			color: var(--loka-ink-3);
		}
		.search:focus-within kbd {
			visibility: hidden;
		}
		.filters {
			grid-area: filters;
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		.filter {
			height: 36px;
			padding: 0 12px;
			border-radius: 9px;
			text-align: left;
			color: var(--loka-ink-2);
		}
		.filter:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		.filter:active {
			background: var(--wash-press);
		}
		/* The chosen filter is lit the way the sidebar lights its active tab. */
		.filter[aria-pressed="true"] {
			background: var(--loka-selected);
			box-shadow: var(--loka-selected-edge);
			color: var(--loka-ink);
			font-weight: 600;
		}
		.clear-wrap {
			grid-area: clear;
			position: relative;
			padding-top: 8px;
			border-top: 1px solid var(--loka-line);
		}
		.clear-wrap > button {
			display: flex;
			align-items: center;
			gap: 10px;
			width: 100%;
			padding: 0 12px;
		}

		/* Buttons */
		.quiet,
		.danger {
			position: relative;
			height: 36px;
			padding: 0 14px;
			border-radius: 9px;
			font-weight: 550;
		}
		.quiet {
			color: var(--loka-ink-2);
		}
		.quiet.filled {
			background: var(--wash);
			color: var(--loka-ink);
		}
		.quiet:hover {
			background: var(--wash);
			color: var(--loka-ink);
		}
		.quiet.filled:hover {
			background: var(--wash-press);
		}
		.quiet:active,
		.remove:active {
			background: var(--wash-press);
		}
		.danger {
			background: var(--loka-danger);
			color: var(--loka-on-danger);
		}
		.danger:hover {
			filter: brightness(1.08);
		}
		.danger:active {
			filter: brightness(0.94);
		}
		/* Buttons take clicks a little past their edge: 44px targets. */
		.quiet::after,
		.danger::after {
			content: "";
			position: absolute;
			inset: -4px 0;
		}
		.menu {
			position: absolute;
			left: 0;
			top: calc(100% + 4px);
			z-index: 5;
			display: flex;
			flex-direction: column;
			width: 200px;
			padding: 4px;
			border-radius: 12px;
			background: var(--loka-surface);
			box-shadow: var(--loka-surface-edge);
			transform-origin: top left;
		}
		.menu button {
			height: 36px;
			padding: 0 10px;
			border-radius: 8px;
			text-align: left;
		}
		.menu button:hover,
		.menu button:focus-visible {
			background: var(--wash);
			outline: none;
		}
		.menu button:active {
			background: var(--wash-press);
		}

		/* The list */
		.list {
			min-width: 0;
			padding: 10px 12px 20px;
		}
		/* Days off screen aren't laid out or painted until they scroll near, which keeps thousands of rows cheap. */
		.day {
			content-visibility: auto;
			contain-intrinsic-size: auto 600px;
		}
		.day + .day {
			margin-top: 16px;
		}
		/* Each day's name stays at the top while its day scrolls. Stuck, it sits on a small pill of the sheet's
		   color, so the rows passing under it never run into its letters. */
		.day h2 {
			position: sticky;
			top: 0;
			z-index: 1;
			width: fit-content;
			margin: 0;
			/* The name lines up with the icons below it (row padding and pick box, less the pill's own padding). */
			padding: 10px 0 6px 30px;
			font-size: 14px;
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
				background: var(--loka-surface);
				box-shadow: 0 0 0 1px var(--loka-line);
			}
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		.site {
			outline: none;
		}
		.row {
			display: flex;
			align-items: center;
			gap: 12px;
			min-height: 46px;
			padding: 0 6px 0 10px;
			border-radius: 11px;
			outline: none;
			/* Room for the sticky day name above and the selection bar below when a row is focused into view. */
			scroll-margin: 48px 0 88px;
		}
		.row:hover {
			background: var(--loka-hover);
		}
		.row:active {
			background: var(--wash-press);
		}
		.row.picked {
			background: var(--picked);
		}
		.row:focus-visible,
		.site:focus-visible > .row {
			box-shadow: inset 0 0 0 2px var(--loka-accent);
		}
		.pick {
			position: relative;
			display: grid;
			place-items: center;
			flex: none;
			width: 18px;
			height: 18px;
			border-radius: 5px;
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
			inset: -13px -9px;
		}
		.row:hover .pick,
		.row:focus-visible .pick,
		.site:focus-visible > .row .pick,
		:host([picking]) .pick {
			opacity: 1;
		}
		.pick[aria-checked="true"],
		.pick[aria-checked="mixed"] {
			opacity: 1;
			background: var(--loka-accent);
			box-shadow: none;
			color: var(--loka-on-accent);
		}
		.fav {
			display: grid;
			place-items: center;
			flex: none;
			width: 20px;
			height: 20px;
			border-radius: 5px;
			background: var(--fav);
			color: #0b0c10;
			font-size: 11px;
			font-weight: 700;
			overflow: hidden;
		}
		/* An open site's visits hang off a quiet line where their icon would be. */
		.guide {
			align-self: stretch;
			flex: none;
			width: 20px;
			background: linear-gradient(var(--loka-line), var(--loka-line)) center / 1.5px 100% no-repeat;
		}
		.row.child {
			min-height: 40px;
			border-radius: 9px;
		}
		.label {
			flex: 1;
			min-width: 0;
			display: flex;
			align-items: baseline;
			gap: 10px;
		}
		.title {
			min-width: 0;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		.host,
		.label .count {
			flex: none;
			max-width: 40%;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--loka-ink-3);
			font-size: 14px;
		}
		.site > .row .title {
			font-weight: 550;
		}
		/* Time and remove wait at the row's end until it's hovered or focused, so a resting list is just pages. */
		.time {
			flex: none;
			color: var(--loka-ink-3);
			font-size: 13px;
			font-variant-numeric: tabular-nums;
			opacity: 0;
		}
		.remove {
			position: relative;
			display: grid;
			place-items: center;
			flex: none;
			width: 30px;
			height: 30px;
			border-radius: 8px;
			color: var(--loka-ink-2);
			opacity: 0;
		}
		.remove::after {
			content: "";
			position: absolute;
			inset: -7px -4px;
		}
		.row:hover :is(.time, .remove),
		.row:focus-visible :is(.time, .remove),
		.site:focus-visible > .row :is(.time, .remove) {
			opacity: 1;
		}
		.remove:hover {
			background: var(--wash);
			color: var(--loka-ink);
		}
		.chevron {
			color: var(--loka-ink-3);
			margin-right: 4px;
		}
		.site.open .chevron {
			rotate: 180deg;
		}

		.picker {
			position: sticky;
			bottom: 20px;
			z-index: 2;
			display: flex;
			align-items: center;
			gap: 8px;
			width: fit-content;
			margin: 16px auto 0;
			padding: 6px 6px 6px 18px;
			border-radius: 14px;
			background: var(--loka-surface);
			box-shadow: var(--loka-surface-edge);
		}
		.picker .count {
			margin-right: 12px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
		}

		.skeleton li {
			height: 46px;
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 0 6px 0 10px;
		}
		.skeleton li.heading {
			height: 40px;
			padding: 4px 10px 0;
		}
		.skeleton i {
			flex: none;
			width: 18px;
		}
		.skeleton b {
			flex: none;
			height: 10px;
			border-radius: 5px;
			background: var(--wash-press);
		}
		.skeleton b.fav {
			width: 20px;
			height: 20px;
		}
		.empty {
			display: grid;
			justify-items: center;
			gap: 16px;
			padding: 96px 16px;
			text-align: center;
			color: var(--loka-ink-2);
		}
		.empty p {
			margin: 0;
		}
		.empty b {
			display: block;
			margin-bottom: 4px;
			font-size: 17px;
			font-weight: 600;
			color: var(--loka-ink);
			text-wrap: balance;
		}
		.end {
			padding: 24px;
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
		.row:focus-visible,
		.site:focus-visible {
			outline: none;
		}

		/* A narrow window: the rail becomes a header over the list (title and clear on one line, then search, then
		   the filters in a row), and the sheet takes nearly the whole width. */
		@container (width < 820px) {
			.layout {
				grid-template-columns: minmax(0, 1fr);
				grid-template-rows: auto 1fr;
				gap: 12px;
				width: calc(100% - 24px);
				margin: 12px auto;
			}
			.card {
				border-radius: 18px;
			}
			.rail {
				position: static;
				grid-template-areas: "nav nav" "title clear" "search search" "filters filters";
				grid-template-columns: 1fr auto;
				align-items: center;
				gap: 12px;
				padding: 16px 14px 14px;
			}
			h1 {
				margin: 0 0 0 4px;
			}
			.clear-wrap {
				padding-top: 0;
				border-top: 0;
			}
			.menu {
				left: auto;
				right: 0;
				transform-origin: top right;
			}
			.filters {
				flex-direction: row;
				overflow-x: auto;
				scrollbar-width: none;
			}
			.filter {
				flex: none;
				height: 34px;
				padding: 0 14px;
				border-radius: 999px;
			}
		}

		@media (prefers-reduced-motion: no-preference) {
			.menu,
			.confirm,
			.picker {
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
			.chevron {
				transition: rotate 160ms cubic-bezier(0.2, 0, 0, 1);
			}
			.day h2 span {
				transition: background-color 150ms cubic-bezier(0.2, 0, 0, 1);
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
