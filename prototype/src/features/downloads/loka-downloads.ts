import { css, html, LitElement } from "lit";

interface Download {
	id: string;
	name: string;
	size: string;
	when: "Today" | "Yesterday";
	status: "running" | "done" | "failed";
	progress: number;
}

// Sample files: the prototype has no network, so this page shows the states a real download goes through.
const SAMPLE: Download[] = [
	{
		id: "d1",
		name: "helium_0.19.2.1_x64-installer.exe",
		size: "148 MB",
		when: "Today",
		status: "running",
		progress: 0.38,
	},
	{ id: "d2", name: "CSC281-GDD-v3.pdf", size: "2.1 MB", when: "Today", status: "done", progress: 1 },
	{ id: "d3", name: "lofi-cover.png", size: "840 KB", when: "Today", status: "failed", progress: 0.2 },
	{ id: "d4", name: "loka-spaces.json", size: "6 KB", when: "Yesterday", status: "done", progress: 1 },
	{ id: "d5", name: "chromium-windows-build.md", size: "18 KB", when: "Yesterday", status: "done", progress: 1 },
];

/** loka://downloads: files grouped by day, with progress, a retry for failures, and open / show in folder. */
export class LokaDownloads extends LitElement {
	static override properties = {
		items: { state: true },
		filter: { state: true },
	};

	items = SAMPLE.map((d) => ({ ...d }));
	filter = "";
	private timer = 0;

	override connectedCallback() {
		super.connectedCallback();
		// Moves the running sample along so the progress bar can be seen working; stops when nothing is running.
		this.timer = window.setInterval(() => {
			if (!this.items.some((d) => d.status === "running")) return;
			this.items = this.items.map((d) =>
				d.status === "running"
					? { ...d, progress: Math.min(1, d.progress + 0.04), status: d.progress + 0.04 >= 1 ? "done" : "running" }
					: d,
			);
		}, 400);
	}

	override disconnectedCallback() {
		window.clearInterval(this.timer);
		super.disconnectedCallback();
	}

	private changeItem(id: string, change: Partial<Download>) {
		this.items = this.items.map((d) => (d.id === id ? { ...d, ...change } : d));
	}

	private icon(name: string) {
		const ext = name.split(".").pop() ?? "";
		const hue = { exe: 200, pdf: 0, png: 150, json: 40, md: 260 }[ext] ?? 220;
		return html`<span class="file" style="--f: ${hue}" aria-hidden="true">${ext.toUpperCase().slice(0, 4)}</span>`;
	}

	override render() {
		const shown = this.items.filter((d) => d.name.toLowerCase().includes(this.filter.toLowerCase()));
		const groups = (["Today", "Yesterday"] as const).map(
			(when) => [when, shown.filter((d) => d.when === when)] as const,
		);
		return html`
			<div class="page">
				<header>
					<h1>Downloads</h1>
					<input
						type="search"
						placeholder="Search downloads"
						aria-label="Search downloads"
						@input=${(e: Event) => {
							this.filter = (e.target as HTMLInputElement).value;
						}}
					/>
					<button class="quiet" @click=${() => (this.items = this.items.filter((d) => d.status === "running"))}>
						Clear all
					</button>
				</header>
				${groups.map(([when, list]) =>
					list.length
						? html`<h2>${when}</h2>
								<ul>
									${list.map(
										(d) => html`<li class=${d.status}>
											${this.icon(d.name)}
											<div class="info">
												<b>${d.name}</b>
												${
													d.status === "running"
														? html`<div class="bar" role="progressbar" aria-label="${d.name} progress" aria-valuenow=${Math.round(d.progress * 100)}>
																<span style="width: ${d.progress * 100}%"></span>
															</div>
															<small>${Math.round(d.progress * 100)}% of ${d.size}</small>`
														: d.status === "failed"
															? html`<small class="error">Failed: network error</small>`
															: html`<small>${d.size}</small>`
												}
											</div>
											<div class="actions">
												${
													d.status === "failed"
														? html`<button @click=${() => this.changeItem(d.id, { status: "running", progress: 0 })}>Retry</button>`
														: d.status === "done"
															? html`<button>Open</button><button>Show in folder</button>`
															: html`<button @click=${() => this.changeItem(d.id, { status: "failed" })}>Cancel</button>`
												}
												<button
													class="remove"
													aria-label="Remove ${d.name} from the list"
													@click=${() => (this.items = this.items.filter((x) => x.id !== d.id))}
												>
													<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
												</button>
											</div>
										</li>`,
									)}
								</ul>`
						: null,
				)}
				${shown.length === 0 ? html`<p class="empty">No downloads${this.filter ? " match" : " yet"}.</p>` : null}
			</div>
		`;
	}

	static override styles = css`
		:host {
			display: block;
			height: 100%;
			overflow-y: auto;
			color: #e6e7ee;
			font: 14px/1.45 system-ui, "Segoe UI", sans-serif;
		}
		.page {
			max-width: 680px;
			margin: 0 auto;
			padding: 48px 32px 80px;
		}
		header {
			display: flex;
			align-items: center;
			gap: 12px;
			margin-bottom: 20px;
		}
		h1 {
			flex: 1;
			margin: 0;
			font-size: 28px;
			font-weight: 650;
		}
		h2 {
			margin: 24px 0 6px;
			font-size: 13px;
			font-weight: 600;
			color: #a3a5b2;
		}
		input {
			width: 200px;
			height: 34px;
			padding: 0 12px;
			font: inherit;
			color: inherit;
			border: 0;
			border-radius: 9px;
			background: hsl(var(--hue) 30% 85% / 0.08);
			outline: none;
		}
		input:focus {
			box-shadow: inset 0 0 0 1.5px hsl(var(--hue) 85% 72%);
		}
		button {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
			height: 30px;
			padding: 0 10px;
			border-radius: 7px;
		}
		button:hover {
			background: hsl(var(--hue) 30% 85% / 0.1);
		}
		.quiet {
			color: #c2c4cf;
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		li {
			display: flex;
			align-items: center;
			gap: 14px;
			padding: 10px 8px;
			border-radius: 10px;
		}
		li:hover {
			background: hsl(var(--hue) 30% 85% / 0.05);
		}
		.file {
			display: grid;
			place-items: center;
			flex: none;
			width: 38px;
			height: 44px;
			border-radius: 6px;
			background: hsl(var(--f) 45% 30%);
			color: hsl(var(--f) 80% 88%);
			font-size: 10px;
			font-weight: 700;
		}
		.info {
			flex: 1;
			min-width: 0;
			display: grid;
			gap: 3px;
		}
		.info b {
			font-weight: 550;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		small {
			color: #a3a5b2;
			font-size: 13px;
			font-variant-numeric: tabular-nums;
		}
		.error {
			color: #ff9b8f;
		}
		.failed b {
			color: #b9bac4;
		}
		.bar {
			height: 4px;
			border-radius: 2px;
			background: hsl(var(--hue) 30% 85% / 0.12);
			overflow: hidden;
		}
		.bar span {
			display: block;
			height: 100%;
			border-radius: 2px;
			background: hsl(var(--hue) 80% 68%);
			transition: width 400ms linear;
		}
		.actions {
			display: flex;
			align-items: center;
			gap: 2px;
			color: #d6d7df;
		}
		.remove {
			display: grid;
			place-items: center;
			width: 30px;
			padding: 0;
			color: #a3a5b2;
		}
		svg {
			width: 14px;
			height: 14px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.5;
			stroke-linecap: round;
		}
		.empty {
			color: #a3a5b2;
		}
		:focus-visible {
			outline: 2px solid hsl(var(--hue) 85% 72%);
			outline-offset: 2px;
		}
	`;
}

customElements.define("loka-downloads", LokaDownloads);
