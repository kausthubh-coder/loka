// Loka's empty tab: what chrome://newtab shows (newtab.html at chrome://loka-newtab, answered by the sidebar's
// handler). Loka has no new tab page; the command bar is the new tab. A window shows this only when it has nothing
// else to show (a new window, a space with no tabs, its last tab closed), so it is the space's sky and nothing more.
// Typing on it opens the command bar. A click doesn't: clicking the page is how the floating bar is dismissed.

import { css, html, LitElement, nothing } from "lit";
import { skyLayer, skyStyles } from "../../prototype/src/app/sky";
import { themeTokens } from "../../prototype/src/app/theme";
import { resolveScheme } from "../../prototype/src/app/theme.logic";
import { activeSpace, type BrowserState } from "../../prototype/src/features/sidebar/sidebar.logic";
import { browser } from "./bridge";
import { readState, watch } from "./store";

const darkSystem = matchMedia("(prefers-color-scheme: dark)");

export class LokaNewTabPage extends LitElement {
	static override properties = {
		state: { state: true },
		systemDark: { state: true },
	};

	state: BrowserState | null = null;
	systemDark = darkSystem.matches;

	override connectedCallback() {
		super.connectedCallback();
		void readState().then((state) => {
			this.state = state;
		});
		// Switching from one empty space to another keeps this tab; it takes the new space's sky.
		watch(({ state }) => {
			if (state) this.state = state;
		});
		darkSystem.addEventListener("change", (e) => {
			this.systemDark = e.matches;
		});
		window.addEventListener("keydown", this.onKey);
	}

	/** A character or Enter opens the bar; the browser keeps its shortcuts. */
	private onKey = (e: KeyboardEvent) => {
		if (e.ctrlKey || e.altKey || e.metaKey) return;
		if (e.key.length === 1 || e.key === "Enter") browser.openCommandBar("new-tab");
	};

	override render() {
		const state = this.state;
		if (!state) return nothing;
		const space = activeSpace(state);
		const scheme = resolveScheme(space.scheme, this.systemDark);
		document.documentElement.style.colorScheme = scheme;
		return html`<div class="page theme-${scheme}" style="--hue: ${space.hue}">${skyLayer(space.hue, scheme)}</div>`;
	}

	static override styles = [
		themeTokens,
		skyStyles,
		css`
			:host {
				display: block;
				height: 100vh;
			}
			.page {
				position: relative;
				isolation: isolate;
				height: 100%;
				overflow: clip;
			}
		`,
	];
}

customElements.define("loka-new-tab-page", LokaNewTabPage);
