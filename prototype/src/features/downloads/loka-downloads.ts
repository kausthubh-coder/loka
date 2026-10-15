import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { Browser, NativeDownload } from "../../../../webui/src/bridge";
import {
	type DownloadAction,
	downloadActions,
	downloadProgress,
	downloadStatus,
	sortDownloads,
} from "./downloads.logic";

const ICONS: Record<DownloadAction, TemplateResult> = {
	pause: html`<svg viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9" /></svg>`,
	resume: html`<svg viewBox="0 0 16 16"><path class="fill" d="M5 3.5v9l7.5-4.5z" /></svg>`,
	cancel: html`<svg viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>`,
	retry: html`<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5" /></svg>`,
	show: html`<svg viewBox="0 0 16 16"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" /></svg>`,
	remove: html`<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>`,
	open: html``,
};

const LABELS: Record<DownloadAction, string> = {
	pause: "Pause",
	resume: "Resume",
	cancel: "Cancel",
	retry: "Try again",
	show: "Show in folder",
	remove: "Remove from list",
	open: "Open",
};

/** A file type's tile color, by extension, so a list of files can be told apart at a glance. */
function fileHue(name: string): number {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	const known: Record<string, number> = { exe: 205, msi: 205, pdf: 0, png: 150, jpg: 150, zip: 40, json: 45, mp4: 280 };
	if (ext in known) return known[ext] ?? 220;
	let hash = 0;
	for (const c of ext) hash = (hash * 31 + c.charCodeAt(0)) % 360;
	return hash;
}

/**
 * The sidebar's Downloads panel: newest first, with live progress and each state's actions (open a finished file,
 * show it in its folder, pause, resume, cancel, try again, remove). `downloads` is null until the browser answers.
 */
export class LokaDownloads extends LitElement {
	static override properties = {
		downloads: { attribute: false },
		browser: { attribute: false },
	};

	declare downloads: NativeDownload[] | null;
	declare browser: Browser;

	private act(id: number, action: DownloadAction) {
		this.browser.downloadAction(id, action);
	}

	private clear() {
		for (const d of this.downloads ?? []) {
			if (d.state !== "running" && d.state !== "paused") this.act(d.id, "remove");
		}
	}

	private row(d: NativeDownload, now: number): TemplateResult {
		const { open, buttons } = downloadActions(d);
		const progress = downloadProgress(d);
		const ext = d.name.includes(".") ? (d.name.split(".").pop() ?? "") : "";
		const inProgress = d.state === "running" || d.state === "paused";
		const text = html`<span class="file" style="--f: ${fileHue(d.name)}" aria-hidden="true">${ext.toUpperCase().slice(0, 4)}</span>
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
				<small class=${d.state === "failed" ? "error" : ""}>${downloadStatus(d, now)}</small>
			</span>`;
		return html`<li class=${d.state}>
			${
				open
					? html`<button class="main" title="Open ${d.name}" @click=${() => this.act(d.id, "open")}>${text}</button>`
					: html`<div class="main">${text}</div>`
			}
			<span class="acts">
				${buttons.map(
					(action) => html`<button
						class="act ${action === "remove" ? "secondary" : ""}"
						aria-label="${LABELS[action]} ${d.name}"
						title=${LABELS[action]}
						@click=${() => this.act(d.id, action)}
					>
						${ICONS[action]}
					</button>`,
				)}
			</span>
		</li>`;
	}

	override render() {
		const list = this.downloads === null ? null : sortDownloads(this.downloads);
		const now = Date.now();
		const finished = (list ?? []).some((d) => d.state !== "running" && d.state !== "paused");
		return html`
			<header>
				<b>Downloads</b>
				${finished ? html`<button class="quiet" @click=${() => this.clear()}>Clear</button>` : nothing}
			</header>
			${
				list?.length === 0
					? html`<div class="empty">
							<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
							<p><b>No downloads yet</b>Files you download show up here while they come in.</p>
						</div>`
					: html`<ul>${repeat(
							list ?? [],
							(d) => d.id,
							(d) => this.row(d, now),
						)}</ul>`
			}
			<button class="all" @click=${() => this.browser.openPage("chrome://downloads/")}>See all downloads</button>
		`;
	}

	static override styles = css`
		:host {
			display: block;
			font: 14px/1.4 system-ui, "Segoe UI", sans-serif;
		}
		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			min-height: 26px;
			margin: 2px 4px 6px 8px;
		}
		button {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
			padding: 0;
			cursor: default;
		}
		.quiet {
			position: relative;
			height: 28px;
			padding: 0 8px;
			border-radius: 7px;
			color: var(--loka-ink-2);
			font-size: 13px;
		}
		.quiet::after {
			content: "";
			position: absolute;
			inset: -2px 0;
		}
		.quiet:active,
		.act:active {
			background: var(--loka-fill-hover);
		}
		.quiet:hover,
		.all:hover {
			color: var(--loka-ink);
			background: var(--loka-hover);
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		li {
			display: flex;
			align-items: center;
			border-radius: 8px;
		}
		li:hover {
			background: var(--loka-hover);
		}
		.main {
			flex: 1;
			min-width: 0;
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 7px 4px 7px 8px;
			text-align: left;
			border-radius: 8px;
		}
		.file {
			flex: none;
			display: grid;
			place-items: center;
			width: 28px;
			height: 34px;
			border-radius: 5px;
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
			color: var(--loka-ink-2);
			font-size: 12px;
			font-variant-numeric: tabular-nums;
		}
		.error {
			color: var(--loka-danger);
		}
		/* The bar fills by scaling, so progress never relays out the row. */
		.bar {
			display: block;
			height: 3px;
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
			padding-right: 4px;
		}
		.act {
			display: grid;
			place-items: center;
			width: 32px;
			height: 32px;
			border-radius: 7px;
			color: var(--loka-ink-2);
		}
		.act:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		/* Remove is there when you look for it, not before. */
		.act.secondary {
			opacity: 0;
		}
		li:hover .act.secondary,
		.act.secondary:focus-visible {
			opacity: 1;
		}
		svg {
			width: 15px;
			height: 15px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.5;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		svg .fill {
			fill: currentColor;
		}
		.all {
			width: 100%;
			margin-top: 6px;
			padding: 8px;
			border-radius: 8px;
			color: var(--loka-ink-2);
			text-align: left;
		}
		.empty {
			display: grid;
			justify-items: center;
			gap: 8px;
			padding: 14px 12px 6px;
			text-align: center;
			color: var(--loka-ink-2);
		}
		.empty svg {
			width: 26px;
			height: 26px;
			stroke-width: 1.2;
			color: var(--loka-accent-ink);
		}
		.empty p {
			margin: 0;
			font-size: 13px;
			text-wrap: pretty;
		}
		.empty b {
			display: block;
			margin-bottom: 2px;
			color: var(--loka-ink);
			font-size: 14px;
		}
		:focus-visible {
			outline: 2px solid var(--loka-accent);
			outline-offset: -2px;
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
	`;
}

customElements.define("loka-downloads", LokaDownloads);
