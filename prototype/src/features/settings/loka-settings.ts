import { css, html, LitElement } from "lit";
import { SIDEBAR_MAX, SIDEBAR_MIN, type UiPrefs } from "../../app/ui-prefs.logic";
import { planet } from "../sidebar/planet";
import { type BrowserState, countTabs } from "../sidebar/sidebar.logic";

export type SetUi = (change: Partial<UiPrefs>) => void;

const SHORTCUTS: [string, string][] = [
	["Ctrl K", "Command bar: open, search, find a tab, run a command"],
	["Ctrl 1 to 9", "Go to a space"],
	["Ctrl S", "Hide or show the sidebar"],
	["Ctrl E", "Close the tab (Ctrl W in the real browser)"],
	["Swipe sideways", "Next or previous space"],
];

/**
 * loka://settings. Appearance and Spaces work in the prototype; Privacy and Search show what the real browser will
 * offer and only remember their switches until reload.
 */
export class LokaSettings extends LitElement {
	static override properties = {
		state: { attribute: false },
		ui: { attribute: false },
		setUi: { attribute: false },
		privacy: { state: true },
		engine: { state: true },
	};

	declare state: BrowserState;
	declare ui: UiPrefs;
	declare setUi: SetUi;
	privacy = { ads: true, clearOnExit: false };
	engine = "DuckDuckGo";

	private editSpace(spaceId: string) {
		this.dispatchEvent(new CustomEvent("loka-edit-space", { detail: spaceId, bubbles: true, composed: true }));
	}

	private toggle(label: string, on: boolean, change: (on: boolean) => void, disabled = false) {
		return html`<button
			class="switch ${on ? "on" : ""}"
			role="switch"
			aria-checked=${on}
			aria-label=${label}
			?disabled=${disabled}
			@click=${() => change(!on)}
		></button>`;
	}

	override render() {
		const ui = this.ui;
		return html`
			<div class="page">
				<h1>Settings</h1>

				<section aria-labelledby="appearance">
					<h2 id="appearance">Appearance</h2>
					<div class="row">
						<div><b>Sidebar side</b><small>Where the sidebar sits in the window</small></div>
						<div class="segmented" role="radiogroup" aria-label="Sidebar side">
							${(["left", "right"] as const).map(
								(side) => html`<button
									role="radio"
									aria-checked=${ui.sidebarSide === side}
									class=${ui.sidebarSide === side ? "on" : ""}
									@click=${() => this.setUi({ sidebarSide: side })}
								>
									${side === "left" ? "Left" : "Right"}
								</button>`,
							)}
						</div>
					</div>
					<div class="row">
						<div><b>Sidebar width</b><small>Or drag the sidebar's edge. Double-click the edge to reset.</small></div>
						<label class="range">
							<input
								type="range"
								min=${SIDEBAR_MIN}
								max=${SIDEBAR_MAX}
								.value=${String(ui.sidebarWidth)}
								aria-label="Sidebar width"
								@input=${(e: Event) => this.setUi({ sidebarWidth: Number((e.target as HTMLInputElement).value) })}
							/>
							<span>${ui.sidebarWidth}&nbsp;px</span>
						</label>
					</div>
					<div class="row">
						<div><b>Hide the sidebar</b><small>It slides in when the pointer reaches the window's edge. Ctrl+S.</small></div>
						${this.toggle("Hide the sidebar", ui.sidebarHidden, (on) => this.setUi({ sidebarHidden: on }))}
					</div>
				</section>

				<section aria-labelledby="spaces">
					<h2 id="spaces">Spaces</h2>
					${this.state.spaces.map(
						(s, i) => html`<div class="row space">
							${planet(s.planet, s.hue, 30)}
							<div><b>${s.name}</b><small>${countTabs(s)} tabs. Ctrl+${i + 1}</small></div>
							<button class="button" @click=${() => this.editSpace(s.id)}>Edit</button>
						</div>`,
					)}
					<button
						class="button add"
						@click=${() => this.dispatchEvent(new CustomEvent("loka-action", { detail: "new-space", bubbles: true, composed: true }))}
					>
						New space
					</button>
				</section>

				<section aria-labelledby="privacy">
					<h2 id="privacy">Privacy</h2>
					<div class="row">
						<div><b>Block ads and trackers</b><small>uBlock Origin, built in from Helium</small></div>
						${this.toggle("Block ads and trackers", this.privacy.ads, (on) => {
							this.privacy = { ...this.privacy, ads: on };
						})}
					</div>
					<div class="row">
						<div><b>No Google services</b><small>Removed at build time, so there is nothing to turn on</small></div>
						${this.toggle("No Google services", true, () => {}, true)}
					</div>
					<div class="row">
						<div><b>Clear cookies when Loka closes</b><small>Sites you pin keep theirs</small></div>
						${this.toggle("Clear cookies when Loka closes", this.privacy.clearOnExit, (on) => {
							this.privacy = { ...this.privacy, clearOnExit: on };
						})}
					</div>
				</section>

				<section aria-labelledby="search">
					<h2 id="search">Search</h2>
					<div class="row">
						<div><b>Search engine</b><small>Used by the command bar</small></div>
						<select
							aria-label="Search engine"
							@change=${(e: Event) => {
								this.engine = (e.target as HTMLSelectElement).value;
							}}
						>
							${["DuckDuckGo", "Brave Search", "Startpage", "Kagi"].map(
								(name) => html`<option ?selected=${name === this.engine}>${name}</option>`,
							)}
						</select>
					</div>
				</section>

				<section aria-labelledby="keys">
					<h2 id="keys">Keyboard shortcuts</h2>
					${SHORTCUTS.map(([keys, what]) => html`<div class="row keys"><kbd>${keys}</kbd><span>${what}</span></div>`)}
				</section>

				<section aria-labelledby="about">
					<h2 id="about">About</h2>
					<dl>
						<dt>Loka</dt>
						<dd>Prototype, not a release</dd>
						<dt>Based on</dt>
						<dd>Helium 0.19.2.1, Chromium 155.0.8059.39</dd>
						<dt>License</dt>
						<dd>GPL-3.0</dd>
					</dl>
				</section>
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
			max-width: 640px;
			margin: 0 auto;
			padding: 48px 32px 80px;
		}
		h1 {
			margin: 0 0 28px;
			font-size: 28px;
			font-weight: 650;
		}
		h2 {
			margin: 36px 0 8px;
			font-size: 15px;
			font-weight: 600;
			color: hsl(var(--hue) 80% 78%);
		}
		.row {
			display: flex;
			align-items: center;
			gap: 14px;
			min-height: 56px;
			padding: 8px 0;
			border-bottom: 1px solid hsl(var(--hue) 30% 85% / 0.08);
		}
		.row > div {
			flex: 1;
			display: grid;
		}
		.row b {
			font-weight: 550;
		}
		small {
			color: #a3a5b2;
			font-size: 13px;
		}
		button,
		select {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
		}
		.segmented {
			display: flex;
			padding: 3px;
			border-radius: 10px;
			background: hsl(var(--hue) 30% 85% / 0.08);
		}
		.segmented button {
			min-width: 64px;
			height: 30px;
			border-radius: 8px;
		}
		.segmented button.on {
			background: hsl(var(--hue) 40% 85% / 0.18);
			font-weight: 600;
		}
		.range {
			display: flex;
			align-items: center;
			gap: 10px;
			font-variant-numeric: tabular-nums;
			color: #c9cad4;
		}
		input[type="range"] {
			width: 150px;
			accent-color: hsl(var(--hue) 80% 70%);
		}
		.switch {
			flex: none;
			position: relative;
			width: 40px;
			height: 24px;
			border-radius: 12px;
			background: hsl(var(--hue) 20% 85% / 0.18);
		}
		.switch::after {
			content: "";
			position: absolute;
			top: 3px;
			left: 3px;
			width: 18px;
			height: 18px;
			border-radius: 50%;
			background: #fff;
			transition: translate 160ms cubic-bezier(0.2, 0, 0, 1);
		}
		.switch.on {
			background: hsl(var(--hue) 75% 62%);
		}
		.switch.on::after {
			translate: 16px 0;
		}
		.switch:disabled {
			opacity: 0.55;
		}
		.button {
			height: 32px;
			padding: 0 14px;
			border-radius: 8px;
			background: hsl(var(--hue) 30% 85% / 0.1);
		}
		.button:hover {
			background: hsl(var(--hue) 30% 85% / 0.16);
		}
		.button.add {
			margin-top: 12px;
		}
		.space svg {
			flex: none;
		}
		select {
			height: 34px;
			padding: 0 10px;
			border-radius: 8px;
			background: hsl(var(--hue) 30% 85% / 0.1);
		}
		option {
			background: #1b1d24;
		}
		.keys {
			min-height: 44px;
		}
		kbd {
			min-width: 130px;
			font: 12px system-ui;
			color: #d6d7df;
		}
		dl {
			display: grid;
			grid-template-columns: 120px 1fr;
			gap: 8px;
			margin: 12px 0 0;
		}
		dt {
			color: #a3a5b2;
		}
		dd {
			margin: 0;
		}
		:focus-visible {
			outline: 2px solid hsl(var(--hue) 85% 72%);
			outline-offset: 2px;
		}
		@media (prefers-reduced-motion: reduce) {
			.switch::after {
				transition: none;
			}
		}
	`;
}

customElements.define("loka-settings", LokaSettings);
