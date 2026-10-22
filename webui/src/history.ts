// Loka's Library: chrome://history (Ctrl+H), served from history.html. One page for the spaces, archived tabs,
// history and downloads; the address's hash picks the section (#spaces, #archive, #downloads, none for History).
// History comes from the page's own handler (history-bridge.ts); the spaces and downloads from the sidebar's handler,
// which the browser attaches here too (bridge.ts, store.ts). The page takes the current space's color and light or
// dark, and shows its sky.

import { css, html, LitElement } from "lit";
import type { Act } from "../../prototype/src/app/loka-app";
import { skyLayer, skyStyles } from "../../prototype/src/app/sky";
import { themeTokens } from "../../prototype/src/app/theme";
import { resolveScheme } from "../../prototype/src/app/theme.logic";
import { type Section, sectionFromHash, sectionTitle } from "../../prototype/src/features/library/library.logic";
import "../../prototype/src/features/library/loka-library";
import { setFaviconSource } from "../../prototype/src/features/sidebar/favicon";
import { activeSpace, type BrowserState } from "../../prototype/src/features/sidebar/sidebar.logic";
import { browser } from "./bridge";
import { faviconUrl } from "./favicon-url";
import { history } from "./history-bridge";
import { act, readState, watch } from "./store";

setFaviconSource(faviconUrl);

const darkSystem = matchMedia("(prefers-color-scheme: dark)");

export class LokaLibraryPage extends LitElement {
	static override properties = {
		section: { state: true },
		state: { state: true },
		systemDark: { state: true },
	};

	section: Section = sectionFromHash(location.hash);
	/** The spaces, once the browser has answered. History needs none of this, so it shows at once. */
	state: BrowserState | null = null;
	systemDark = darkSystem.matches;

	private act: Act = (intent) => {
		const next = act(intent);
		if (next) this.state = next;
	};

	override connectedCallback() {
		super.connectedCallback();
		void readState().then((state) => {
			this.state = state;
		});
		watch(({ state }) => {
			if (state) this.state = state;
		});
		// The switcher, Back and Forward, and the browser opening chrome://history/#spaces on this tab.
		window.addEventListener("hashchange", () => {
			this.section = sectionFromHash(location.hash);
		});
		darkSystem.addEventListener("change", (e) => {
			this.systemDark = e.matches;
		});
	}

	override render() {
		const space = this.state ? activeSpace(this.state) : null;
		// Loka blue in the system's light or dark until the spaces arrive.
		const hue = space?.hue ?? 200;
		const scheme = resolveScheme(space?.scheme ?? "system", this.systemDark);
		document.documentElement.style.colorScheme = scheme;
		document.title = sectionTitle(this.section);
		return html`<div
			class="page theme-${scheme}"
			style="--hue: ${hue}"
			@loka-library-section=${(e: CustomEvent<Section>) => {
				location.hash = e.detail;
			}}
		>
			${skyLayer(hue, scheme, "still")}
			<loka-library
				.section=${this.section}
				.state=${this.state}
				.act=${this.act}
				.historyBridge=${history}
				.browser=${browser}
			></loka-library>
		</div>`;
	}

	static override styles = [
		themeTokens,
		skyStyles,
		css`
			:host {
				display: block;
				height: 100vh;
			}
			/* The page is the window's height and each section scrolls inside it, so the sky stays put behind. */
			.page {
				position: relative;
				isolation: isolate;
				height: 100%;
				overflow: hidden;
			}
		`,
	];
}

// The tag is still History's, as history.html has it, so this page also runs in a browser built before the Library
// (verify's --webui=checkout swaps in this checkout's code but keeps the browser's history.html).
customElements.define("loka-history-page", LokaLibraryPage);
