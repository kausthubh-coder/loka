import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { Browser, NativeDownload } from "../../../../webui/src/bridge";
import {
	type DownloadAction,
	downloadActions,
	downloadProgress,
	downloadStatus,
	fileExt,
	fileHue,
} from "../downloads/downloads.logic";
import { DOWNLOAD_ICONS, DOWNLOAD_LABELS } from "../downloads/loka-downloads";
import { LokaHistory } from "../history/loka-history";
import { hostOf } from "../sidebar/favicon";
import { type DownloadRow, downloadDays } from "./library.logic";

/**
 * The Library's Downloads: the browser's downloads, newest first under the day each started, with live progress and
 * each state's actions (open a finished file, show it in its folder, pause, resume, cancel, try again, remove from
 * the list), as the sidebar's Downloads panel has them. Search by file name or address. Days off screen aren't laid
 * out. Talks to the browser only through `browser`.
 */
export class LokaLibraryDownloads extends LitElement {
	static override properties = {
		browser: { attribute: false },
		downloads: { state: true },
		query: { state: true },
	};

	declare browser: Browser;
	/** The browser's downloads as it last said; null until it answers. */
	downloads: NativeDownload[] | null = null;
	query = "";
	private stop = () => {};

	override connectedCallback() {
		super.connectedCallback();
		const browser = this.browser;
		this.stop = browser.onDownloadsChanged((list) => {
			this.downloads = list;
		});
		void browser.downloads().then((list) => {
			if (this.browser === browser && this.downloads === null) this.downloads = list;
		});
		window.addEventListener("keydown", this.onWindowKey);
	}

	override disconnectedCallback() {
		this.stop();
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
		}
	};

	private act(d: NativeDownload, action: DownloadAction) {
		this.browser.downloadAction(d.id, action);
	}

	/** Takes every download that has ended off the list (the files stay on disk), as the panel's Clear does. */
	private clearList() {
		for (const d of this.downloads ?? []) {
			if (d.state !== "running" && d.state !== "paused") this.act(d, "remove");
		}
	}

	private row({ download: d }: DownloadRow): TemplateResult {
		const { open, buttons } = downloadActions(d);
		const progress = downloadProgress(d);
		const inProgress = d.state === "running" || d.state === "paused";
		const text = html`<span class="file" style="--f: ${fileHue(d.name)}" aria-hidden="true">${fileExt(d.name)}</span>
			<span class="text">
				<span class="name">${d.name}</span>
				${
					inProgress
						? html`<span
								class="bar ${progress === null ? "unknown" : ""} ${d.state}"
								role="progressbar"
								aria-label="${d.name} progress"
								aria-valuenow=${progress === null ? nothing : Math.round(progress * 100)}
								aria-valuemin="0"
								aria-valuemax="100"
							><span style="transform: scaleX(${progress ?? 0.3})"></span></span>`
						: nothing
				}
				<small>
					<span class=${d.state === "failed" ? "error" : ""}>${downloadStatus(d, Date.now())}</span>
					<span class="site">${hostOf(d.url)}</span>
				</small>
			</span>`;
		return html`<li class="download ${d.state}">
			${
				open
					? html`<button class="main" title="Open ${d.name}" @click=${() => this.act(d, "open")}>${text}</button>`
					: html`<div class="main">${text}</div>`
			}
			<span class="acts">
				${buttons.map(
					(action) => html`<button
						class="act ${action === "remove" ? "secondary" : ""}"
						aria-label="${DOWNLOAD_LABELS[action]} ${d.name}"
						title=${DOWNLOAD_LABELS[action]}
						@click=${() => this.act(d, action)}
					>
						${DOWNLOAD_ICONS[action]}
					</button>`,
				)}
			</span>
		</li>`;
	}

	private body(list: NativeDownload[]): TemplateResult {
		if (!list.length) {
			return html`<div class="empty">
				<p><b>No downloads yet</b>Files you download show up here, newest first.</p>
			</div>`;
		}
		const days = downloadDays(list, this.query, Date.now());
		if (!days.length) {
			return html`<div class="empty">
				<p><b>No download matches “${this.query.trim()}”</b>Try part of the file's name or the site it came from.</p>
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
						(r) => r.download.id,
						(r) => this.row(r),
					)}
				</ul>
			</section>`,
		)}`;
	}

	override render() {
		const list = this.downloads;
		const ended = (list ?? []).some((d) => d.state !== "running" && d.state !== "paused");
		return html`<div class="scroller">
			<div class="layout">
				<aside class="rail card">
					<slot name="nav"></slot>
					<h1>Downloads</h1>
					<label class="search">
						<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
						<input
							type="search"
							placeholder="Search downloads"
							aria-label="Search downloads"
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
						ended
							? html`<div class="clear-wrap">
									<button class="quiet" title="Files stay where they are" @click=${() => this.clearList()}>
										<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
										Clear the list
									</button>
								</div>`
							: nothing
					}
				</aside>
				<main class="list card">
					${
						list
							? this.body(list)
							: html`<ul class="skeleton" aria-label="Loading downloads">
									<li class="heading"><b style="width: 52px"></b></li>
									${[54, 38, 62].map((w) => html`<li><i></i><b class="fav"></b><b style="width: ${w}%"></b></li>`)}
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
				grid-template-areas: "nav" "title" "search" "clear";
			}
			/* No pick boxes here, so a day's name lines up with the file tiles. */
			.day h2 {
				padding-left: 0;
			}
			.download {
				display: flex;
				align-items: center;
				border-radius: 11px;
			}
			.download:hover {
				background: var(--loka-hover);
			}
			.download:has(button.main:active) {
				background: var(--wash-press);
			}
			.main {
				flex: 1;
				min-width: 0;
				display: flex;
				align-items: center;
				gap: 12px;
				padding: 8px 6px 8px 10px;
				border-radius: 11px;
				text-align: left;
			}
			.file {
				flex: none;
				display: grid;
				place-items: center;
				width: 30px;
				height: 36px;
				border-radius: 6px;
				background: hsl(var(--f) 45% 30%);
				color: hsl(var(--f) 80% 90%);
				font-size: 10px;
				font-weight: 700;
			}
			/* A file that didn't arrive loses its color, not its legibility. */
			.cancelled .file,
			.failed .file {
				filter: grayscale(1);
			}
			.text {
				flex: 1;
				display: grid;
				gap: 3px;
				min-width: 0;
			}
			.name {
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}
			.cancelled .name {
				color: var(--loka-ink-2);
				text-decoration: line-through;
				text-decoration-color: var(--loka-ink-3);
			}
			small {
				display: flex;
				gap: 10px;
				min-width: 0;
				color: var(--loka-ink-2);
				font-size: 13px;
				font-variant-numeric: tabular-nums;
			}
			.site {
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
				color: var(--loka-ink-3);
			}
			.error {
				color: var(--loka-danger);
			}
			/* The bar fills by scaling, so progress never relays out the row. */
			.bar {
				display: block;
				height: 4px;
				max-width: 420px;
				border-radius: 2px;
				background: var(--loka-line);
				overflow: hidden;
			}
			.bar span {
				display: block;
				height: 100%;
				border-radius: inherit;
				background: var(--loka-accent);
				transform-origin: left;
			}
			.bar.paused span {
				background: var(--loka-ink-3);
			}
			.acts {
				display: flex;
				flex: none;
				gap: 2px;
				padding-right: 6px;
			}
			.act {
				display: grid;
				place-items: center;
				width: 34px;
				height: 34px;
				border-radius: 8px;
				color: var(--loka-ink-2);
			}
			.act:hover {
				background: var(--wash);
				color: var(--loka-ink);
			}
			.act:active {
				background: var(--wash-press);
			}
			/* Remove is there when you look for it, not before. */
			.act.secondary {
				opacity: 0;
			}
			.download:hover .act.secondary,
			.act.secondary:focus-visible {
				opacity: 1;
			}
			svg .fill {
				fill: currentColor;
			}
			@container (width < 820px) {
				.rail {
					grid-template-areas: "nav nav" "title clear" "search search";
				}
			}
			@media (prefers-reduced-motion: no-preference) {
				.bar span {
					transition: transform 450ms linear;
				}
				/* Size unknown: a short bar sweeps across instead. */
				.bar.unknown.running span {
					animation: sweep 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
					animation-play-state: var(--loka-play, running);
				}
				@keyframes sweep {
					from {
						translate: -100% 0;
					}
					to {
						translate: 340% 0;
					}
				}
			}
		`,
	];
}

customElements.define("loka-library-downloads", LokaLibraryDownloads);
