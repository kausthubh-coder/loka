import { css, html, LitElement } from "lit";
import type { Update } from "../../app/loka-app";
import { faviconBackground, faviconInner } from "../sidebar/favicon";
import { planet } from "../sidebar/planet";
import { type BrowserState, revealTab, searchSidebar } from "../sidebar/sidebar.logic";

/**
 * Search across the sidebar (Ctrl+Shift+F): every pinned, open and Essential tab in every space, with where it sits.
 * Choosing one goes there, opening the folders above it. Sends `loka-close-panel` when done.
 */
export class LokaSidebarSearch extends LitElement {
	static override properties = {
		state: { attribute: false },
		apply: { attribute: false },
		query: { state: true },
		selected: { state: true },
	};

	declare state: BrowserState;
	declare apply: Update;
	query = "";
	selected = 0;

	private done() {
		this.dispatchEvent(new CustomEvent("loka-close-panel", { bubbles: true, composed: true }));
	}

	private go(tabId: string | undefined) {
		if (!tabId) return;
		this.apply((s) => revealTab(s, tabId));
		this.done();
	}

	protected override firstUpdated() {
		this.renderRoot.querySelector("input")?.focus();
	}

	override render() {
		const matches = searchSidebar(this.state, this.query);
		const selected = Math.min(this.selected, matches.length - 1);
		return html`
			<input
				type="search"
				placeholder="Search tabs in every space"
				aria-label="Search the sidebar"
				role="combobox"
				aria-expanded="true"
				aria-controls="matches"
				aria-activedescendant=${matches.length ? `match-${selected}` : ""}
				@input=${(e: Event) => {
					this.query = (e.target as HTMLInputElement).value;
					this.selected = 0;
				}}
				@keydown=${(e: KeyboardEvent) => {
					if (e.key === "Escape") this.done();
					else if (e.key === "Enter") this.go(matches[selected]?.tabId);
					else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
						e.preventDefault();
						const step = e.key === "ArrowDown" ? 1 : -1;
						this.selected = (selected + step + matches.length) % Math.max(matches.length, 1);
					}
				}}
			/>
			<div id="matches" role="listbox" aria-label="Matching tabs">
				${matches.map((m, i) => {
					const tab = this.state.tabs[m.tabId];
					const space = this.state.spaces.find((s) => s.id === m.spaceId);
					if (!tab || !space) return null;
					const where = m.path[0] === "Essentials" ? "Essentials" : [space.name, ...m.path].join(" › ");
					return html`<div
						class="match ${i === selected ? "on" : ""}"
						id="match-${i}"
						role="option"
						aria-selected=${i === selected}
						@mousemove=${() => {
							if (this.selected !== i) this.selected = i;
						}}
						@click=${() => this.go(m.tabId)}
					>
						<span class="fav" aria-hidden="true" style="--fav: ${faviconBackground(tab.url)}">${faviconInner(tab.url)}</span>
						<span class="text">
							<span class="title">${tab.title}</span>
							<small>${m.path[0] === "Essentials" ? null : planet(space.planet, space.hue, 12)}${where}</small>
						</span>
					</div>`;
				})}
			</div>
			${this.query.trim() && matches.length === 0 ? html`<p class="empty">No tab matches "${this.query.trim()}".</p>` : null}
		`;
	}

	static override styles = css`
		:host {
			display: block;
			font: 14px/1.4 system-ui, "Segoe UI", sans-serif;
			/* Pressed is a deeper hover in both themes. --loka-fill-hover lightens, which vanishes on a light panel. */
			--press: color-mix(in srgb, var(--loka-ink) 12%, transparent);
		}
		input {
			width: 100%;
			box-sizing: border-box;
			height: 38px;
			padding: 0 12px;
			font: inherit;
			color: inherit;
			border: 0;
			border-radius: 9px;
			background: var(--loka-fill);
			box-shadow: inset 0 0 0 1px var(--loka-line);
			outline: none;
		}
		input::placeholder {
			color: var(--loka-ink-3);
		}
		input:focus {
			box-shadow: inset 0 0 0 1.5px var(--loka-accent);
		}
		#matches {
			margin-top: 6px;
		}
		/* The pointer moves the highlight (mousemove selects), so hover and the arrow keys light the same row. */
		.match {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 7px 8px;
			border-radius: 8px;
		}
		.match.on {
			background: var(--loka-hover);
		}
		.match:active {
			background: var(--press);
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
			display: flex;
			align-items: center;
			gap: 5px;
			color: var(--loka-ink-2);
			font-size: 12px;
		}
		.empty {
			margin: 8px;
			color: var(--loka-ink-2);
			font-size: 13px;
		}
		@media (prefers-reduced-motion: no-preference) {
			.match {
				transition: background-color 120ms;
			}
		}
	`;
}

customElements.define("loka-sidebar-search", LokaSidebarSearch);
