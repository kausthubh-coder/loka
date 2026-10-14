import { css, html, LitElement } from "lit";
import type { Update } from "../../app/loka-app";
import { hostOf } from "../sidebar/favicon";
import { openTab } from "../sidebar/sidebar.logic";
import { isSearch, toUrl } from "./command-bar.logic";

/** The Ctrl+K bar. For now it only opens new tabs; searching tabs and commands comes later. */
export class LokaCommandBar extends LitElement {
	static override properties = {
		apply: { attribute: false },
	};

	declare apply: Update;

	private close() {
		this.dispatchEvent(new CustomEvent("loka-close", { bubbles: true, composed: true }));
	}

	private submit(e: Event) {
		e.preventDefault();
		const value = (this.renderRoot.querySelector("input") as HTMLInputElement).value;
		if (!value.trim()) return;
		const url = toUrl(value);
		const title = isSearch(url) ? value.trim() : hostOf(url);
		this.apply((s) => openTab(s, url, title));
		this.close();
	}

	protected override firstUpdated() {
		this.renderRoot.querySelector("input")?.focus();
	}

	override render() {
		return html`
			<div class="scrim" @click=${() => this.close()}></div>
			<form role="dialog" aria-label="Open a tab" @submit=${this.submit}>
				<input
					placeholder="Search or enter address"
					aria-label="Search or enter address"
					@keydown=${(e: KeyboardEvent) => e.key === "Escape" && this.close()}
				/>
			</form>
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
			padding-top: 18vh;
		}
		.scrim {
			position: absolute;
			inset: 0;
			background: #0006;
		}
		form {
			position: relative;
			width: min(600px, 80vw);
		}
		input {
			width: 100%;
			box-sizing: border-box;
			height: 52px;
			padding: 0 18px;
			font: 17px system-ui;
			color: #ececf1;
			border: 0;
			border-radius: 14px;
			outline: none;
			background: hsl(var(--hue) 22% 13% / 0.97);
			box-shadow:
				0 0 0 1px hsl(var(--hue) 60% 75% / 0.35),
				0 24px 64px #000a;
		}
		input::placeholder {
			color: #a7a8b4;
		}
	`;
}

customElements.define("loka-command-bar", LokaCommandBar);
