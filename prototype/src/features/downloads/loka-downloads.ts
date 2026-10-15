import { css, html, LitElement } from "lit";

export interface Download {
	id: string;
	name: string;
	size: string;
	when: string;
	status: "running" | "done" | "failed";
	progress: number;
}

/** Where the panel's downloads come from, and what its buttons do. */
export interface DownloadSource {
	list(): Download[];
	/** Calls back whenever the list changes; returns the function that stops it. */
	watch(changed: () => void): () => void;
	retry(id: string): void;
	cancel(id: string): void;
	show(id: string): void;
	clear(): void;
	openFolder(): void;
}

// Sample files: the prototype has no network, so this shows the states a real download goes through. Module state,
// so closing and reopening the panel doesn't reset them.
let samples: Download[] = [
	{
		id: "d1",
		name: "helium_0.19.2.1_x64-installer.exe",
		size: "148 MB",
		when: "now",
		status: "running",
		progress: 0.38,
	},
	{ id: "d2", name: "CSC281-GDD-v3.pdf", size: "2.1 MB", when: "10:42", status: "done", progress: 1 },
	{ id: "d3", name: "lofi-cover.png", size: "840 KB", when: "10:15", status: "failed", progress: 0.2 },
	{ id: "d4", name: "loka-spaces.json", size: "6 KB", when: "Yesterday", status: "done", progress: 1 },
];

const sampleSource: DownloadSource = {
	list: () => samples,
	watch(changed) {
		// Moves a running sample along so the progress can be seen working.
		const timer = window.setInterval(() => {
			if (!samples.some((d) => d.status === "running")) return;
			samples = samples.map((d) => {
				if (d.status !== "running") return d;
				const progress = Math.min(1, d.progress + 0.03);
				return { ...d, progress, status: progress >= 1 ? "done" : "running" };
			});
			changed();
		}, 400);
		return () => window.clearInterval(timer);
	},
	retry: (id) => {
		samples = samples.map((d) => (d.id === id ? { ...d, status: "running", progress: 0 } : d));
	},
	cancel: (id) => {
		samples = samples.map((d) => (d.id === id ? { ...d, status: "failed" } : d));
	},
	show: () => {},
	clear: () => {
		samples = samples.filter((d) => d.status === "running");
	},
	openFolder: () => {},
};

let source: DownloadSource = sampleSource;

/** The extension swaps in the browser's real downloads. */
export function setDownloadSource(next: DownloadSource) {
	source = next;
}

/** The sidebar's Downloads panel, opened from the toolbar like Extensions: recent files, progress, retry. */
export class LokaDownloads extends LitElement {
	static override properties = { items: { state: true } };

	items: Download[] = [];
	private unwatch = () => {};

	override connectedCallback() {
		super.connectedCallback();
		this.items = source.list();
		this.unwatch = source.watch(() => {
			this.items = source.list();
		});
	}

	override disconnectedCallback() {
		this.unwatch();
		super.disconnectedCallback();
	}

	/** Runs a button's action, then reads the list again so the change shows at once. */
	private act(run: () => void) {
		run();
		this.items = source.list();
	}

	override render() {
		return html`
			<header>
				<b>Downloads</b>
				<button class="quiet" @click=${() => this.act(() => source.clear())}>Clear</button>
			</header>
			<ul>
				${this.items.map((d) => {
					const ext = d.name.split(".").pop() ?? "";
					const hue = { exe: 200, pdf: 0, png: 150, json: 40 }[ext] ?? 220;
					return html`<li class=${d.status}>
						<span class="file" style="--f: ${hue}" aria-hidden="true">${ext.toUpperCase().slice(0, 4)}</span>
						<span class="text">
							<span class="name">${d.name}</span>
							${
								d.status === "running"
									? html`<span class="bar" role="progressbar" aria-label="${d.name} progress" aria-valuenow=${Math.round(d.progress * 100)}>
											<span style="width: ${d.progress * 100}%"></span>
										</span>`
									: null
							}
							<small class=${d.status === "failed" ? "error" : ""}>
								${
									d.status === "running"
										? `${Math.round(d.progress * 100)}% of ${d.size}`
										: d.status === "failed"
											? "Failed: network error"
											: `${d.size}, ${d.when}`
								}
							</small>
						</span>
						${
							d.status === "failed"
								? html`<button class="act" @click=${() => this.act(() => source.retry(d.id))}>Retry</button>`
								: d.status === "done"
									? html`<button class="act icon" aria-label="Show ${d.name} in folder" title="Show in folder" @click=${() => source.show(d.id)}>
											<svg viewBox="0 0 16 16"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" /></svg>
										</button>`
									: html`<button class="act icon" aria-label="Cancel ${d.name}" title="Cancel" @click=${() => this.act(() => source.cancel(d.id))}>
											<svg viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
										</button>`
						}
					</li>`;
				})}
			</ul>
			${this.items.length === 0 ? html`<p class="empty">No downloads yet.</p>` : null}
			<button class="all" @click=${() => source.openFolder()}>Open the Downloads folder</button>
		`;
	}

	static override styles = css`
		:host {
			display: block;
			color: #ececf1;
			font: 14px/1.4 system-ui, "Segoe UI", sans-serif;
		}
		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin: 4px 6px 8px;
		}
		button {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
		}
		.quiet {
			color: #a7a8b4;
			padding: 2px 6px;
			border-radius: 6px;
		}
		.quiet:hover,
		.act:hover,
		.all:hover {
			color: #fff;
			background: hsl(var(--hue) 30% 80% / 0.1);
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		li {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 7px 8px;
			border-radius: 8px;
		}
		li:hover {
			background: hsl(var(--hue) 30% 80% / 0.06);
		}
		.file {
			flex: none;
			display: grid;
			place-items: center;
			width: 28px;
			height: 34px;
			border-radius: 5px;
			background: hsl(var(--f) 45% 30%);
			color: hsl(var(--f) 80% 88%);
			font-size: 9px;
			font-weight: 700;
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
		small {
			color: #a7a8b4;
			font-size: 12px;
			font-variant-numeric: tabular-nums;
		}
		.error {
			color: #ff9b8f;
		}
		.bar {
			display: block;
			height: 3px;
			border-radius: 2px;
			background: hsl(var(--hue) 30% 85% / 0.14);
			overflow: hidden;
		}
		.bar span {
			display: block;
			height: 100%;
			background: hsl(var(--hue) 80% 68%);
		}
		.act {
			flex: none;
			height: 28px;
			padding: 0 8px;
			border-radius: 7px;
			color: #d6d7df;
		}
		.act.icon {
			display: grid;
			place-items: center;
			width: 28px;
			padding: 0;
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
		.all {
			width: 100%;
			margin-top: 6px;
			padding: 8px;
			border-radius: 8px;
			color: #a7a8b4;
			text-align: left;
		}
		.empty {
			margin: 8px;
			color: #b4b6c2;
			font-size: 13px;
		}
		@media (prefers-reduced-motion: no-preference) {
			.bar span {
				transition: width 400ms linear;
			}
		}
	`;
}

customElements.define("loka-downloads", LokaDownloads);
