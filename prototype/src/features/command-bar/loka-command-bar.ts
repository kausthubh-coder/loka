import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import type { Browser, CommandPick, NativeSuggestion } from "../../../../webui/src/bridge";
import { keys } from "../../app/platform";
import { leave } from "../../app/theme";
import { faviconBackground, faviconInner, hostOf, type LiveTabs } from "../sidebar/favicon";
import { planet } from "../sidebar/planet";
import type { BrowserState, TabId } from "../sidebar/sidebar.logic";
import { playCue } from "../sound/sound";
import {
	type CommandMode,
	type CommandResult,
	commandResults,
	continueAnswer,
	dotCom,
	inlineCompletion,
	keepAnswer,
	type SuggestionAnswer,
} from "./command-bar.logic";

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
		sound: { attribute: false },
		mode: {},
		layout: { reflect: true },
		initialQuery: { attribute: false },
		query: { state: true },
		selected: { state: true },
		suggestions: { state: true },
		inlineOff: { state: true },
	};

	declare state: BrowserState;
	/** What the browser says about each loaded tab, for their pages' own icons. */
	live: LiveTabs = {};
	/** The browser's autocomplete. Without one (a test page) the bar offers only Loka's own results. */
	browser: Browser | null = null;
	links: Record<TabId, number> = {};
	pinned = true;
	/** Whether interface sounds are on, for the mute command's wording. */
	sound = true;
	mode: CommandMode = "new-tab";
	layout: "embedded" | "page" = "embedded";
	/** Filled in and selected when the bar opens: the current address, for Ctrl+L. */
	initialQuery = "";
	/** What the person typed. The field shows it with the completion after it, selected. */
	query = "";
	selected = 0;
	suggestions: SuggestionAnswer = { for: "", list: [] };
	/** Set by a deletion, cleared by the next character typed: see ResultContext.inlineOff. */
	inlineOff = false;
	/** The completion the last render showed, which the next keystroke may continue. */
	private shownInline = "";
	private stopSuggestions = () => {};

	override connectedCallback() {
		super.connectedCallback();
		this.query = this.initialQuery;
		this.stopSuggestions =
			this.browser?.onSuggestions((query, list: NativeSuggestion[]) => {
				this.suggestions = keepAnswer(this.suggestions, { for: query, list }, this.query);
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

	/** Up, Down and Tab move through the results; Enter picks; Ctrl+Enter takes one word to its .com; Esc closes. */
	private onKey(e: KeyboardEvent, results: CommandResult[]) {
		if (e.key === "Escape") {
			e.stopPropagation();
			void this.close();
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab") {
			e.preventDefault();
			const step = e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey) ? -1 : 1;
			this.selected = (this.selected + step + results.length) % Math.max(results.length, 1);
		} else if (e.key === "Enter") {
			e.preventDefault();
			const com = (e.ctrlKey || e.metaKey) && dotCom(this.query);
			if (com) this.pick({ kind: "go", url: com, icon: "globe", label: com, detail: "", group: "" });
			else this.pick(results[this.selected]);
		}
	}

	/**
	 * Typing over the selected completion replaces it, so the field's text is what was typed. A deletion turns
	 * completing off until the next character; a character that continues the completion keeps it right away.
	 */
	private onInput(e: InputEvent) {
		const input = e.target as HTMLInputElement;
		const value = input.value;
		// Typing in the middle of the text isn't the start of an address either, as in Chrome's address bar.
		const stopCompleting = e.inputType.startsWith("delete") || input.selectionEnd !== value.length;
		const continued = !stopCompleting && this.shownInline ? continueAnswer(this.suggestions, value) : null;
		if (continued) this.suggestions = continued;
		this.inlineOff = stopCompleting;
		this.query = value;
		this.selected = 0;
		if (value.trim()) this.browser?.suggest(value);
	}

	protected override firstUpdated() {
		const input = this.renderRoot.querySelector("input");
		if (!input) return;
		input.value = this.query;
		input.focus();
		input.select();
	}

	protected override updated(changed: Map<string, unknown>) {
		if (changed.has("selected")) {
			this.renderRoot.querySelector(".result.on")?.scrollIntoView({ block: "nearest" });
		}
		// The field is set here rather than bound, so the completion can follow the caret, selected, and so a render
		// that changes nothing leaves the caret where the person put it.
		const input = this.renderRoot.querySelector("input");
		const shown = this.query + this.shownInline;
		if (input && input.value !== shown) {
			input.value = shown;
			input.setSelectionRange(this.query.length, shown.length);
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
		const query = untouched ? "" : this.query;
		const context = {
			suggestions: this.suggestions.list,
			suggestionsFor: this.suggestions.for,
			links: this.links,
			pinned: this.pinned,
			sound: this.sound,
			inlineOff: this.inlineOff,
		};
		const results = commandResults(this.state, query, context);
		if (untouched) {
			const url = this.initialQuery;
			results.unshift({ kind: "go", url, icon: "globe", label: `Go to ${hostOf(url)}`, detail: url, group: "" });
		}
		const selected = Math.min(this.selected, results.length - 1);
		this.shownInline = inlineCompletion(this.state, query, context, selected);
		let lastGroup = "";
		return html`
			<div class="scrim" @click=${() => void this.close()}></div>
			<div class="panel" role="dialog" aria-label="Command bar">
				<div class="input">
					<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="m13 13 3.5 3.5" /></svg>
					<input
						placeholder=${this.mode === "focus-location" ? "Go to an address or search" : "Search, enter an address, or find a tab"}
						aria-label="Search or enter address"
						role="combobox"
						aria-expanded="true"
						aria-controls="results"
						aria-activedescendant="result-${selected}"
						autocomplete="off"
						spellcheck="false"
						@input=${(e: InputEvent) => this.onInput(e)}
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
									${space ? html`${planet(space.planet, space.hue, 14)}` : nothing}<span class="detail-text">${keys(r.detail)}</span>
								</span>
								<kbd aria-hidden="true">↵</kbd>
							</div>`;
					})}
				</div>
			</div>
		`;
	}

	static override styles = css`
		/* Zen's palette: one tall rounded field on a softly tinted, frosted panel, the results under it in the same
		   panel, and a deep, soft shadow instead of a dark scrim. */
		:host {
			position: absolute;
			inset: 0;
			z-index: 20;
			display: grid;
			justify-items: center;
			align-content: start;
			padding-top: 18vh;
			font: 14px/1.4 system-ui, "Segoe UI", sans-serif;
			color: var(--loka-ink);
		}
		/* The whole page in the browser's floating window (about 680x520, transparent): the bar fills its width with
		   room for its shadow, and the list fills what's left of its height. */
		:host([layout="page"]) {
			position: fixed;
			padding-top: 16px;
		}
		.scrim {
			position: absolute;
			inset: 0;
			background: color-mix(in srgb, var(--loka-scrim) 45%, transparent);
		}
		:host([layout="page"]) .scrim {
			background: transparent;
		}
		/* Frosted glass: the dialog surface, tinted by the space's hue, at about three quarters so what's behind shows
		   through blurred and a little more saturated. The edge is a hairline inside the panel, light on dark and dark
		   on light (--loka-line is both). The blur radius is never animated: it's costly on every frame. */
		.panel {
			position: relative;
			box-sizing: border-box;
			width: min(680px, calc(100% - 24px));
			padding: 8px;
			border-radius: 20px;
			background: color-mix(
				in srgb,
				color-mix(in srgb, var(--loka-dialog) 90%, hsl(var(--hue) 70% 55%)) 76%,
				transparent
			);
			backdrop-filter: blur(24px) saturate(1.6);
			box-shadow:
				inset 0 0 0 1px var(--loka-line),
				0 20px 56px -16px rgb(0 0 0 / 0.4),
				0 6px 16px -8px rgb(0 0 0 / 0.2);
			overflow: hidden;
		}
		/* The browser's floating window has nothing behind the page to blur (the web page under it is another
		   window), so glass there would only let text show through sharp. It's near solid instead. */
		:host([layout="page"]) .panel {
			width: calc(100% - 40px);
			background: color-mix(in srgb, var(--loka-dialog) 94%, hsl(var(--hue) 70% 55%));
			box-shadow:
				inset 0 0 0 1px var(--loka-line),
				0 12px 28px rgb(0 0 0 / 0.3);
		}
		@supports not (backdrop-filter: blur(1px)) {
			.panel {
				background: color-mix(in srgb, var(--loka-dialog) 94%, hsl(var(--hue) 70% 55%));
			}
		}
		@media (prefers-reduced-transparency: reduce) {
			.panel {
				background: color-mix(in srgb, var(--loka-dialog) 94%, hsl(var(--hue) 70% 55%));
				backdrop-filter: none;
			}
		}
		svg {
			width: 18px;
			height: 18px;
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
			height: 54px;
			padding: 0 12px 0 16px;
			border-radius: 14px;
			background: var(--loka-fill);
			/* A soft inner glow in the space's color. */
			box-shadow:
				inset 0 0 0 1px color-mix(in srgb, var(--loka-accent) 35%, transparent),
				inset 0 0 18px color-mix(in srgb, var(--loka-accent) 12%, transparent);
			color: var(--loka-ink-2);
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
			background: var(--loka-text-selection);
		}
		.mode,
		kbd {
			flex: none;
			font: 12px system-ui, "Segoe UI", sans-serif;
			color: var(--loka-ink-2);
			padding: 2px 7px;
			border-radius: 6px;
			background: var(--loka-fill-hover);
		}
		/* Every row keeps the Enter key's room, shown only on the selected one, so moving never shifts the details. */
		.mode {
			font-size: 13px;
			color: var(--loka-ink);
		}
		kbd {
			padding: 1px 6px;
			color: var(--loka-ink);
			visibility: hidden;
		}
		.result.on kbd {
			visibility: visible;
		}
		/* The list fades at an edge while there's more to scroll past it. */
		.results {
			max-height: min(52vh, 460px);
			overflow-y: auto;
			padding: 4px 0 0;
			overscroll-behavior: contain;
			scrollbar-width: thin;
			--fade-top: 0px;
			--fade-bottom: 0px;
			mask-image: linear-gradient(
				to bottom,
				transparent,
				#000 var(--fade-top),
				#000 calc(100% - var(--fade-bottom)),
				transparent
			);
			animation:
				fade-top linear both,
				fade-bottom linear both;
			animation-timeline: scroll(self), scroll(self);
			animation-range:
				0 24px,
				calc(100% - 24px) 100%;
		}
		@keyframes fade-top {
			from {
				--fade-top: 0px;
			}
			to {
				--fade-top: 24px;
			}
		}
		@keyframes fade-bottom {
			from {
				--fade-bottom: 24px;
			}
			to {
				--fade-bottom: 0px;
			}
		}
		:host([layout="page"]) .results {
			max-height: calc(100vh - 54px - 16px - 52px);
		}
		.results:empty {
			display: none;
		}
		.group {
			margin: 10px 14px 4px;
			font-size: 13px;
			font-weight: 600;
			letter-spacing: 0.02em;
			color: var(--loka-ink-3);
		}
		.result {
			display: flex;
			align-items: center;
			gap: 12px;
			height: 44px;
			padding: 0 10px 0 14px;
			border-radius: 22px;
		}
		/* Rows are flat; the selected one sits on a soft pill of the space's accent, which reads on light glass and
		   dark glass alike (the light theme's white card would vanish on a white panel). */
		.result.on {
			background: color-mix(in srgb, var(--loka-accent) 16%, transparent);
		}
		.icon {
			display: grid;
			place-items: center;
			width: 22px;
			flex: none;
			color: var(--loka-ink-2);
		}
		.result.on .icon {
			color: var(--loka-accent-ink);
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
			font-size: 15px;
		}
		.detail {
			display: flex;
			align-items: center;
			gap: 6px;
			max-width: 42%;
			min-width: 0;
			font-size: 13px;
			color: var(--loka-ink-3);
		}
		.detail-text {
			min-width: 0;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		/* Meta text on the lit row steps up a tone, so it keeps its contrast on the lighter background. */
		.result.on .detail {
			color: var(--loka-ink-2);
		}
		@media (max-width: 420px) {
			.detail {
				display: none;
			}
		}
		@media (prefers-reduced-motion: no-preference) {
			.scrim {
				transition: opacity 140ms ease-out;
				@starting-style {
					opacity: 0;
				}
			}
			/* A quick scale and fade, from close to full size, so it reads from the first frame. */
			.panel {
				transition:
					opacity 140ms cubic-bezier(0.2, 0, 0, 1),
					transform 140ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
					transform: scale(0.97);
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
