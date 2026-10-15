import { css, html, LitElement } from "lit";
import type { Update } from "../../app/loka-app";
import { faviconColor, faviconLetter, hostOf } from "../sidebar/favicon";
import { type BrowserState, restoreArchived } from "../sidebar/sidebar.logic";
import { timeAgo } from "./archive.logic";

/** The sidebar's Archived tabs panel: search what the archive took, click one to bring it back. */
export class LokaArchivePanel extends LitElement {
	static override properties = {
		state: { attribute: false },
		apply: { attribute: false },
		query: { state: true },
	};

	declare state: BrowserState;
	declare apply: Update;
	query = "";

	private action(action: string) {
		this.dispatchEvent(new CustomEvent("loka-action", { detail: action, bubbles: true, composed: true }));
	}

	protected override firstUpdated() {
		this.renderRoot.querySelector("input")?.focus();
	}

	override render() {
		const now = Date.now();
		const q = this.query.trim().toLowerCase();
		const shown = this.state.archive.filter(
			(a) => !q || a.tab.title.toLowerCase().includes(q) || a.tab.url.toLowerCase().includes(q),
		);
		const spaceName = (id: string) => this.state.spaces.find((s) => s.id === id)?.name ?? "a deleted space";
		return html`
			<header>
				<b>Archived tabs</b>
				${
					this.state.archive.length
						? html`<button class="quiet" @click=${() => this.apply((s) => ({ ...s, archive: [] }))}>Clear</button>`
						: null
				}
			</header>
			${
				this.state.archive.length
					? html`<input
							type="search"
							placeholder="Search archived tabs"
							aria-label="Search archived tabs"
							@input=${(e: Event) => {
								this.query = (e.target as HTMLInputElement).value;
							}}
						/>`
					: null
			}
			<ul>
				${shown.map(
					(a) => html`<li>
						<button
							class="row"
							title="Bring back ${a.tab.title}"
							@click=${() => this.apply((s) => restoreArchived(s, a.tab.id))}
						>
							<span class="fav" aria-hidden="true" style="--fav: ${faviconColor(a.tab.url)}">${faviconLetter(a.tab.url)}</span>
							<span class="text">
								<span class="title">${a.tab.title}</span>
								<small>${hostOf(a.tab.url)}, ${spaceName(a.spaceId)}, ${timeAgo(a.archivedAt, now)}</small>
							</span>
						</button>
					</li>`,
				)}
			</ul>
			${
				this.state.archive.length === 0
					? html`<p class="empty">
							Nothing archived. Open tabs you haven't looked at in a while can move here by themselves.
							<button class="link" @click=${() => this.action("settings")}>Turn it on in Settings</button>
						</p>`
					: shown.length === 0
						? html`<p class="empty">No archived tab matches.</p>`
						: null
			}
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
		.quiet:hover {
			color: #fff;
			background: hsl(var(--hue) 30% 80% / 0.1);
		}
		input {
			width: 100%;
			box-sizing: border-box;
			height: 34px;
			margin-bottom: 6px;
			padding: 0 10px;
			font: inherit;
			color: inherit;
			border: 0;
			border-radius: 8px;
			background: hsl(var(--hue) 30% 85% / 0.08);
			outline: none;
		}
		input:focus {
			box-shadow: inset 0 0 0 1.5px hsl(var(--hue) 85% 72%);
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		.row {
			display: flex;
			align-items: center;
			gap: 10px;
			width: 100%;
			padding: 7px 8px;
			border-radius: 8px;
			text-align: left;
		}
		.row:hover {
			background: hsl(var(--hue) 30% 80% / 0.1);
		}
		.fav {
			flex: none;
			display: grid;
			place-items: center;
			width: 20px;
			height: 20px;
			border-radius: 5px;
			background: var(--fav);
			color: #0b0c10;
			font-size: 11px;
			font-weight: 700;
		}
		.text {
			display: grid;
			min-width: 0;
		}
		.title,
		small {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		small {
			color: #a7a8b4;
			font-size: 12px;
		}
		.empty {
			margin: 4px 8px 8px;
			color: #b4b6c2;
			font-size: 13px;
		}
		.link {
			display: block;
			margin-top: 8px;
			padding: 0;
			color: hsl(var(--hue) 85% 76%);
		}
		:focus-visible {
			outline: 2px solid hsl(var(--hue) 85% 72%);
			outline-offset: -2px;
			border-radius: 8px;
		}
	`;
}

customElements.define("loka-archive-panel", LokaArchivePanel);
