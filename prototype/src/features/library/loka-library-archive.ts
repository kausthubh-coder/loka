import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { Act } from "../../app/loka-app";
import { timeLabel } from "../history/history.logic";
import { LokaHistory } from "../history/loka-history";
import { faviconBackground, faviconInner, hostOf } from "../sidebar/favicon";
import { planet } from "../sidebar/planet";
import type { BrowserState } from "../sidebar/sidebar.logic";
import { playCue } from "../sound/sound";
import { type ArchiveRow, archiveDays, archiveSpaces } from "./library.logic";

/**
 * The Library's Archived tabs: what the archive took, newest first under the day it left, each with the space it
 * left and when. Search by title or address, narrow to one space, click a tab to bring it back to its space (and go
 * to it), or clear the archive after a confirm. Days off screen aren't laid out. `state` is null until the browser
 * has answered.
 */
export class LokaLibraryArchive extends LitElement {
	static override properties = {
		state: { attribute: false },
		act: { attribute: false },
		query: { state: true },
		spaceId: { state: true },
		confirming: { state: true },
	};

	declare state: BrowserState | null;
	declare act: Act;
	query = "";
	/** The space the list is narrowed to, or null for every space. */
	spaceId: string | null = null;
	confirming = false;
	/** The confirm just opened or closed: focus goes into it, or back to the button that opened it. */
	private focusTo: "confirm" | "clear" | null = null;

	override connectedCallback() {
		super.connectedCallback();
		window.addEventListener("keydown", this.onWindowKey);
	}

	override disconnectedCallback() {
		window.removeEventListener("keydown", this.onWindowKey);
		super.disconnectedCallback();
	}

	private onWindowKey = (e: KeyboardEvent) => {
		const inField = e.composedPath()[0] instanceof HTMLInputElement;
		if ((e.key === "/" && !inField) || ((e.ctrlKey || e.metaKey) && e.key === "f")) {
			const search = this.renderRoot.querySelector<HTMLInputElement>("input[type=search]");
			if (!search) return;
			e.preventDefault();
			search.focus();
			search.select();
		} else if (e.key === "Escape" && this.confirming) this.closeConfirm();
	};

	private restore(row: ArchiveRow) {
		playCue("tab-open");
		this.act({ op: "restoreArchived", tabId: row.tab.id, now: Date.now() });
	}

	private clear() {
		playCue("clear");
		this.act({ op: "clearArchive" });
		this.spaceId = null;
		this.closeConfirm();
	}

	private closeConfirm() {
		this.confirming = false;
		this.focusTo = "clear";
	}

	protected override updated() {
		if (this.focusTo === "confirm") this.renderRoot.querySelector<HTMLElement>(".confirm .danger")?.focus();
		if (this.focusTo === "clear") this.renderRoot.querySelector<HTMLElement>(".clear-wrap > button")?.focus();
		this.focusTo = null;
	}

	private row(row: ArchiveRow): TemplateResult {
		const { tab, space } = row;
		return html`<li>
			<button class="row" title=${tab.url} aria-label="Bring back ${tab.title}" @click=${() => this.restore(row)}>
				<span class="fav" style="--fav: ${faviconBackground(tab.url)}" aria-hidden="true">${faviconInner(tab.url)}</span>
				<span class="label">
					<span class="title">${tab.title}</span>
					<span class="host">${hostOf(tab.url)}</span>
				</span>
				<span class="from" title=${space ? `From ${space.name}` : "From a space that's since been deleted"}>
					${space ? html`<span class="mini" aria-hidden="true">${planet(space.planet, space.hue, 14)}</span>${space.name}` : "Deleted space"}
				</span>
				<span class="time shown">${timeLabel(row.time)}</span>
				<span class="restore" aria-hidden="true">Restore</span>
			</button>
		</li>`;
	}

	private body(state: BrowserState): TemplateResult {
		const days = archiveDays(state, this.query, this.spaceId, Date.now());
		if (!state.archive.length) {
			return html`<div class="empty">
				<p>
					<b>Nothing archived</b>
					Open tabs you haven't looked at in a while move here by themselves, after the time set in Settings.
					Pinned tabs and Essentials stay put.
				</p>
			</div>`;
		}
		if (!days.length) {
			return html`<div class="empty">
				<p><b>No archived tab matches “${this.query.trim()}”</b>Try part of the title or the site's address.</p>
				<button class="quiet filled" @click=${() => (this.query = "")}>Clear the search</button>
			</div>`;
		}
		return html`${repeat(
			days,
			(day) => day.key,
			(day) => html`<section class="day" aria-labelledby="day-${day.key}">
				<h2 id="day-${day.key}"><span>${day.label}</span></h2>
				<ul>
					${repeat(
						day.items,
						(r) => r.tab.id,
						(r) => this.row(r),
					)}
				</ul>
			</section>`,
		)}`;
	}

	override render() {
		const state = this.state;
		const total = state?.archive.length ?? 0;
		const spaces = state ? archiveSpaces(state) : [];
		return html`<div class="scroller">
				<div class="layout" ?inert=${this.confirming}>
					<aside class="rail card">
						<slot name="nav"></slot>
						<h1>Archived tabs</h1>
						<label class="search">
							<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
							<input
								type="search"
								placeholder="Search archived tabs"
								aria-label="Search archived tabs"
								autocomplete="off"
								spellcheck="false"
								.value=${this.query}
								@input=${(e: Event) => {
									this.query = (e.target as HTMLInputElement).value;
								}}
							/>
							<kbd>/</kbd>
						</label>
						${
							spaces.length
								? html`<div class="filters" role="group" aria-label="Show tabs archived from">
										<button class="filter" aria-pressed=${this.spaceId === null} @click=${() => (this.spaceId = null)}>
											<span class="space-name">Every space</span><span class="n">${total}</span>
										</button>
										${spaces.map(
											({ space, count }) => html`<button
												class="filter"
												aria-pressed=${this.spaceId === space.id}
												@click=${() => (this.spaceId = space.id)}
											>
												<span class="mini" aria-hidden="true">${planet(space.planet, space.hue, 16)}</span>
												<span class="space-name">${space.name}</span><span class="n">${count}</span>
											</button>`,
										)}
									</div>`
								: nothing
						}
						${
							total
								? html`<div class="clear-wrap">
										<button
											class="quiet"
											@click=${() => {
												this.confirming = true;
												this.focusTo = "confirm";
											}}
										>
											<svg viewBox="0 0 16 16" aria-hidden="true">
												<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2c0 .3.3.6.6.6h4.6c.3 0 .6-.3.6-.6l.6-8.2" />
											</svg>
											Clear archive…
										</button>
									</div>`
								: nothing
						}
					</aside>
					<main class="list card">
						${
							state
								? this.body(state)
								: html`<ul class="skeleton" aria-label="Loading archived tabs">
										<li class="heading"><b style="width: 52px"></b></li>
										${[54, 38, 62, 46].map((w) => html`<li><i></i><b class="fav"></b><b style="width: ${w}%"></b></li>`)}
									</ul>`
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
								<h2 id="confirm-title">Clear ${total === 1 ? "1 archived tab" : `all ${total} archived tabs`}?</h2>
								<p id="confirm-text">They can't be brought back after this. Your history keeps the pages you visited.</p>
								<div class="actions">
									<button class="quiet" @click=${() => this.closeConfirm()}>Cancel</button>
									<button class="danger" @click=${() => this.clear()}>Clear archive</button>
								</div>
							</div>`
					: nothing
			}`;
	}

	static override styles = [
		LokaHistory.styles,
		css`
			button.row {
				width: 100%;
				text-align: left;
			}
			/* No pick boxes here, so a day's name lines up with the icons. */
			.day h2 {
				padding-left: 0;
			}
			.filter {
				display: flex;
				align-items: center;
				gap: 10px;
			}
			.space-name {
				flex: 1;
				min-width: 0;
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}
			.n {
				flex: none;
				color: var(--loka-ink-3);
				font-size: 13px;
				font-variant-numeric: tabular-nums;
			}
			/* On the chosen filter's lighter fill the count steps up a tone, so it keeps 4.5:1. */
			.filter[aria-pressed="true"] .n {
				color: var(--loka-ink-2);
			}
			.mini {
				display: grid;
				flex: none;
			}
			/* Where it came from and when stay in view: that's what you look for in the archive. */
			.from {
				display: flex;
				align-items: center;
				gap: 6px;
				flex: none;
				max-width: 30%;
				overflow: hidden;
				white-space: nowrap;
				color: var(--loka-ink-2);
				font-size: 13px;
			}
			.time.shown {
				opacity: 1;
				min-width: 64px;
				text-align: right;
			}
			.restore {
				flex: none;
				padding: 0 10px;
				color: var(--loka-accent-ink);
				font-size: 13px;
				font-weight: 600;
				opacity: 0;
			}
			.row:hover .restore,
			.row:focus-visible .restore {
				opacity: 1;
			}
			@container (width < 820px) {
				.space-name {
					flex: none;
				}
				.restore {
					display: none;
				}
			}
			@container (width < 560px) {
				.from {
					display: none;
				}
			}
		`,
	];
}

customElements.define("loka-library-archive", LokaLibraryArchive);
