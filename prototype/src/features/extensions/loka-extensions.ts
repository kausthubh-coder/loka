import { css, html, LitElement, nothing } from "lit";
import type { Browser, NativeExtension } from "../../../../webui/src/bridge";
import { badgeText } from "./extensions.logic";

const STORE_URL = "https://chromewebstore.google.com/";

/** An extension's icon with its badge, as its toolbar button draws it. Shared by the toolbar and the panel. */
export function extensionIcon(x: NativeExtension, size: number) {
	const badge = badgeText(x.badge);
	return html`<span class="ext-icon" style="--size: ${size}px" aria-hidden="true">
		${x.icon ? html`<img src=${x.icon} alt="" draggable="false" />` : html`<span class="letter">${x.name.slice(0, 1)}</span>`}
		${badge ? html`<b class="badge" style="--badge: ${x.badgeColor || "#5f6368"}">${badge}</b>` : nothing}
	</span>`;
}

export const extensionIconStyles = css`
	.ext-icon {
		position: relative;
		display: grid;
		place-items: center;
		width: var(--size);
		height: var(--size);
		flex: none;
	}
	.ext-icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.ext-icon .letter {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		border-radius: 25%;
		background: var(--loka-fill-hover);
		font-weight: 700;
		font-size: calc(var(--size) * 0.6);
	}
	/* Chrome's badge: bottom right, over the icon, white on the extension's own color. */
	.badge {
		position: absolute;
		right: -5px;
		bottom: -4px;
		min-width: 9px;
		height: 12px;
		padding: 0 2.5px;
		border-radius: 6px;
		background: var(--badge);
		color: #fff;
		font: 600 9px/12px system-ui, "Segoe UI", sans-serif;
		text-align: center;
		font-variant-numeric: tabular-nums;
		box-shadow: 0 0 0 1.5px var(--loka-surface);
	}
`;

/**
 * The sidebar's Extensions panel: every installed extension, click to run it (its popup opens beside the row), pin
 * it to the toolbar, or manage them in the browser. `extensions` is null until the browser has answered.
 */
export class LokaExtensions extends LitElement {
	static override properties = {
		extensions: { attribute: false },
		browser: { attribute: false },
		pin: { attribute: false },
	};

	declare extensions: NativeExtension[] | null;
	declare browser: Browser;
	/** Pins or unpins one; the sidebar shows the change at once and tells the browser. */
	declare pin: (id: string, pinned: boolean) => void;

	private run(e: Event, id: string) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		this.browser.runExtension(id, { x: r.x, y: r.y, width: r.width, height: r.height });
	}

	override render() {
		const list = this.extensions;
		return html`
			<header>
				<b>Extensions</b>
				<button class="quiet" @click=${() => this.browser.openPage("chrome://extensions/")}>Manage</button>
			</header>
			${
				list?.length === 0
					? html`<div class="empty">
							<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 2.5h3v2a1 1 0 0 0 2 0v-.5h2v3.5h-.5a1 1 0 0 0 0 2h.5v4h-4v-.5a1 1 0 0 0-2 0v.5h-5v-4h.5a1 1 0 0 0 0-2h-.5v-3.5h4z" /></svg>
							<p><b>No extensions yet</b>Add one from the Chrome Web Store, then pin it here to keep it one click away.</p>
							<button class="primary" @click=${() => void this.browser.createTab(STORE_URL, true)}>Get extensions</button>
						</div>`
					: html`<ul>
							${(list ?? []).map(
								(x) => html`<li>
									<button class="row" aria-label="Open ${x.name}" @click=${(e: Event) => this.run(e, x.id)}>
										${extensionIcon(x, 22)}
										<span class="name">${x.name}</span>
									</button>
									<button
										class="pin ${x.pinned ? "on" : ""}"
										aria-label="${x.pinned ? "Unpin" : "Pin"} ${x.name}"
										aria-pressed=${x.pinned}
										title=${x.pinned ? "Unpin from the toolbar" : "Pin to the toolbar"}
										@click=${() => this.pin(x.id, !x.pinned)}
									>
										<svg viewBox="0 0 16 16"><path d="M9.5 2.5 13.5 6.5 11 7.5 8.5 10l-.5 3L3 8l3-.5L8.5 5z" /><path d="M5.5 10.5 2.5 13.5" /></svg>
									</button>
								</li>`,
							)}
						</ul>`
			}
		`;
	}

	static override styles = [
		extensionIconStyles,
		css`
			:host {
				display: block;
				font: 14px/1.4 system-ui, "Segoe UI", sans-serif;
				/* Pressed is a deeper hover in both themes. --loka-fill-hover lightens, which vanishes on a light panel. */
			}
			header {
				display: flex;
				align-items: center;
				justify-content: space-between;
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
			.quiet:hover {
				color: var(--loka-ink);
				background: var(--loka-hover);
			}
			.quiet:active {
				background: var(--loka-pressed);
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
			/* The whole row is one pill: hover lights it, pressing its main button presses it. */
			li:hover {
				background: var(--loka-hover);
			}
			li:has(.row:active) {
				background: var(--loka-pressed);
			}
			.row {
				flex: 1;
				min-width: 0;
				display: flex;
				align-items: center;
				gap: 10px;
				height: 40px;
				padding: 0 8px;
				border-radius: 8px;
				text-align: left;
			}
			.name {
				flex: 1;
				min-width: 0;
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}
			.pin {
				display: grid;
				place-items: center;
				width: 32px;
				height: 32px;
				margin-right: 4px;
				border-radius: 7px;
				color: var(--loka-ink-3);
			}
			.pin:hover {
				background: var(--loka-hover);
				color: var(--loka-ink);
			}
			.pin:active {
				background: var(--loka-pressed);
			}
			.pin.on {
				color: var(--loka-accent-ink);
			}
			.pin.on svg {
				fill: currentColor;
				fill-opacity: 0.3;
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
			.empty {
				display: grid;
				justify-items: center;
				gap: 10px;
				padding: 14px 12px 10px;
				text-align: center;
				color: var(--loka-ink-2);
			}
			.empty svg {
				width: 28px;
				height: 28px;
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
			.primary {
				height: 32px;
				padding: 0 14px;
				border-radius: 8px;
				background: var(--loka-accent);
				color: var(--loka-on-accent);
				font-weight: 600;
				font-size: 13px;
			}
			.primary:hover {
				filter: brightness(1.06);
			}
			.primary:active {
				filter: brightness(0.94);
			}
			:focus-visible {
				outline: 2px solid var(--loka-accent);
				outline-offset: -2px;
			}
			@media (prefers-reduced-motion: no-preference) {
				li,
				.pin,
				.quiet {
					transition: background-color 120ms;
				}
			}
		`,
	];
}

customElements.define("loka-extensions", LokaExtensions);
