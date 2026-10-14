import { css, html, LitElement } from "lit";
import { faviconColor, faviconLetter, hostOf } from "../sidebar/favicon";
import type { Tab } from "../sidebar/sidebar.logic";

/** Stands in for the web view. In the real browser Chromium renders the page here. */
export class LokaPage extends LitElement {
	static override properties = {
		tab: { attribute: false },
		spaceName: { attribute: false },
	};

	declare tab: Tab | null;
	declare spaceName: string;

	override render() {
		const tab = this.tab;
		if (!tab) {
			return html`<section class="frame empty">
				<p class="hint">Nothing open in ${this.spaceName}.</p>
				<p class="keys">Press <kbd>Ctrl K</kbd> to open a tab, <kbd>Ctrl 1–9</kbd> to switch spaces.</p>
			</section>`;
		}
		return html`
			<section class="frame">
				<header>
					<span class="fav" aria-hidden="true" style="--fav: ${faviconColor(tab.url)}">${faviconLetter(tab.url)}</span>
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
		.frame.empty {
			display: grid;
			place-content: center;
			text-align: center;
			background: hsl(var(--hue) 25% 10% / 0.6);
			color: #c9cad4;
		}
		.hint {
			font-size: 16px;
			margin: 0 0 6px;
			color: #ececf1;
		}
		.keys {
			margin: 0;
		}
		kbd {
			font: 12px system-ui;
			padding: 1px 6px;
			border-radius: 5px;
			background: hsl(var(--hue) 30% 85% / 0.12);
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
