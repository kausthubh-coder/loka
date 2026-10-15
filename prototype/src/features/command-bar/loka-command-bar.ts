import { css, html, LitElement, type TemplateResult } from "lit";
import type { Update } from "../../app/loka-app";
import { faviconBackground, faviconInner, hostOf, type LiveTabs } from "../sidebar/favicon";
import { planet } from "../sidebar/planet";
import { activateTab, type BrowserState, openTab, switchSpace } from "../sidebar/sidebar.logic";
import { playCue } from "../sound/sound";
import { type CommandResult, commandResults, isSearch } from "./command-bar.logic";

/** The Ctrl+K bar: open an address or search, jump to any tab in any space, or run a command. */
export class LokaCommandBar extends LitElement {
	static override properties = {
		state: { attribute: false },
		apply: { attribute: false },
		go: { attribute: false },
		live: { attribute: false },
		query: { state: true },
		selected: { state: true },
	};

	declare state: BrowserState;
	declare apply: Update;
	/**
	 * Set in the real browser, which opens addresses and searches itself (with the user's own search engine, and in
	 * the same tab on the new tab page). Without it the bar opens a new Loka tab.
	 */
	declare go: ((open: { url: string; query: string; search: boolean }) => void) | undefined;
	/** What the browser says about each loaded tab, for their pages' own icons. */
	live: LiveTabs = {};
	query = "";
	selected = 0;

	private close() {
		this.dispatchEvent(new CustomEvent("loka-close", { bubbles: true, composed: true }));
	}

	private run(result: CommandResult | undefined) {
		if (!result) return;
		if (result.kind === "go") {
			const search = isSearch(result.url);
			playCue("tab-open");
			if (this.go) this.go({ url: result.url, query: this.query.trim(), search });
			else this.apply((s) => openTab(s, result.url, search ? this.query.trim() : hostOf(result.url)));
		} else if (result.kind === "tab") {
			if (result.spaceId !== this.state.activeSpaceId) playCue("space");
			this.apply((s) => activateTab(switchSpace(s, result.spaceId), result.tabId));
		} else {
			this.dispatchEvent(new CustomEvent("loka-action", { detail: result.action, bubbles: true, composed: true }));
		}
		this.close();
	}

	private onKey(e: KeyboardEvent, results: CommandResult[]) {
		if (e.key === "Escape") this.close();
		else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const step = e.key === "ArrowDown" ? 1 : -1;
			this.selected = (this.selected + step + results.length) % Math.max(results.length, 1);
		} else if (e.key === "Enter") {
			e.preventDefault();
			this.run(results[this.selected]);
		}
	}

	protected override firstUpdated() {
		this.renderRoot.querySelector("input")?.focus();
	}

	private icon(result: CommandResult): TemplateResult {
		if (result.kind === "tab") {
			const url = this.state.tabs[result.tabId]?.url ?? "";
			const live = this.live[result.tabId];
			return html`<span class="fav" style="--fav: ${faviconBackground(url, live)}">${faviconInner(url, live)}</span>`;
		}
		if (result.kind === "go") {
			return isSearch(result.url)
				? html`<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>`
				: html`<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></svg>`;
		}
		return html`<svg viewBox="0 0 16 16"><path d="M5 3.5 9.5 8 5 12.5M10 12.5h3" /></svg>`;
	}

	override render() {
		const results = commandResults(this.state, this.query);
		const selected = Math.min(this.selected, results.length - 1);
		let lastGroup = "";
		return html`
			<div class="scrim" @click=${() => this.close()}></div>
			<div class="panel" role="dialog" aria-label="Command bar">
				<div class="input">
					<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
					<input
						placeholder="Search, enter an address, or find a tab"
						aria-label="Search or enter address"
						role="combobox"
						aria-expanded="true"
						aria-controls="results"
						aria-activedescendant="result-${selected}"
						.value=${this.query}
						@input=${(e: Event) => {
							this.query = (e.target as HTMLInputElement).value;
							this.selected = 0;
						}}
						@keydown=${(e: KeyboardEvent) => this.onKey(e, results)}
					/>
					<kbd>Esc</kbd>
				</div>
				<div class="results" id="results" role="listbox" aria-label="Results">
					${results.map((r, i) => {
						const group = r.kind === "tab" ? "Tabs" : r.kind === "action" ? "Commands" : "";
						const heading =
							group && group !== lastGroup ? html`<p class="group" role="presentation">${group}</p>` : null;
						lastGroup = group || lastGroup;
						const space = r.kind === "tab" ? this.state.spaces.find((s) => s.id === r.spaceId) : null;
						return html`${heading}
							<div
								class="result ${i === selected ? "on" : ""}"
								id="result-${i}"
								role="option"
								aria-selected=${i === selected}
								@mousemove=${() => {
									if (this.selected !== i) this.selected = i;
								}}
								@click=${() => this.run(r)}
							>
								<span class="icon" aria-hidden="true">${this.icon(r)}</span>
								<span class="label">${r.label}</span>
								<span class="detail">
									${space ? html`${planet(space.planet, space.hue, 14)}` : null}${r.detail}
								</span>
								${i === selected ? html`<kbd>Enter</kbd>` : null}
							</div>`;
					})}
				</div>
			</div>
		`;
	}

	static override styles = css`
		:host {
			position: absolute;
			inset: 0;
			z-index: 20;
			display: grid;
			justify-items: center;
			align-content: start;
			padding-top: 14vh;
			font: 14px/1.4 system-ui, "Segoe UI", sans-serif;
			color: #ececf1;
		}
		.scrim {
			position: absolute;
			inset: 0;
			background: #0007;
		}
		.panel {
			position: relative;
			width: min(640px, 84vw);
			border-radius: 16px;
			background: hsl(var(--hue) 22% 12% / 0.97);
			box-shadow:
				0 0 0 1px hsl(var(--hue) 50% 80% / 0.16),
				0 28px 72px #000b;
			overflow: hidden;
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
		.input {
			display: flex;
			align-items: center;
			gap: 12px;
			height: 58px;
			padding: 0 16px 0 20px;
			color: #a7a8b4;
			border-bottom: 1px solid hsl(var(--hue) 30% 85% / 0.1);
		}
		input {
			flex: 1;
			height: 100%;
			font: inherit;
			font-size: 17px;
			color: #ececf1;
			border: 0;
			outline: none;
			background: none;
		}
		input::placeholder {
			color: #9a9cab;
		}
		kbd {
			font: 11px system-ui;
			color: #a7a8b4;
			padding: 2px 6px;
			border-radius: 5px;
			background: hsl(var(--hue) 30% 85% / 0.09);
		}
		.results {
			max-height: 52vh;
			overflow-y: auto;
			padding: 6px;
		}
		.group {
			margin: 8px 12px 4px;
			font-size: 12px;
			color: #9a9cab;
		}
		.result {
			display: flex;
			align-items: center;
			gap: 12px;
			height: 42px;
			padding: 0 12px;
			border-radius: 10px;
		}
		.result.on {
			background: hsl(var(--hue) 45% 85% / 0.12);
		}
		.icon {
			display: grid;
			place-items: center;
			width: 22px;
			color: #b9bbc8;
		}
		.fav {
			display: grid;
			place-items: center;
			width: 20px;
			height: 20px;
			border-radius: 6px;
			background: var(--fav);
			color: #0b0c10;
			font-size: 11px;
			font-weight: 700;
		}
		.label {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		.detail {
			display: flex;
			align-items: center;
			gap: 6px;
			max-width: 40%;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			font-size: 13px;
			color: #9a9cab;
		}
	`;
}

customElements.define("loka-command-bar", LokaCommandBar);
