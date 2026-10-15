import { css, html, LitElement } from "lit";
import type { HistoryBridge } from "../../../../webui/src/history-bridge";
import type { Update } from "../../app/loka-app";
import type { UiPrefs } from "../../app/ui-prefs.logic";
import "../history/loka-history";
import "../settings/loka-settings";
import type { SetUi } from "../settings/loka-settings";
import { faviconBackground, faviconInner, hostOf } from "../sidebar/favicon";
import type { BrowserState, Tab } from "../sidebar/sidebar.logic";

/** Stands in for the web view. In the real browser Chromium renders the page here; loka:// pages are Loka's own. */
export class LokaPage extends LitElement {
	static override properties = {
		tab: { attribute: false },
		spaceName: { attribute: false },
		state: { attribute: false },
		apply: { attribute: false },
		ui: { attribute: false },
		setUi: { attribute: false },
		pinned: { attribute: false },
		scheme: { reflect: true },
		historyBridge: { attribute: false },
	};

	declare tab: Tab | null;
	declare spaceName: string;
	declare state: BrowserState;
	declare apply: Update;
	declare ui: UiPrefs;
	declare setUi: SetUi;
	declare pinned: boolean;
	/** Where the stand-in History page (loka://history) gets its visits: the prototype's fake. */
	declare historyBridge: HistoryBridge;
	/** Web pages follow the scheme the space asked the browser for, as they would through prefers-color-scheme. */
	scheme: "light" | "dark" = "light";

	override render() {
		const tab = this.tab;
		if (tab?.url === "loka://settings") {
			return html`<section class="frame inside">
				<loka-settings
					.state=${this.state}
					.apply=${this.apply}
					.ui=${this.ui}
					.setUi=${this.setUi}
					.pinned=${this.pinned}
				></loka-settings>
			</section>`;
		}

		if (tab?.url === "loka://history") {
			return html`<section class="frame inside history">
				<loka-history .bridge=${this.historyBridge}></loka-history>
			</section>`;
		}

		if (!tab) {
			return html`<section class="frame empty">
				<p class="hint">Nothing open in ${this.spaceName}.</p>
				<p class="keys">Press <kbd>Ctrl K</kbd> to open a tab, <kbd>Ctrl 1–9</kbd> to switch spaces.</p>
			</section>`;
		}
		return html`
			<section class="frame">
				<header>
					<span class="fav" aria-hidden="true" style="--fav: ${faviconBackground(tab.url)}">${faviconInner(tab.url)}</span>
					<div>
						<h1>${tab.title}</h1>
						<p class="url">${hostOf(tab.url)}</p>
					</div>
				</header>
				<div class="skeleton" aria-hidden="true">
					<span style="width: 72%"></span>
					<span style="width: 88%"></span>
					<span style="width: 64%"></span>
					<span class="block"></span>
					<span style="width: 80%"></span>
					<span style="width: 52%"></span>
				</div>
			</section>
		`;
	}

	static override styles = css`
		:host {
			display: block;
			min-width: 0;
			padding: 8px 8px 8px 0;
		}
		.frame {
			height: 100%;
			box-sizing: border-box;
			border-radius: 12px;
			background: #f7f7f9;
			color: #1b1b22;
			padding: 48px 56px;
			box-shadow:
				0 0 0 1px hsl(var(--hue) 40% 80% / 0.12),
				0 20px 60px #0006;
			overflow: hidden;
		}
		/* A web page in a dark space, following prefers-color-scheme. */
		:host([scheme="dark"]) .frame:not(.inside, .empty) {
			background: #17181c;
			color: #e6e6ea;
		}
		:host([scheme="dark"]) .skeleton span {
			background: #2a2b31;
		}
		:host([scheme="dark"]) .url {
			color: #9a9ba6;
		}
		/* Loka's own pages sit on the sky instead of a white web page. */
		.frame.inside {
			padding: 0;
			background: hsl(var(--hue) 25% 9% / 0.82);
			color: #e6e7ee;
		}
		.frame.history {
			overflow-y: auto;
			--history-bg: hsl(var(--hue) 25% 9%);
		}
		:host([scheme="light"]) .frame.history {
			background: hsl(var(--hue) 50% 96% / 0.9);
			color: var(--loka-ink);
			--history-bg: hsl(var(--hue) 50% 96%);
		}
		.frame.empty {
			display: grid;
			place-content: center;
			text-align: center;
			background: var(--loka-fill);
			box-shadow: inset 0 0 0 1px var(--loka-line);
			color: var(--loka-ink-2);
		}
		.hint {
			font-size: 16px;
			margin: 0 0 6px;
			color: var(--loka-ink);
		}
		.keys {
			margin: 0;
		}
		kbd {
			font: 12px system-ui;
			padding: 1px 6px;
			border-radius: 5px;
			background: var(--loka-fill-hover);
		}
		header {
			display: flex;
			gap: 16px;
			align-items: center;
			margin-bottom: 40px;
		}
		.fav {
			display: grid;
			place-items: center;
			width: 44px;
			height: 44px;
			border-radius: 12px;
			background: var(--fav);
			font-weight: 700;
			font-size: 22px;
			color: #0b0c10;
		}
		h1 {
			margin: 0;
			font-size: 24px;
			line-height: 1.2;
		}
		.url {
			margin: 4px 0 0;
			color: #5d5e6b;
			font-size: 14px;
		}
		.skeleton {
			display: grid;
			gap: 14px;
			max-width: 640px;
		}
		.skeleton span {
			height: 12px;
			border-radius: 6px;
			background: #e4e4ea;
		}
		.skeleton .block {
			height: 160px;
			border-radius: 10px;
			margin: 10px 0;
		}
	`;
}

customElements.define("loka-page", LokaPage);
