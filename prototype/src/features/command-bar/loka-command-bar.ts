import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import type { Browser, CommandPick, NativeSuggestion } from "../../../../webui/src/bridge";
import { leave } from "../../app/theme";
import { faviconBackground, faviconInner, hostOf, type LiveTabs } from "../sidebar/favicon";
import { planet } from "../sidebar/planet";
import type { BrowserState, TabId } from "../sidebar/sidebar.logic";
import { playCue } from "../sound/sound";
import { type CommandMode, type CommandResult, commandResults } from "./command-bar.logic";

/**
 * The command bar: open an address or search, jump to any tab in any space, switch space, or run a command. Results
 * stream in from the browser's own autocomplete as you type. It doesn't act itself: it sends `loka-pick` with a
 * CommandPick (the same shape the full-window bar hands the sidebar through the browser) and `loka-close`.
 *
 * `layout` is "embedded" inside a window (with a scrim behind it) or "page" when it's the whole page, as in the
 * browser's centered overlay (command.html), where everything outside the bar is transparent.
 */
export class LokaCommandBar extends LitElement {
	static override properties = {
		state: { attribute: false },
		live: { attribute: false },
		browser: { attribute: false },
		links: { attribute: false },
		pinned: { attribute: false },
		mode: {},
		layout: { reflect: true },
		initialQuery: { attribute: false },
		query: { state: true },
		selected: { state: true },
		suggestions: { state: true },
	};

	declare state: BrowserState;
	/** What the browser says about each loaded tab, for their pages' own icons. */
	live: LiveTabs = {};
	/** The browser's autocomplete. Without one (a test page) the bar offers only Loka's own results. */
	browser: Browser | null = null;
	links: Record<TabId, number> = {};
	pinned = true;
	mode: CommandMode = "new-tab";
	layout: "embedded" | "page" = "embedded";
	/** Filled in and selected when the bar opens: the current address, for Ctrl+L. */
	initialQuery = "";
	query = "";
	selected = 0;
	suggestions: { for: string; list: NativeSuggestion[] } = { for: "", list: [] };
	private stopSuggestions = () => {};

	override connectedCallback() {
		super.connectedCallback();
		this.query = this.initialQuery;
		this.stopSuggestions =
			this.browser?.onSuggestions((query, list) => {
				this.suggestions = { for: query, list };
			}) ?? (() => {});
		if (this.query.trim()) this.browser?.suggest(this.query);
	}

	override disconnectedCallback() {
		this.stopSuggestions();
		super.disconnectedCallback();
	}

	private async close() {
		await leave(this.renderRoot.querySelector(".panel"), 100);
		this.dispatchEvent(new CustomEvent("loka-close", { bubbles: true, composed: true }));
	}

	private pick(result: CommandResult | undefined) {
		if (!result) return;
		let pick: CommandPick;
		if (result.kind === "go") {
			playCue("tab-open");
			pick = { kind: "open", url: result.url, newTab: this.mode === "new-tab", search: result.search };
		} else if (result.kind === "tab") {
			if (result.spaceId !== this.state.activeSpaceId) playCue("space");
			pick = { kind: "tab", tabId: result.tabId, spaceId: result.spaceId };
		} else if (result.kind === "browser-tab") {
			pick = { kind: "browser-tab", tabId: result.tabId };
		} else if (result.kind === "space") {
			playCue("space");
			pick = { kind: "space", spaceId: result.spaceId };
		} else {
			pick = { kind: "action", action: result.action };
		}
		this.dispatchEvent(new CustomEvent("loka-pick", { detail: pick, bubbles: true, composed: true }));
		this.dispatchEvent(new CustomEvent("loka-close", { bubbles: true, composed: true }));
	}

	private onKey(e: KeyboardEvent, results: CommandResult[]) {
		if (e.key === "Escape") {
			e.stopPropagation();
			void this.close();
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const step = e.key === "ArrowDown" ? 1 : -1;
			this.selected = (this.selected + step + results.length) % Math.max(results.length, 1);
		} else if (e.key === "Enter") {
			e.preventDefault();
			this.pick(results[this.selected]);
		}
	}

	private onInput(value: string) {
		this.query = value;
		this.selected = 0;
		if (value.trim()) this.browser?.suggest(value);
	}

	protected override firstUpdated() {
		const input = this.renderRoot.querySelector("input");
		input?.focus();
		input?.select();
	}

	protected override updated(changed: Map<string, unknown>) {
		if (changed.has("selected")) {
			this.renderRoot.querySelector(".result.on")?.scrollIntoView({ block: "nearest" });
		}
	}

	private icon(result: CommandResult): TemplateResult {
		if (result.kind === "tab" || result.kind === "browser-tab") {
			const url = result.kind === "tab" ? (this.state.tabs[result.tabId]?.url ?? "") : result.url;
			const live = result.kind === "tab" ? this.live[result.tabId] : undefined;
			return html`<span class="fav" style="--fav: ${faviconBackground(url, live)}">${faviconInner(url, live)}</span>`;
		}
		if (result.kind === "space") {
			const space = this.state.spaces.find((s) => s.id === result.spaceId);
			return space ? planet(space.planet, space.hue, 20) : html``;
		}
		if (result.kind === "go") {
			if (result.icon === "search")
				return html`<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>`;
			if (result.icon === "history")
				return html`<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" /></svg>`;
			if (result.icon === "bookmark")
				return html`<svg viewBox="0 0 16 16"><path d="M4.5 2.5h7v11L8 11l-3.5 2.5z" /></svg>`;
			return html`<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></svg>`;
		}
		return html`<svg viewBox="0 0 16 16"><path d="M5 3.5 9.5 8 5 12.5M10 12.5h3" /></svg>`;
	}

	override render() {
		// Ctrl+L starts with the address on screen: until it's edited, Enter goes there again and the list below is
		// the same as an empty bar's.
		const untouched = this.initialQuery !== "" && this.query === this.initialQuery;
		const results = commandResults(this.state, untouched ? "" : this.query, {
			suggestions: this.suggestions.list,
			suggestionsFor: this.suggestions.for,
			links: this.links,
			pinned: this.pinned,
		});
		if (untouched) {
			const url = this.initialQuery;
			results.unshift({ kind: "go", url, icon: "globe", label: `Open ${hostOf(url)}`, detail: url, group: "" });
		}
		const selected = Math.min(this.selected, results.length - 1);
		let lastGroup = "";
		return html`
			<div class="scrim" @click=${() => void this.close()}></div>
			<div class="panel" role="dialog" aria-label="Command bar">
				<div class="input">
					<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
					<input
						placeholder=${this.mode === "focus-location" ? "Go to an address or search" : "Search, enter an address, or find a tab"}
						aria-label="Search or enter address"
						role="combobox"
						aria-expanded="true"
						aria-controls="results"
						aria-activedescendant="result-${selected}"
						autocomplete="off"
						spellcheck="false"
						.value=${this.query}
						@input=${(e: Event) => this.onInput((e.target as HTMLInputElement).value)}
						@keydown=${(e: KeyboardEvent) => this.onKey(e, results)}
					/>
					<span class="mode" title=${this.mode === "focus-location" ? "Addresses open in this tab" : "Addresses open in a new tab"}>
						${this.mode === "focus-location" ? "This tab" : "New tab"}
					</span>
				</div>
				<div class="results" id="results" role="listbox" aria-label="Results">
					${results.map((r, i) => {
						const heading =
							r.group && r.group !== lastGroup ? html`<p class="group" role="presentation">${r.group}</p>` : nothing;
						lastGroup = r.group || lastGroup;
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
								@click=${() => this.pick(r)}
							>
								<span class="icon" aria-hidden="true">${this.icon(r)}</span>
								<span class="label">${r.label}</span>
								<span class="detail">
									${space ? html`${planet(space.planet, space.hue, 14)}` : nothing}${r.kind === "go" && r.group ? hostOf(r.url) : r.detail}
								</span>
								${i === selected ? html`<kbd>Enter</kbd>` : nothing}
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
			color: var(--loka-ink);
		}
		/* The whole page in the browser's floating window (about 680x520, transparent): the bar fills its width with
		   room for its shadow, and the list fills what's left of its height. */
		:host([layout="page"]) {
			position: fixed;
			padding-top: 14px;
		}
		:host([layout="page"]) .scrim {
			background: transparent;
		}
		.scrim {
			position: absolute;
			inset: 0;
			background: var(--loka-scrim);
		}
		.panel {
			position: relative;
			width: min(640px, calc(100% - 24px));
			border-radius: 16px;
			background: var(--loka-dialog);
			box-shadow: var(--loka-dialog-edge);
			overflow: hidden;
		}
		:host([layout="page"]) .panel {
			width: calc(100% - 40px);
			box-shadow:
				0 0 0 1px var(--loka-line),
				0 10px 28px rgb(0 0 0 / 0.32);
		}
		:host([layout="page"]) .results {
			max-height: calc(100vh - 56px - 48px);
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
			height: 56px;
			padding: 0 14px 0 18px;
			color: var(--loka-ink-2);
			border-bottom: 1px solid var(--loka-line);
		}
		input {
			flex: 1;
			min-width: 0;
			height: 100%;
			font: inherit;
			font-size: 17px;
			color: var(--loka-ink);
			border: 0;
			outline: none;
			background: none;
		}
		input::placeholder {
			color: var(--loka-ink-3);
		}
		input::selection {
			background: color-mix(in srgb, var(--loka-accent) 35%, transparent);
		}
		.mode,
		kbd {
			flex: none;
			font: 11px system-ui, "Segoe UI", sans-serif;
			color: var(--loka-ink-2);
			padding: 3px 7px;
			border-radius: 6px;
			background: var(--loka-fill-hover);
		}
		.results {
			max-height: min(52vh, 460px);
			overflow-y: auto;
			padding: 6px;
			overscroll-behavior: contain;
		}
		.group {
			margin: 10px 12px 4px;
			font-size: 12px;
			color: var(--loka-ink-3);
		}
		.result {
			display: flex;
			align-items: center;
			gap: 12px;
			height: 42px;
			padding: 0 10px 0 12px;
			border-radius: 10px;
		}
		.result.on {
			background: var(--loka-selected);
			box-shadow: var(--loka-selected-edge);
		}
		.icon {
			display: grid;
			place-items: center;
			width: 22px;
			flex: none;
			color: var(--loka-ink-2);
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
			overflow: hidden;
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
			color: var(--loka-ink-3);
		}
		@media (max-width: 420px) {
			.detail {
				display: none;
			}
		}
		@media (prefers-reduced-motion: no-preference) {
			.scrim {
				transition: opacity 160ms ease-out;
				@starting-style {
					opacity: 0;
				}
			}
			/* Opens from just above, close to full size, so it reads from the first frame. */
			.panel {
				transition:
					opacity 160ms cubic-bezier(0.2, 0, 0, 1),
					transform 220ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
					transform: translateY(-6px) scale(0.98);
				}
			}
		}
		@media (prefers-reduced-motion: reduce) {
			.panel {
				transition: opacity 120ms ease-out;
				@starting-style {
					opacity: 0;
				}
			}
		}
	`;
}

customElements.define("loka-command-bar", LokaCommandBar);
